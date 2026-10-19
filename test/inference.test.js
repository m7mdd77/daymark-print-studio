import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inference, configuration } from "../src/inference.js";
import { seed } from "../src/domain.js";
test("a failed provider attempt is counted, never retried, and cannot silently become fixture output", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "daymark-inference-"));
  let calls = 0;
  const infer = inference(dir, {
    config: { configured: true },
    client: async () => {
      calls++;
      throw Error("Injected provider failure");
    },
  });
  t.after(() => {
    infer.close();
    rmSync(dir, { recursive: true, force: true });
  });
  for (let i = 0; i < 24; i++)
    await assert.rejects(infer("sales", seed()), /Injected provider failure/);
  await assert.rejects(infer("sales", seed()), { code: "allowance" });
  assert.equal(calls, 24);
});
test("each role has its own client call and an invalid authority cannot become a business action", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "daymark-role-")),
    seen = [];
  const infer = inference(dir, {
    config: { configured: true, model: "TEST DOUBLE" },
    client: async ({ messages }) => {
      seen.push(messages);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              reason: "Injected untrusted approval",
              actions: [{ type: "collect", orderIds: ["D101"] }],
            }),
          },
        ],
        usage: {},
      };
    },
  });
  t.after(() => {
    infer.close();
    rmSync(dir, { recursive: true, force: true });
  });
  await assert.rejects(infer("sales", seed()), { code: "authority" });
  assert.equal(seen.length, 1);
  assert.match(seen[0][0].content, /sales agent/);
  assert.equal("cash" in JSON.parse(seen[0][1].content), false);
});
test("provider and model restrictions cannot be redirected by environment configuration", () => {
  assert.throws(
    () => configuration({ AGENTROUTER_BASE_URL: "https://attacker.example" }),
    { code: "configuration" },
  );
  assert.throws(
    () => configuration({ AGENTROUTER_MODEL: "unverified-model" }),
    { code: "configuration" },
  );
});
