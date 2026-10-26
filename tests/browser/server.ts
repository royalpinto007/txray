import { createApp } from "../../src/app.js";
import { exampleTransaction } from "../../src/adapters/examples.js";
const fetchImpl: typeof fetch = async (_url, init) => {
  const body = JSON.parse(init?.body as string) as { params: [string] };
  const raw = exampleTransaction("insufficient-funds") as {
    transaction: { signatures: string[] };
  };
  raw.transaction.signatures = [body.params[0]];
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: raw }));
};
createApp({ fetchImpl }).listen(4451, "127.0.0.1");
