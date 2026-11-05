import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

const RPC_URL = process.env.NEAR_RPC_URL ?? "https://rpc.testnet.near.org";
const CONTRACT_ID = process.env.NEAR_CONTRACT_ID ?? "";

// Call a read-only contract method via NEAR JSON-RPC.
async function view<T>(method: string, args: object = {}): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "api",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: CONTRACT_ID,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      },
    }),
  });
  const json = await res.json();
  if (json.error || json.result?.error) {
    throw new Error(JSON.stringify(json.error ?? json.result.error));
  }
  return JSON.parse(Buffer.from(json.result.result).toString());
}

const app = new Hono();
app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true }));

app.get("/greeting", async (c) => {
  if (!CONTRACT_ID) return c.json({ error: "NEAR_CONTRACT_ID not set" }, 500);
  return c.json({ greeting: await view<string>("get_greeting") });
});

const port = Number(process.env.PORT ?? 4000);
serve({ fetch: app.fetch, port });
console.log(`api on http://localhost:${port}`);
