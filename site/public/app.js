import {
  seed,
  DAYS,
  ROLES,
  PAPER,
  metrics,
  replay,
  describe,
  revisedDue,
} from "./domain.js";
const $ = (id) => document.getElementById(id),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    ),
  money = (n) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n / 100),
  exact = (n) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(n / 100);
let company = { state: seed(), events: [], traces: [], busy: false },
  csrf = "",
  connected = false,
  pending = false,
  cursor = null,
  selectedDay = null,
  playTimer = null,
  notice = "",
  failedJob = null,
  selectedOwner = null,
  initial = true,
  lastViewStamp = -1,
  lastJobId = null,
  lastJobStatus = null;
const state = () =>
  cursor === null ? company.state : replay(company.events, cursor);
function tell(message) {
  notice = message;
  renderNotice();
}
function renderNotice() {
  $("notice").textContent = notice;
  $("notice").hidden = !notice;
}
const active = () => pending || company.busy;
function eventDay() {
  return selectedDay ?? company.events.at(-1)?.day ?? 0;
}
function render() {
  const s = state(),
    m = metrics(s),
    isReplay = cursor !== null,
    busy = active();
  document.body.classList.toggle("has-ledger", company.events.length > 0);
  $("replay-top").disabled = !company.events.length || busy;
  $("replay-top").textContent = playTimer ? "Ⅱ Pause replay" : "▶ Replay day";
  $("hero-day").textContent = isReplay
    ? DAYS[eventDay()].toUpperCase() + " / REPLAY"
    : DAYS[s.day].toUpperCase();
  $("cash").textContent = money(m.cash);
  $("revenue").textContent = money(m.revenue);
  $("profit").textContent = money(m.profit);
  $("backlog").textContent =
    m.backlog + " " + (m.backlog === 1 ? "job" : "jobs");
  $("payments").innerHTML =
    esc(
      money(s.orders.filter((o) => o.paid).reduce((n, o) => n + o.price, 0)),
    ) + "<span>.00</span>";
  $("cost").textContent = exact(m.cost);
  $("connection").textContent = connected
    ? busy
      ? "The studio is working"
      : "Live team connected"
    : "Live team offline";
  $("connection-dot").className =
    "dot" + (connected ? " connected" : "") + (busy ? " busy" : "");
  $("run").disabled = !connected || busy || isReplay || s.closed || initial;
  $("run").innerHTML = busy
    ? "Team at work <span>◌</span>"
    : s.closed
      ? "Week complete <span>✓</span>"
      : "Run " + DAYS[s.day] + " <span>↗</span>";
  $("scenario").disabled = busy || Boolean(company.state.scenario) || isReplay;
  $("scenario").value = company.state.scenario || $("scenario").value;
  $("new-week").disabled = busy || initial || isReplay;
  $("download").setAttribute("aria-disabled", String(initial));
  $("replay-banner").hidden = !isReplay;
  const labels = {
    sales: ["S", "Sales", "Orders & promises"],
    production: ["P", "Production", "Stock & schedule"],
    finance: ["F", "Finance", "Invoices & cash"],
  };
  $("team").innerHTML = ROLES.map(
    (r) =>
      `<button class="team-role ${s.health[r]}" data-role="${r}" aria-label="Inspect ${r} agent"><span class="avatar">${labels[r][0]}</span><span><strong>${labels[r][1]}</strong><small>${s.health[r] === "working" ? "Reading shared records…" : s.health[r] === "failed" ? "Needs owner review" : labels[r][2]}</small></span></button>`,
  ).join("");
  for (const r of ROLES) {
    $(r + "-state").textContent =
      s.health[r] === "working" ? "AT WORK" : r.toUpperCase();
    $(r + "-state").classList.toggle("active", s.health[r] === "working");
  }
  $("days").innerHTML = DAYS.slice(0, 5)
    .map(
      (d, i) =>
        `<button class="day ${i < s.day ? "done" : ""} ${isReplay ? (i === eventDay() ? "current" : "") : i === s.day ? "current" : ""}" data-day="${i}" aria-label="${d}${i < company.state.day ? " — replay completed day" : ""}" ${i > company.state.day ? "disabled" : ""}>${d.slice(0, 3).toUpperCase()}<span></span></button>`,
    )
    .join("");
  const queued = s.orders
    .filter((o) => o.status === "queued")
    .sort((a, b) => a.due - b.due);
  $("order-count").textContent = queued.length + " ACTIVE";
  $("orders").innerHTML = queued.length
    ? queued
        .map(
          (o) =>
            `<div class="ticket ${o.paper}"><div class="ticket-top"><span>${esc(o.id)}</span><span>DUE ${DAYS[o.due].slice(0, 3).toUpperCase()}</span></div><strong>${esc(o.customer)}</strong><p>${esc(o.product)}${o.ownerApproved ? " · owner revised" : ""}</p><div class="ticket-bottom"><span>${o.quantity} × ${o.paper === "premium" ? "cotton" : "white"}</span><b>${money(o.price)}</b></div></div>`,
        )
        .join("")
    : '<p class="empty">A clear board. Every promise made good.</p>';
  $("lead-count").textContent =
    s.leads.filter((l) => l.status === "open").length + " OPEN";
  $("leads").innerHTML = s.leads
    .map(
      (l) =>
        `<div class="lead"><div><strong>${esc(l.customer)}</strong><p>${l.quantity} ${esc(l.paper)} · ${money(l.offer)} offer<br>${l.due === 0 ? "Same-day rush" : DAYS[l.due] + " delivery"}</p></div><span class="status">${esc(l.status)}</span></div>`,
    )
    .join("");
  $("press-label").textContent = s.pressUsed
    ? `${s.pressUsed} / 120 sheets printed`
    : "120 sheets available";
  $("capacity-fill").style.width =
    Math.min(100, (s.pressUsed / 120) * 100) + "%";
  $("press-scene").classList.toggle(
    "working",
    s.health.production === "working" && !isReplay,
  );
  $("stock").innerHTML = Object.entries(PAPER)
    .map(
      ([paper, p]) =>
        `<div class="stock-row ${paper}"><div><span>${p.name}</span><b>${s.stock[paper]}</b></div><div class="stock-bar"><span style="width:${Math.min(100, (s.stock[paper] / 400) * 100)}%"></span></div></div>`,
    )
    .join("");
  $("deliveries").innerHTML = s.shipments
    .filter((d) => !d.received)
    .map(
      (d) =>
        `<div class="delivery ${d.express ? "express" : ""}"><b>${d.express ? "↗ Express correction" : "↳ Incoming delivery"}</b><span>${d.quantity} ${esc(PAPER[d.paper].name)} · ${DAYS[d.eta]}${d.id === "S1" && s.scenario ? " · delayed" : ""}${d.express ? " · " + money(d.cost) : ""}</span></div>`,
    )
    .join("");
  const printed = s.orders.filter((o) => o.status === "printed");
  $("printed-count").textContent = printed.length;
  $("printed").innerHTML = printed.length
    ? printed
        .map(
          (o) =>
            `<div class="finished-job"><span class="check">✓</span><div>${esc(o.customer)}<small>${o.quantity} sheets · ${DAYS[o.printedDay]}${o.printedDay > o.due ? " · late" : ""}</small></div><b>${o.paid ? "PAID" : o.invoice ? "INVOICED" : "READY TO BILL"}</b></div>`,
        )
        .join("")
    : '<p class="empty">The first impression is still to come.</p>';
  const visibleEvents = company.events.slice(
      0,
      cursor ?? company.events.length,
    ),
    entries = [];
  for (const e of visibleEvents) {
    const a = e.payload.action;
    if (e.type !== "action") continue;
    if (a.type === "buy_express")
      entries.push({
        title: "Express paper",
        note: DAYS[e.day] + " · production purchase",
        amount: -a.quantity * (PAPER[a.paper].unitCost + 50),
        direction: "out",
      });
    if (a.type === "print") {
      const orders = a.orderIds.map((id) => s.orders.find((o) => o.id === id));
      entries.push({
        title: "Press labour",
        note: DAYS[e.day] + " · " + a.orderIds.join(", "),
        amount: -orders.reduce((n, o) => n + o.quantity * 35 + 500, 0),
        direction: "out",
      });
    }
    if (a.type === "collect")
      for (const id of a.orderIds) {
        const o = s.orders.find((o) => o.id === id);
        entries.push({
          title: o.customer,
          note: DAYS[e.day] + " · " + id + " paid",
          amount: o.price,
          direction: "in",
        });
      }
  }
  $("book-entries").innerHTML = entries.length
    ? entries
        .slice(-8)
        .map(
          (e) =>
            `<div class="book-entry ${e.direction}"><div>${esc(e.title)}<small>${esc(e.note)}</small></div><b>${e.amount < 0 ? "−" : "+"}${exact(Math.abs(e.amount))}</b></div>`,
        )
        .join("")
    : '<p class="empty">The day’s entries will land here.</p>';
  const inbox = s.inbox.filter((i) => i.status === "open");
  $("inbox-count").textContent = inbox.length
    ? inbox.length + " OWNER " + (inbox.length === 1 ? "DECISION" : "DECISIONS")
    : "NO OPEN DECISIONS";
  $("inbox-section").classList.toggle("has-open", inbox.length > 0);
  $("inbox").innerHTML = inbox.length
    ? inbox
        .map(
          (i) =>
            `<div class="owner-item"><div><strong>${i.leadId ? esc(s.leads.find((l) => l.id === i.leadId)?.customer) : esc(labels[i.from]?.[1] || "Team") + " needs a hand"}</strong><p>${esc(i.reason)}</p></div><button data-owner="${i.id}" ${busy || isReplay ? "disabled" : ""}>Review decision ↗</button></div>`,
        )
        .join("")
    : '<p class="empty">The team handles the routine. You handle the exceptions.</p>';
  const events = company.events.filter((e) => e.day === eventDay());
  $("event-list").innerHTML = events.length
    ? events
        .map(
          (e) =>
            `<button class="event ${e.type === "rejected" ? "rejected" : ""} ${cursor === e.seq ? "selected" : ""} ${cursor !== null && e.seq > cursor ? "muted" : ""}" data-event="${e.seq}" aria-label="Inspect event ${e.seq}: ${esc(describe(e))}"><span class="seq">${String(e.seq).padStart(2, "0")}</span><span class="actor">${esc(e.actor)}</span><span class="description">${esc(describe(e))}</span><span class="event-arrow">↗</span></button>`,
        )
        .join("")
    : '<p class="empty">Run the first day to see the team’s decisions take shape.</p>';
  $("scrub").max = String(company.events.length);
  $("scrub").value = String(cursor ?? company.events.length);
  $("scrub").disabled = !company.events.length || busy;
  $("play").disabled = !events.length || busy;
  $("replay-count").textContent =
    (cursor ?? company.events.length) + " / " + company.events.length;
  renderNotice();
}
$("replay-top").addEventListener("click", () => $("play").click());
function stopReplay() {
  if (playTimer) clearInterval(playTimer);
  playTimer = null;
  $("play").textContent = "▶ Replay day";
  $("replay-top").textContent = "▶ Replay day";
}
function live() {
  stopReplay();
  cursor = null;
  selectedDay = null;
  render();
}
function inspectEvent(seq) {
  const e = company.events.find((e) => e.seq === seq);
  if (!e) return;
  const before = replay(company.events, seq - 1),
    after = replay(company.events, seq),
    b = metrics(before),
    a = metrics(after),
    trace = company.traces.find((t) => t.role === e.actor && t.day === e.day),
    change = (label, x, y) =>
      `<p>${label}: <b>${esc(x)}</b> → <b>${esc(y)}</b></p>`;
  $("receipt-content").innerHTML =
    `<p class="eyebrow">DAYBOOK / ${DAYS[e.day].toUpperCase()} / MARK ${e.seq}</p><h2>${esc(describe(e))}</h2><p>${esc(e.actor.toUpperCase())} · ${esc(e.type.replaceAll("_", " "))}</p><div class="receipt-diff"><div><strong>BEFORE → AFTER</strong>${change("Cash", exact(b.cash), exact(a.cash))}${change("Invoiced", exact(b.revenue), exact(a.revenue))}${change("Queued jobs", b.backlog, a.backlog)}</div><div><strong>SHARED RECORDS</strong>${change("White sheets", before.stock.standard, after.stock.standard)}${change("Cotton sheets", before.stock.premium, after.stock.premium)}${change("Ledger version", before.version, after.version)}</div></div>${trace ? `<div class="role-plan"><strong>INDEPENDENT ${esc(e.actor.toUpperCase())} READING · ${esc(trace.model)}</strong><p>${esc(trace.plan.reason)}</p><p>Read version ${trace.version} · ${trace.usage.inputTokens} input / ${trace.usage.outputTokens} output tokens${e.payload.injected ? " · This rejected action is an injected failure; it replaces the original Sales plan for this scenario." : ""}</p></div>` : ""}<div class="receipt-meta">Event hash: ${esc(e.hash)}<br>Previous: ${esc(e.previousHash)}</div>`;
  $("receipt").showModal();
}
function inspectRole(role) {
  const latest = company.traces.filter((t) => t.role === role).at(-1);
  $("receipt-content").innerHTML =
    `<p class="eyebrow">THREE ROLES. THREE SEPARATE READINGS.</p><h2>${role[0].toUpperCase() + role.slice(1)}</h2><p>${{ sales: "Owns enquiries and promises. Cannot buy paper, print work or move cash.", production: "Owns the paper shelf and press schedule. Cannot accept orders, invoice or collect.", finance: "Owns billing, collections and exception checks. Cannot print or invent an invoice amount." }[role]}</p>${latest ? `<div class="role-plan"><strong>LATEST INDEPENDENT READING</strong><p>${esc(latest.plan.reason)}</p><p>${esc(latest.model)} · ${DAYS[latest.day]} · read version ${latest.version}</p></div>` : "<p>This role will read the shared records when you run a day.</p>"}`;
  $("receipt").showModal();
}
function openOwner(id) {
  selectedOwner = company.state.inbox.find(
    (i) => i.id === id && i.status === "open",
  );
  if (!selectedOwner) return;
  const s = company.state,
    i = selectedOwner;
  $("owner-title").textContent = i.leadId
    ? s.leads.find((l) => l.id === i.leadId).customer
    : "Keep the company moving.";
  $("owner-reason").textContent = i.reason;
  const due = revisedDue(s);
  $("owner-options").innerHTML = i.leadId
    ? `${i.leadId === "L202" && due !== null ? `<button class="owner-option revise" data-choice="revised_quote"><b>Approve a revised order ↗</b><small>60 standard-stock cards · $240 · ${DAYS[due]} delivery. A smaller, viable promise that fits the remaining press schedule.</small></button>` : ""}<button class="owner-option" data-choice="decline"><b>Decline this enquiry</b><small>Keep existing commitments. No new order or revenue is recorded.</small></button>`
    : '<button class="owner-option revise" data-choice="acknowledge"><b>Acknowledge and review the ledger ↗</b><small>Completed work stays committed. The failed role’s work is not invented.</small></button>';
  $("owner-dialog").showModal();
}
async function refresh() {
  try {
    const r = await fetch("/api/state", { cache: "no-store" });
    if (!r.ok) throw Error();
    const value = await r.json();
    if (value.revision < lastViewStamp) return;
    const nextPending = Boolean(
      value.job && ["queued", "running"].includes(value.job.status),
    );
    if (
      !initial &&
      value.revision === lastViewStamp &&
      value.connected === connected &&
      nextPending === pending &&
      (value.job?.id ?? null) === lastJobId &&
      (value.job?.status ?? null) === lastJobStatus
    )
      return;
    lastViewStamp = value.revision;
    lastJobId = value.job?.id ?? null;
    lastJobStatus = value.job?.status ?? null;
    company = value.company;
    csrf = value.csrf;
    connected = value.connected;
    pending = Boolean(
      value.job && ["queued", "running"].includes(value.job.status),
    );
    if (value.job?.status === "failed" && failedJob !== value.job.id) {
      failedJob = value.job.id;
      notice = value.job.error;
    }
    initial = false;
    render();
  } catch {
    connected = false;
    initial = false;
    notice =
      "The studio connection is unavailable. Your last loaded records remain on screen.";
    render();
  }
}
async function command(input) {
  if (active() || cursor !== null) return;
  pending = true;
  notice = "";
  render();
  try {
    const r = await fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: JSON.stringify({
        ...input,
        version: company.state.version,
        requestId: crypto.randomUUID(),
      }),
    });
    const v = await r.json();
    if (!r.ok) throw Error(v.error || "The operation could not start.");
    await refresh();
  } catch (e) {
    pending = false;
    tell(e.message);
    render();
  }
}
$("run").addEventListener("click", () =>
  command({ op: "run", scenario: $("scenario").value }),
);
$("return-live").addEventListener("click", live);
$("new-week").addEventListener("click", () => $("reset-dialog").showModal());
$("confirm-reset").addEventListener("click", () => {
  $("reset-dialog").close();
  live();
  command({ op: "reset" });
});
$("download").addEventListener("click", (event) => {
  if (initial) event.preventDefault();
});
$("scrub").addEventListener("input", () => {
  stopReplay();
  cursor = Number($("scrub").value);
  selectedDay = company.events[Math.max(0, cursor - 1)]?.day ?? 0;
  render();
});
$("play").addEventListener("click", () => {
  if (playTimer) {
    stopReplay();
    return;
  }
  const events = company.events.filter((e) => e.day === eventDay());
  if (!events.length) return;
  selectedDay = eventDay();
  cursor = events[0].seq - 1;
  const end = events.at(-1).seq;
  render();
  $("play").textContent = "Ⅱ Pause replay";
  playTimer = setInterval(() => {
    cursor++;
    render();
    if (cursor >= end) stopReplay();
  }, 850);
});
document.addEventListener("click", (event) => {
  const b = event.target.closest("button");
  if (!b) return;
  if (b.dataset.close) $(b.dataset.close).close();
  if (b.dataset.event) inspectEvent(Number(b.dataset.event));
  if (b.dataset.role) inspectRole(b.dataset.role);
  if (b.dataset.owner) openOwner(b.dataset.owner);
  if (b.dataset.choice && selectedOwner) {
    const id = selectedOwner.id;
    $("owner-dialog").close();
    command({ op: "resolve", id, choice: b.dataset.choice });
  }
  if (b.dataset.day !== undefined) {
    const d = Number(b.dataset.day);
    if (d >= company.state.day) {
      live();
      return;
    }
    stopReplay();
    selectedDay = d;
    cursor = company.events.filter((e) => e.day === d).at(-1)?.seq ?? 0;
    render();
  }
});
render();
await refresh();
setInterval(refresh, 1800);
