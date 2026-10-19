import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, extname } from "node:path";
import { randomBytes } from "node:crypto";
import { SqliteD1 } from "./src/sqlite-d1.js";
import { hosted } from "./src/hosted.js";
const port = Number(process.env.PORT || 3301),
  origin = `http://127.0.0.1:${port}`;
mkdirSync("data", { recursive: true });
if (!existsSync("data/worker-token"))
  writeFileSync("data/worker-token", randomBytes(32).toString("hex"), {
    mode: 0o600,
  });
const db = new SqliteD1("data/relay.sqlite");
db.exec(readFileSync("src/relay-schema.sql", "utf8"));
const environment = {
  DAYMARK_WORKER_TOKEN: readFileSync("data/worker-token", "utf8").trim(),
};
const server = createServer(async (req, res) => {
  try {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 400000) throw Error("Body too large");
      chunks.push(chunk);
    }
    const url = new URL(req.url, origin);
    if (url.pathname === "/api/recording" && req.method === "POST") {
      res.writeHead(400);
      res.end("Use the dedicated recorder.");
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      const request = new Request(url, {
          method: req.method,
          headers: req.headers,
          ...(!["GET", "HEAD"].includes(req.method)
            ? { body: Buffer.concat(chunks) }
            : {}),
        }),
        response = await hosted(request, db, environment);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (!/^[a-z0-9.-]+$/.test(name)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const path = resolve("outputs/local", name);
    if (!existsSync(path)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const bytes = readFileSync(path);
    res.writeHead(200, {
      "Content-Type":
        {
          ".html": "text/html; charset=utf-8",
          ".css": "text/css",
          ".js": "text/javascript",
          ".jpg": "image/jpeg",
          ".png": "image/png",
          ".mp4": "video/mp4",
          ".svg": "image/svg+xml",
        }[extname(path)] || "application/octet-stream",
      "Content-Length": bytes.length,
      "Cache-Control": "no-store",
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "The request could not finish. Committed records are preserved.",
      }),
    );
  }
}).listen(port, "127.0.0.1", () => console.log("Daymark ready at " + origin));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );
