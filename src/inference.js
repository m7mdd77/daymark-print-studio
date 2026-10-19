import { existsSync, mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { invokeSupportedClient } from "./cli-client.js";
import { roleMessages, parseRole } from "./roles.js";
import { requireRule } from "./domain.js";
export function configuration(env = process.env) {
  const endpoint = new URL(
      env.AGENTROUTER_BASE_URL || "https://agentrouter.org",
    ),
    model = env.AGENTROUTER_MODEL || "deepseek-v4-flash",
    key = env.AGENTROUTER_API_KEY || "",
    clientPath = env.CLAUDE_CODE_PATH || "C:/Users/User/.local/bin/claude.exe";
  requireRule(
    endpoint.protocol === "https:" &&
      endpoint.hostname === "agentrouter.org" &&
      !endpoint.username &&
      !endpoint.password &&
      !endpoint.search &&
      !endpoint.hash &&
      model === "deepseek-v4-flash",
    "configuration",
    "Use the approved AgentRouter origin and verified DeepSeek model.",
  );
  return {
    endpoint: endpoint.origin,
    model,
    key,
    clientPath,
    configured: Boolean(key && existsSync(clientPath)),
  };
}
export function inference(
  directory,
  {
    config = configuration(),
    client = invokeSupportedClient,
    now = Date.now,
  } = {},
) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, "allowance.sqlite"));
  db.exec(
    "CREATE TABLE IF NOT EXISTS attempts(at INTEGER NOT NULL,role TEXT NOT NULL)",
  );
  const run = async (role, state) => {
    requireRule(config.configured, "offline", "The live studio is offline.");
    const at = now();
    requireRule(
      Number(
        db
          .prepare(
            "INSERT INTO attempts(at,role) SELECT ?,? WHERE (SELECT COUNT(*) FROM attempts WHERE at>?)<24",
          )
          .run(at, role, at - 3600000).changes,
      ) === 1,
      "allowance",
      "The live role allowance is reached.",
    );
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 45000);
    try {
      const r = await client({
        config,
        messages: roleMessages(role, state),
        directory: join(directory, role),
        signal: controller.signal,
      });
      const plan = parseRole(
          r.content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join(""),
          role,
        ),
        u = r.usage || {};
      return {
        plan,
        model: config.model,
        usage: {
          inputTokens: u.input_tokens || 0,
          outputTokens: u.output_tokens || 0,
          cacheReadTokens: u.cache_read_input_tokens || 0,
        },
      };
    } finally {
      clearTimeout(timer);
    }
  };
  run.close = () => db.close();
  return run;
}
