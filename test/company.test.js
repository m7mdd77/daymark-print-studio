import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ledger, verify } from "../src/ledger.js";
import { CompanyRunner } from "../src/company.js";
import { metrics, replay } from "../src/domain.js";
import { roleMessages } from "../src/roles.js";
function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "daymark-")),
    ledger = new Ledger(join(dir, "test.sqlite"));
  t.after(() => {
    ledger.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return ledger;
}
const companyId = "test-company-one";
function fixtureInfer(calls = []) {
  return async (role, s) => {
    calls.push({ role, state: structuredClone(s) });
    let actions = [{ type: "wait" }];
    if (role === "sales" && s.day === 0)
      actions = [
        { type: "accept_lead", leadId: "L201", price: 18000 },
        {
          type: "escalate",
          leadId: "L202",
          reason: "The original rush promise needs an owner.",
        },
      ];
    if (role === "production") {
      actions = [];
      if (s.day === 0)
        actions.push({ type: "buy_express", paper: "premium", quantity: 80 });
      const orders = s.orders
        .filter((o) => o.status === "queued" && o.due <= s.day)
        .map((o) => o.id);
      if (orders.length) actions.push({ type: "print", orderIds: orders });
      if (!actions.length) actions = [{ type: "wait" }];
    }
    if (role === "finance") {
      actions = [];
      const ids = s.orders
        .filter((o) => o.status === "printed" && !o.invoice)
        .map((o) => o.id);
      if (ids.length)
        actions.push(
          { type: "invoice", orderIds: ids },
          { type: "collect", orderIds: ids },
        );
      if (
        s.rejections.some((r) => r.leadId === "L202") &&
        !s.inbox.some((i) => i.leadId === "L202")
      )
        actions.push({
          type: "escalate",
          leadId: "L202",
          reason: "Sales made an invalid rush promise; owner review required.",
        });
      if (!actions.length) actions = [{ type: "wait" }];
    }
    return {
      model: "TEST DOUBLE — NOT LIVE AI",
      usage: { inputTokens: 0, outputTokens: 0 },
      plan: {
        reason: "A deterministic test fixture for shared-state assertions.",
        actions,
      },
    };
  };
}
test("three independent roles read preceding committed changes; stock self-corrects and finance collects", async (t) => {
  const ledger = setup(t),
    calls = [],
    runner = new CompanyRunner(ledger, fixtureInfer(calls));
  let c = await runner.run({
    companyId,
    jobId: "monday-fixture",
    scenario: "paper-delay",
  });
  assert.deepEqual(
    calls.map((c) => c.role),
    ["sales", "production", "finance"],
  );
  assert.equal(calls[1].state.orders.length, 4);
  assert.equal(calls[2].state.orders[0].status, "printed");
  assert.equal(c.state.shipments[0].eta, 3);
  assert.equal(c.state.stock.premium, 100);
  assert.equal(c.state.cash, 128700);
  assert.equal(c.state.revenue, 24000);
  assert.equal(c.state.inbox[0].status, "open");
  runner.resolve(companyId, "H1", "revised_quote");
  c = await runner.run({ companyId, jobId: "tuesday-fixture" });
  assert.equal(c.state.orders.find((o) => o.id === "D102").paid, true);
  assert.equal(c.state.orders.find((o) => o.id === "D102").printedDay, 1);
  assert.equal(c.state.revenue, 60000);
  assert.deepEqual(verify(c.events), c.state);
  assert.deepEqual(replay(c.events), c.state);
});
test("injected sales failure is refused; finance independently escalates while production continues", async (t) => {
  const ledger = setup(t),
    calls = [],
    runner = new CompanyRunner(ledger, fixtureInfer(calls));
  const c = await runner.run({
    companyId,
    jobId: "fault-fixture",
    scenario: "sales-slip",
  });
  assert.equal(c.state.orders.length, 3);
  assert.equal(c.state.rejections[0].injected, true);
  assert.equal(c.state.rejections[0].code, "margin");
  assert.equal(c.state.inbox[0].from, "finance");
  assert.equal(c.state.orders[0].paid, true);
  assert.equal(c.traces[0].plan.actions[0].leadId, "L201");
});
test("one role timing out is escalated, never replaced with canned action, and other roles still run", async (t) => {
  const ledger = setup(t),
    calls = [],
    base = fixtureInfer(calls),
    runner = new CompanyRunner(ledger, async (role, s) => {
      if (role === "production") throw Error("Injected provider timeout");
      return base(role, s);
    });
  const c = await runner.run({ companyId, jobId: "timeout-fixture" });
  assert.equal(c.state.health.production, "failed");
  assert.equal(
    c.state.orders.every((o) => !o.invoice),
    true,
  );
  assert.equal(c.state.revenue, 0);
  assert.equal(
    c.state.inbox.some((i) => i.from === "production" && !i.leadId),
    true,
  );
  assert.equal(
    c.traces.some((t) => t.role === "production"),
    false,
  );
  assert.equal(
    c.traces.some((t) => t.role === "finance"),
    true,
  );
});
test("rerunning a completed job returns its stored result without a second inference or payment", async (t) => {
  const ledger = setup(t),
    calls = [],
    runner = new CompanyRunner(ledger, fixtureInfer(calls));
  const a = await runner.run({ companyId, jobId: "same-job" }),
    b = await runner.run({ companyId, jobId: "same-job" });
  assert.equal(calls.length, 3);
  assert.deepEqual(a, b);
  assert.equal(b.state.day, 1);
});
test("hash chain catches changed history; replaying a prefix does not mutate current records", async (t) => {
  const ledger = setup(t),
    runner = new CompanyRunner(ledger, fixtureInfer());
  const c = await runner.run({ companyId, jobId: "integrity-fixture" }),
    past = replay(c.events, 3);
  assert.equal(past.day, 0);
  assert.equal(ledger.load(companyId).state.day, 1);
  const altered = structuredClone(c.events);
  altered[0].payload.name = "sales-slip";
  assert.throws(() => verify(altered), { code: "integrity" });
});
test("company records are isolated and model views have distinct role scopes", async (t) => {
  const ledger = setup(t),
    runner = new CompanyRunner(ledger, fixtureInfer());
  const c = await runner.run({ companyId, jobId: "isolation-fixture" });
  assert.equal(ledger.load("other-company-two").state.revenue, 0);
  const sales = JSON.parse(roleMessages("sales", c.state)[1].content),
    finance = JSON.parse(roleMessages("finance", c.state)[1].content);
  assert.equal("cash" in sales, false);
  assert.equal("stock" in finance, false);
  assert.equal(finance.cash, c.state.cash);
});
test("the full five-day loop closes with no backlog and replay reconstructs every figure", async (t) => {
  const ledger = setup(t),
    runner = new CompanyRunner(ledger, fixtureInfer());
  let c;
  for (let day = 0; day < 5; day++) {
    c = await runner.run({ companyId, jobId: "week-fixture-" + day });
    if (day === 0) runner.resolve(companyId, "H1", "revised_quote");
  }
  assert.equal(c.state.closed, true);
  assert.equal(metrics(c.state).backlog, 0);
  assert.equal(c.state.revenue, 120000);
  assert.equal(c.state.daySummaries.length, 5);
  assert.deepEqual(verify(c.events), c.state);
});
test("interrupted worker recovery preserves committed actions and closes the old job without replaying it", (t) => {
  const ledger = setup(t);
  ledger.startJob("crashed-job", companyId);
  ledger.event(companyId, "sales", "role_started", {});
  ledger.event(companyId, "sales", "action", {
    action: { type: "accept_lead", leadId: "L201", price: 18000 },
  });
  const c = ledger.recoverStale(companyId, Date.now() + 241000);
  assert.equal(c.busy, false);
  assert.equal(c.state.orders.length, 4);
  assert.equal(c.state.health.sales, "failed");
  assert.equal(c.state.inbox.at(-1).from, "system");
  assert.deepEqual(verify(c.events), c.state);
  assert.equal(ledger.startJob("crashed-job", companyId).duplicate, true);
});
test("an ignored rejected promise is still routed to the owner by an explicit operating-rule event", async (t) => {
  const ledger = setup(t),
    base = fixtureInfer(),
    runner = new CompanyRunner(ledger, async (role, s) =>
      role === "finance"
        ? {
            model: "TEST DOUBLE",
            usage: {},
            plan: {
              reason: "A deliberately incomplete Finance reading.",
              actions: [{ type: "wait" }],
            },
          }
        : base(role, s),
    );
  const c = await runner.run({
    companyId,
    jobId: "missed-escalation-fixture",
    scenario: "sales-slip",
  });
  assert.equal(c.state.inbox[0].from, "system");
  assert.equal(c.state.inbox[0].leadId, "L202");
  assert.equal(
    c.events.some((e) => e.type === "review_required"),
    true,
  );
  assert.deepEqual(verify(c.events), c.state);
});
