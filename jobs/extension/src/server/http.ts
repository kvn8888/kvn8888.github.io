import { createServer, type IncomingMessage } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";
import { ApiError, Store } from "./store";
function equal(a: string, b: string) {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return (
    left.length === right.length &&
    left.length > 0 &&
    timingSafeEqual(left, right)
  );
}
async function body(req: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += c.length;
    if (size > 2_000_000) throw new ApiError(413, "Request too large");
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new ApiError(400, "Invalid JSON");
  }
}
export function server(store: Store, writeKey: string, readKey: string) {
  return createServer(async (req, res) => {
    const send = (status: number, data: unknown) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(JSON.stringify(data));
    };
    try {
      const host = req.headers.host || "";
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))
        throw new ApiError(403, "Loopback host required");
      const origin = req.headers.origin;
      if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin))
        throw new ApiError(403, "Only extension origins are accepted");
      if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      if (req.method === "OPTIONS") {
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Authorization, Content-Type, Idempotency-Key",
        );
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.writeHead(204);
        res.end();
        return;
      }
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const token = (req.headers.authorization || "").replace(/^Bearer /, "");
      const writer = equal(token, writeKey),
        reader = equal(token, readKey);
      if (!writer && !reader)
        throw new ApiError(
          401,
          "Connect with your local connection file first",
        );
      if (req.method !== "GET" && !writer)
        throw new ApiError(403, "Read-only credentials cannot write");
      if (req.method === "GET" && url.pathname === "/health") {
        await store.verify();
        return send(200, {
          ok: true,
          database: "connected",
          access: writer ? "write" : "read",
        });
      }
      if (req.method === "GET" && url.pathname === "/jobs")
        return send(200, await store.search(url.searchParams));
      if (req.method === "GET" && url.pathname.startsWith("/jobs/"))
        return send(200, {
          job: await store.getJob(decodeURIComponent(url.pathname.slice(6))),
        });
      if (req.method === "POST" && url.pathname === "/jobs")
        return send(200, { job: await store.collect(await body(req)) });
      if (req.method === "GET" && url.pathname === "/applications")
        return send(200, { applications: await store.applications() });
      if (req.method === "GET" && /^\/applications\/\d+$/.test(url.pathname))
        return send(200, {
          application: await store.application(
            Number(url.pathname.split("/")[2]),
          ),
        });
      if (req.method === "POST" && url.pathname === "/applications") {
        const result = await store.submit(
          await body(req),
          String(req.headers["idempotency-key"] || ""),
        );
        return send(result.replayed ? 200 : 201, result);
      }
      throw new ApiError(404, "Endpoint not found");
    } catch (e) {
      if (e instanceof ApiError) return send(e.status, { error: e.message });
      if (e instanceof ZodError)
        return send(400, {
          error: "Invalid request fields",
          fields: e.issues.map((i) => i.path.join(".")),
        });
      console.error("Request failed:", e instanceof Error ? e.name : "unknown");
      send(500, {
        error:
          "Database operation failed. Retry later; no credentials are logged.",
      });
    }
  });
}
