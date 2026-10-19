# Daymark — the studio runs together

A working slice of [The Autonomous Company Simulator](https://build.doo.ooo/challenges/autonomous-company-simulator): an independent print studio operated by three connected AI roles.

[Live studio](https://daymark-print-studio.choggyacc.chatgpt.site/) · [Public source](https://github.com/m7mdd77/daymark-print-studio)

Sales turns enquiries into viable orders. Production buys missing paper and prints within the actual schedule. Finance invoices completed work and collects payment. Each role makes a separate genuine DeepSeek call, receives its own scoped record view, and has its own action allowlist. Their actions update the same durable company ledger. A single prompt does not generate three personas or the whole day.

All customers, orders, paper purchases and money are fictional. Actions genuinely mutate this simulator's records; nothing is sent to a customer, supplier or payment service.

## Run a clean checkout

Node.js 24.19+. The local server, domain engine, SQLite relay and tests need no third-party packages.

```powershell
node --test test/*.test.js
node scripts/build.mjs
node server.js
```

Open http://127.0.0.1:3301. The studio begins with real local simulator records, but clearly shows the live team offline. There are no canned model responses or simulated success fallback.

For genuine AI, copy `.env.example` to ignored `.env`, supply an approved AgentRouter key and the actual supported Claude Code executable. In a second terminal:

```powershell
$env:DAYMARK_SITE_URL='http://127.0.0.1:3301'
node --env-file=.env pc-worker.js
```

The operator may reuse the existing private sibling environment through `--env-file=../decision-engine/.env`. Never copy that file into this repository. The worker refuses to start without configured AI. The provider key stays on the PC; the hosted Site uses only a separate random service credential.

## A week at the studio

1. **Run Monday.** A normal cotton-paper delivery slips to Thursday. Each role independently reads shared records and chooses up to three permitted actions. Watch tickets, stock and cash change as those actions commit.
2. Production can order the exact 80-sheet shortage by express delivery without involving the owner. It arrives for Tuesday's 100-sheet job. This is the self-correction: the model notices the shortage and selects a bounded purchase; no scenario script injects the corrective action.
3. Sales sends an impossible same-day rush enquiry to **Your desk**. Approve a smaller, profitable standard-paper order at the earliest capacity-safe date, or decline it. The owner choice really changes the shared records.
4. **Run Tuesday** against Monday's committed orders, stock receipts and cash. Continue through Friday to close the week. Finance can catch up printed-but-uninvoiced work after a failed prior reading.
5. Select a completed day, scrub its marks or **Replay day**. This projects committed events, without calling AI or repeating purchases/payments. **Return to live studio** before acting.
6. Inspect a mark for before/after figures, role rationale, read version, token usage and hash-chain linkage. Download the actual daybook as JSON.
7. Start a new week with **Sales makes a bad promise**. A clearly identified injected failure replaces Sales's real plan with an underpriced rush order. The validator refuses it; independent Production and Finance then read the rejected promise and can continue or escalate. The original genuine plan remains in the evidence, so the injected action is never misrepresented as AI output.

## Shared state and authority

| Role | Separate context | Permitted record changes |
|---|---|---|
| Sales | Enquiries, orders, production health, exceptions | Accept a viable enquiry; raise an owner exception |
| Production | Stock, shipments, orders, press usage, cash | Buy express paper; print queued work |
| Finance | Printed work, invoices, payments, rejected promises | Invoice; collect once; hold or escalate an unsafe promise |

The orchestration process advances these separate role invocations in dependency order. Each starts a genuine supported-client process with a role-specific workspace and no tools, MCP servers or saved sessions. Shared-state transactions are executed by typed application code, not model tools or SQL. Models choose actions; code determines whether they are allowed and computes every amount.

The company is event-sourced in PC SQLite. Each accepted action, refusal, role failure, owner decision and day close gets a sequence and SHA-256 link. Replay starts from the fixed opening records and deterministically reduces those events. Hashes detect accidental or partial history alteration; they are not signatures, trusted timestamps, or protection against an operator rewriting the entire history.

Day operations have a persistent idempotency key. A completed job returns its existing result. Duplicate payment, stale document/version, unknown IDs, unsupported authority, insufficient stock, over-capacity printing, a quote below 25% margin, purchases above $150, and a cash reserve below $300 are refused. Multi-record actions are atomic. A stopped worker can recover an expired operation while retaining committed changes and raising an owner review.

Business simplifications: one finished piece consumes one sheet, daily press capacity is 120 sheets, labour is 35 cents per sheet plus $5 setup per order, normal paper costs 40/100 cents, and express paper costs 50 cents more. Opening inventory and the original incoming shipment were prepaid before the opening $1,200 cash balance. Completed-work cost uses weighted-average actual inventory cost plus labour; booked margin includes only invoiced jobs. These are explicit simulator economics, not actual company results.

## Hosted architecture

The ChatGPT Site serves the interface and a D1 relay. An anonymous HttpOnly/SameSite cookie owns one company. Origin and CSRF checks protect commands. Public requests can name only `run`, `resolve` or `reset`, a known scenario, an expected ledger version and a bounded owner choice. They cannot provide company state or model output. The authenticated outbound PC worker reads the authoritative SQLite company, runs the roles and writes progress snapshots back to D1. Its bearer credential is never returned to a browser.

The public studio requires the operator's PC awake and connected. D1 stores the durable public view and job status, while the authoritative operating ledger remains on that PC. This prototype does not provide cross-device accounts, high availability, production procurement, tax accounting, bank reconciliation or external billing. Anonymous browser storage/cookies can be lost; export the daybook to keep a portable copy. There is no claim of guaranteed profitability or always-correct intent inference.

Each role uses low effort, bounded client output, a 45-second application deadline and a client-estimated $0.20 invocation cap. A client may make internal continuations; one role attempt is not a guarantee of one billable provider request. There is no application inference retry or fixture fallback. Failed attempts count toward the persistent PC limit of 24 role attempts per rolling hour. The public host additionally limits five day attempts per company and eight globally per rolling hour; controls and replay do not trigger model calls. These limits are enforced atomically. Cost estimates are not provider billing guarantees.

Public relay views and simulator ledgers are operational prototype storage; no forensic erasure or provider-retention guarantee is made. Do not add private customer data. The product exposes no free-text customer import in this version.

The retained Sites starter is under `site/`. Hosted development needs its locked dependencies, `node scripts/build.mjs`, then `npm run build` inside that directory. Keep its hosting identity, `sites()` build integration and generated D1 migration history. The source distribution contains ordinary Site files, not a submodule. The CLI transport and outbound-relay approach are reused from the earlier Imprint prototype; the company model, three-agent coordination, ledger, UI and business workflow are new.

See [methodology](docs/methodology.md), [architecture](docs/architecture.md), [failure test](docs/failure-test.md), [two-year thesis](docs/thesis.md), and [release evidence](docs/release.md). Automated model doubles and genuine provider/browser evidence are explicitly distinguished.
