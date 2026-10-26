import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { inspectTransaction, MAX_RESPONSE_BYTES } from "../src/adapters/rpc.js";
import { transaction, SIGNATURE } from "./fixtures.js";
const input = { signature: SIGNATURE, network: "devnet" };
const rpc = (result: unknown) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    headers: { "content-type": "application/json" },
  });
const local = (app: ReturnType<typeof createApp>) => request(app);
function post(app: ReturnType<typeof createApp>) {
  return local(app).post("/api/transactions").set("Host", "127.0.0.1:4450");
}
const fake: typeof fetch = async (url, init) => {
  assert.equal(url, "https://api.devnet.solana.com");
  const body = JSON.parse(init?.body as string);
  assert.equal(body.method, "getTransaction");
  assert.equal(body.params[1].maxSupportedTransactionVersion, 1);
  assert.equal(body.params[1].encoding, "json");
  assert.equal(body.params[1].commitment, "confirmed");
  assert.equal(init?.redirect, "error");
  return rpc(transaction());
};
test("real local API analyzes a confirmed RPC record and sets defensive headers", async () => {
  const response = await post(createApp({ fetchImpl: fake }))
    .send(input)
    .expect(200);
  assert.equal(response.body.status, "failed");
  assert.equal(response.body.source, "live");
  assert.equal(response.headers["cache-control"], "no-store");
  assert.match(
    String(response.headers["content-security-policy"]),
    /default-src 'self'/,
  );
  assert.equal(response.headers["x-powered-by"], undefined);
  assert.match(response.body.summaryText, /RPC index 1/);
});
test("invalid signature, networks and arbitrary RPC URLs never reach fetch", async () => {
  let calls = 0;
  const app = createApp({
    fetchImpl: async () => {
      calls++;
      return rpc(transaction());
    },
  });
  for (const body of [
    { ...input, signature: "bad" },
    { ...input, network: "http://localhost:123" },
    { ...input, rpcUrl: "http://localhost:123" },
  ])
    await post(app).send(body).expect(400);
  assert.equal(calls, 0);
});
test("rejects cross-origin, DNS rebinding and unsupported body types", async () => {
  const app = createApp({ fetchImpl: fake });
  await request(app)
    .post("/api/transactions")
    .set("Host", "evil.example")
    .send(input)
    .expect(403);
  await post(app).set("Origin", "https://evil.example").send(input).expect(403);
  await post(app).set("Sec-Fetch-Site", "cross-site").send(input).expect(403);
  await post(app).set("Content-Type", "text/plain").send("bad").expect(415);
  await post(app)
    .set("Origin", "http://127.0.0.1:4450")
    .send(input)
    .expect(200);
});
test("missing results, malformed JSON and wrong signature are distinct from success", async () => {
  const app = (fetchImpl: typeof fetch) => createApp({ fetchImpl });
  const missing = await post(app(async () => rpc(null)))
    .send(input)
    .expect(404);
  assert.equal(missing.body.error.code, "TRANSACTION_NOT_FOUND");
  const invalid = await post(app(async () => new Response("not-json")))
    .send(input)
    .expect(502);
  assert.equal(invalid.body.error.code, "RPC_INVALID_RESPONSE");
  const raw = transaction();
  raw.transaction.signatures = ["4".repeat(87)];
  await post(app(async () => rpc(raw)))
    .send(input)
    .expect(502);
});
test("rate limits preserve retry guidance and unsupported versions stay explicit", async () => {
  const app = createApp({
    fetchImpl: async () =>
      new Response("", { status: 429, headers: { "retry-after": "45" } }),
  });
  const limited = await post(app).send(input).expect(429);
  assert.equal(limited.headers["retry-after"], "45");
  const response = await post(
    createApp({
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32015, message: "Version unsupported" },
          }),
        ),
    }),
  )
    .send(input)
    .expect(502);
  assert.equal(response.body.error.code, "UNSUPPORTED_VERSION");
});
test("RPC stream is bounded even without content-length", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(MAX_RESPONSE_BYTES + 1));
          c.close();
        },
      }),
    );
  await assert.rejects(() => inspectTransaction(input, { fetchImpl }), {
    code: "RESPONSE_TOO_LARGE",
  });
});
test("RPC timeout interrupts a stalled lookup", async () => {
  const fetchImpl: typeof fetch = async (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new Error("aborted")),
        { once: true },
      );
    });
  await assert.rejects(
    () => inspectTransaction(input, { fetchImpl, timeoutMs: 10 }),
    { code: "RPC_TIMEOUT" },
  );
});
test("offline examples need no RPC and remain labeled synthetic", async () => {
  const app = createApp({
    fetchImpl: async () => {
      throw new Error("No network allowed");
    },
  });
  const examples = await local(app)
    .get("/api/examples")
    .set("Host", "localhost:4450")
    .expect(200);
  assert(examples.body.length >= 4);
  const response = await local(app)
    .get("/api/examples/insufficient-funds")
    .set("Host", "localhost:4450")
    .expect(200);
  assert.equal(response.body.source, "example");
  assert.equal(response.body.exampleId, "insufficient-funds");
  await local(app)
    .get("/api/examples/no-such-example")
    .set("Host", "localhost:4450")
    .expect(404);
});
test("bounded concurrency rejects excess live work without blocking examples", async () => {
  let release: () => void = () => {};
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const app = createApp({
    maxConcurrent: 1,
    fetchImpl: async () => {
      await barrier;
      return rpc(transaction());
    },
  });
  const first = post(app)
    .send(input)
    .then((r) => r);
  await new Promise((r) => setTimeout(r, 30));
  try {
    const response = await post(app).send(input).expect(429);
    assert.equal(response.body.error.code, "LOOKUP_BUSY");
    await local(app).get("/api/examples").set("Host", "localhost").expect(200);
  } finally {
    release();
  }
  assert.equal((await first).status, 200);
});

test("Mainnet requests use the fixed official endpoint", async () => {
  await inspectTransaction(
    { ...input, network: "mainnet-beta" },
    {
      fetchImpl: async (url) => {
        assert.equal(url, "https://api.mainnet-beta.solana.com");
        return rpc(transaction());
      },
    },
  );
});
test("timeout remains active while reading a stalled body after headers", async () => {
  const fetchImpl: typeof fetch = async (_url, init) =>
    new Response(
      new ReadableStream({
        start(c) {
          init?.signal?.addEventListener(
            "abort",
            () => c.error(new Error("aborted")),
            { once: true },
          );
        },
      }),
    );
  await assert.rejects(
    () => inspectTransaction(input, { fetchImpl, timeoutMs: 10 }),
    { code: "RPC_TIMEOUT" },
  );
});
