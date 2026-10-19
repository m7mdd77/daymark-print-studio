import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { SqliteD1 } from "../src/sqlite-d1.js";
import { hosted } from "../src/hosted.js";
const origin = "https://daymark.example",
  token = "TEST-ONLY-SERVICE-CREDENTIAL-NOT-A-REAL-SECRET";

test("download is a real isolated attachment, including when AI is offline", async (t) => {
  const { invoke, open, db } = await setup(t);
  const a = await open(),
    b = await open();
  const row = db.db.prepare("SELECT id FROM visitors WHERE csrf=?").get(a.csrf);
  const view = structuredClone(a.view.company);
  view.state.cash = 160700;
  db.db
    .prepare("UPDATE visitors SET view=? WHERE id=?")
    .run(JSON.stringify(view), row.id);
  db.db.prepare("DELETE FROM service").run();
  const response = await invoke("/api/export", "GET", undefined, {
    Cookie: a.cookie,
  });
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="daymark-daybook.json"',
  );
  assert.equal((await response.json()).state.cash, 160700);
  const other = await invoke("/api/export", "GET", undefined, {
    Cookie: b.cookie,
  });
  assert.equal((await other.json()).state.cash, 120000);
});
async function setup(t) {
  const db = new SqliteD1(":memory:");
  db.exec(readFileSync("src/relay-schema.sql", "utf8"));
  t.after(() => db.close());
  const invoke = (path, method = "GET", data, headers = {}) =>
    hosted(
      new Request(origin + path, {
        method,
        headers: {
          ...(data ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      }),
      db,
      { DAYMARK_WORKER_TOKEN: token },
    );
  const open = async () => {
    const r = await invoke("/api/state"),
      v = await r.json();
    return {
      cookie: r.headers.get("set-cookie").split(";")[0],
      csrf: v.csrf,
      view: v,
    };
  };
  const worker = (path, data = {}) =>
    invoke("/api/worker/" + path, "POST", data, {
      Authorization: "Bearer " + token,
    });
  await worker("ping");
  return { db, invoke, open, worker };
}
test("public view uses isolated HttpOnly cookies and never returns the worker credential", async (t) => {
  const { open } = await setup(t),
    a = await open(),
    b = await open();
  assert.notEqual(a.cookie, b.cookie);
  assert.equal(a.view.company.state.cash, 120000);
  assert.equal(a.view.connected, true);
  assert.equal(JSON.stringify(a).includes(token), false);
});
test("CSRF, cross-origin requests, unknown operations and state injection cannot queue work", async (t) => {
  const { db, invoke, open } = await setup(t),
    a = await open(),
    command = {
      op: "run",
      version: 0,
      requestId: randomUUID(),
      scenario: "paper-delay",
    },
    headers = { Cookie: a.cookie, Origin: origin, "X-CSRF-Token": a.csrf };
  assert.equal(
    (
      await invoke("/api/command", "POST", command, {
        Cookie: a.cookie,
        Origin: origin,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await invoke("/api/command", "POST", command, {
        ...headers,
        Origin: "https://attacker.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await invoke(
        "/api/command",
        "POST",
        { ...command, op: "charge_card" },
        headers,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await invoke(
        "/api/command",
        "POST",
        { ...command, state: { cash: 999 } },
        headers,
      )
    ).status,
    400,
  );
  assert.equal(db.db.prepare("SELECT COUNT(*) n FROM work").get().n, 0);
});
test("claims require service authentication, are unique, and cannot be completed twice", async (t) => {
  const { invoke, open, worker } = await setup(t),
    a = await open(),
    id = randomUUID(),
    headers = { Cookie: a.cookie, Origin: origin, "X-CSRF-Token": a.csrf };
  assert.equal(
    (
      await invoke(
        "/api/command",
        "POST",
        { op: "run", version: 0, requestId: id, scenario: "paper-delay" },
        headers,
      )
    ).status,
    202,
  );
  assert.equal((await invoke("/api/worker/claim", "POST", {})).status, 401);
  const claim = await (await worker("claim")).json();
  assert.equal(claim.job.id, id);
  assert.equal((await (await worker("claim")).json()).job, null);
  assert.equal(
    (await worker("complete", { jobId: id, company: a.view.company })).status,
    200,
  );
  assert.equal(
    (await worker("complete", { jobId: id, company: a.view.company })).status,
    409,
  );
});
test("two visitors cannot reuse a job ID or submit concurrent days to the same company", async (t) => {
  const { invoke, open } = await setup(t),
    a = await open(),
    b = await open(),
    id = randomUUID(),
    send = (v, requestId) =>
      invoke(
        "/api/command",
        "POST",
        { op: "run", version: 0, requestId, scenario: "paper-delay" },
        { Cookie: v.cookie, Origin: origin, "X-CSRF-Token": v.csrf },
      );
  assert.equal((await send(a, id)).status, 202);
  assert.equal((await send(b, id)).status, 409);
  assert.equal((await send(a, randomUUID())).status, 409);
  assert.equal((await send(a, id)).status, 200);
});
test("expired worker results are refused and public status preserves committed records", async (t) => {
  const { invoke, db, open, worker } = await setup(t),
    a = await open(),
    id = randomUUID();
  await invoke(
    "/api/command",
    "POST",
    { op: "run", version: 0, requestId: id, scenario: "paper-delay" },
    { Cookie: a.cookie, Origin: origin, "X-CSRF-Token": a.csrf },
  );
  await worker("claim");
  db.db
    .prepare("UPDATE work SET lease=?,created=? WHERE id=?")
    .run(Date.now() - 1, Date.now() - 240001, id);
  assert.equal(
    (await worker("complete", { jobId: id, company: a.view.company })).status,
    409,
  );
  const v = await (
    await invoke("/api/state", "GET", undefined, { Cookie: a.cookie })
  ).json();
  assert.equal(v.job.status, "failed");
  assert.equal(v.company.state.revenue, 0);
});
test("the shared hourly allowance is atomic across concurrent visitors", async (t) => {
  const { invoke, db, open } = await setup(t),
    visitors = await Promise.all(Array.from({ length: 12 }, () => open()));
  const results = await Promise.all(
    visitors.map((a) =>
      invoke(
        "/api/command",
        "POST",
        {
          op: "run",
          version: 0,
          requestId: randomUUID(),
          scenario: "paper-delay",
        },
        { Cookie: a.cookie, Origin: origin, "X-CSRF-Token": a.csrf },
      ),
    ),
  );
  assert.equal(results.filter((r) => r.status === 202).length, 8);
  assert.equal(
    db.db.prepare("SELECT COUNT(*) n FROM work WHERE kind='run'").get().n,
    8,
  );
});
test("reversed poll responses carry monotonic revisions even across a new-week version reset", async (t) => {
  const { invoke, open, worker } = await setup(t),
    a = await open(),
    id = randomUUID();
  await invoke(
    "/api/command",
    "POST",
    { op: "run", version: 0, requestId: id, scenario: "paper-delay" },
    { Cookie: a.cookie, Origin: origin, "X-CSRF-Token": a.csrf },
  );
  await worker("claim");
  const view = structuredClone(a.view.company);
  view.state.version = 20;
  await worker("progress", { jobId: id, company: view });
  const v1 = await (
    await invoke("/api/state", "GET", undefined, { Cookie: a.cookie })
  ).json();
  await worker("complete", { jobId: id, company: a.view.company });
  const v2 = await (
    await invoke("/api/state", "GET", undefined, { Cookie: a.cookie })
  ).json();
  assert.ok(v2.revision > v1.revision);
  assert.equal(v2.company.state.version, 0);
});
