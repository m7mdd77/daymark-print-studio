import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { seed, reduceEvent, requireRule, replay, clone } from "./domain.js";
export const digest = (e) =>
  createHash("sha256").update(JSON.stringify(e)).digest("hex");
export function verify(events) {
  let previousHash = "0".repeat(64);
  for (const event of events) {
    const { hash, ...body } = event;
    requireRule(
      body.previousHash === previousHash && digest(body) === hash,
      "integrity",
      "Ledger integrity verification failed.",
    );
    previousHash = hash;
  }
  return replay(events);
}
export class Ledger {
  constructor(path) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS companies(id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, company TEXT NOT NULL, result TEXT);",
    );
  }
  load(id) {
    requireRule(
      typeof id === "string" && /^[a-zA-Z0-9-]{10,100}$/.test(id),
      "identity",
      "Company identity required.",
    );
    const row = this.db
      .prepare("SELECT data FROM companies WHERE id=?")
      .get(id);
    return row
      ? JSON.parse(row.data)
      : { state: seed(), events: [], traces: [], busy: false };
  }
  save(id, value) {
    this.db
      .prepare(
        "INSERT INTO companies(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(id, JSON.stringify(value));
  }
  event(id, actor, type, payload) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const company = this.load(id),
        body = {
          seq: company.events.length + 1,
          day: company.state.day,
          actor,
          type,
          payload,
          previousHash: company.events.at(-1)?.hash || "0".repeat(64),
        },
        event = { ...body, hash: digest(body) };
      company.state = reduceEvent(company.state, event);
      company.events.push(event);
      this.save(id, company);
      this.db.exec("COMMIT");
      return company;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  reset(id) {
    const c = this.load(id);
    requireRule(!c.busy, "busy", "A day is still running.");
    this.save(id, { state: seed(), events: [], traces: [], busy: false });
    return this.load(id);
  }
  trace(id, trace) {
    const c = this.load(id);
    c.traces.push(trace);
    this.save(id, c);
  }
  startJob(job, id) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const prev = this.db
        .prepare("SELECT company,result FROM jobs WHERE id=?")
        .get(job);
      if (prev) {
        requireRule(prev.company === id, "identity", "Job owner mismatch.");
        this.db.exec("COMMIT");
        return {
          duplicate: true,
          result: prev.result ? JSON.parse(prev.result) : null,
        };
      }
      const c = this.load(id);
      requireRule(!c.busy, "busy", "This company already has an active day.");
      c.busy = true;
      c.busySince = Date.now();
      this.save(id, c);
      this.db.prepare("INSERT INTO jobs(id,company) VALUES(?,?)").run(job, id);
      this.db.exec("COMMIT");
      return { duplicate: false };
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  recoverStale(id, now = Date.now()) {
    let c = this.load(id);
    if (c.busy && now - (c.busySince || 0) > 240000) {
      this.event(id, "system", "interrupted", {});
      c = this.load(id);
      c.busy = false;
      this.save(id, c);
      this.db
        .prepare("UPDATE jobs SET result=? WHERE company=? AND result IS NULL")
        .run(JSON.stringify(c), id);
    }
    return c;
  }
  finishJob(job, id) {
    const c = this.load(id);
    c.busy = false;
    verify(c.events);
    this.save(id, c);
    this.db
      .prepare("UPDATE jobs SET result=? WHERE id=? AND company=?")
      .run(JSON.stringify(c), job, id);
    return c;
  }
  close() {
    this.db.close();
  }
}
