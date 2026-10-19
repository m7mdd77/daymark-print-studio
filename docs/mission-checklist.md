# Mission evidence map

Live brief: [The Autonomous Company Simulator](https://build.doo.ooo/challenges/autonomous-company-simulator), inspected October 19, 2026.

| Requirement | Implementation and evidence |
|---|---|
| Three connected agent roles | Separate Sales, Production and Finance supported-client invocations, prompts, record views and action allowlists. Public Tuesday has all three genuine plans and committed changes in `evidence/public-tuesday.json`. |
| Common record system | Authoritative PC SQLite ledger, D1 authenticated command relay and durable public view. `architecture.md` and `src/ledger.js`. |
| Run-the-week loop and moving figures | Actual public five-day closure: 15 genuine independent role plans, five paid jobs, 58 events, $1,200 invoiced and $2,129 closing cash. `evidence/public-week.json` replays exactly. Figures are fictional simulator economics. |
| Self-correction without owner input | Genuine Production bought the exact 80-sheet premium-paper shortage after the normal shipment slipped. The receipt was used to print D102 on time the next day. `public-monday.json` and `public-tuesday.json`. |
| Human inbox | Sales's real Tuesday plan created the Mosaic Festival exception. The owner can revise or decline it; the application records the choice and subsequent agents read it. A local actual owner approval is in `local-monday.json`. |
| Role failure handled | Injected Sales promise rejected; Production continued and Finance billed real completed work. Actual local Finance failure left the job uninvoiced; the next reading caught up. A missed escalation identified in the hosted run led to an explicit SYSTEM fallback and regression check. See `failure-test.md`. |
| Replay a day | Deterministic event reduction with sequence/hash verification, labeled replay mode and disabled business commands while replaying. All five saved genuine-run ledgers replay exactly to their saved states. |
| Architecture and thesis | `architecture.md` and `thesis.md` (under 300 words). |
| Public repo and live demo | https://github.com/m7mdd77/daymark-print-studio and https://daymark-print-studio.choggyacc.chatgpt.site/ |
| Continuous walkthrough | Continuous 90.3-second Tuesday replay capture at `/walkthrough.mp4`; no cuts or speed changes. New inference and the owner decision are proved separately in the complete ledger. `evidence/walkthrough.json`. |
| Saved competition entry | Pending final release verification and capture. |

Evidence is not a claim of production procurement, real customer revenue, judge acceptance, rank or an award.
