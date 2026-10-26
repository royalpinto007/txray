# Local API

Base address: `http://127.0.0.1:4450`. JSON responses are not cached. There is no authentication; the server binds to loopback and rejects foreign Host and Origin headers. This is a local tool, not a hosted service.

## Inspect a live transaction

```sh
curl http://127.0.0.1:4450/api/transactions \
  -H 'Content-Type: application/json' \
  -d '{"signature":"YOUR_TRANSACTION_SIGNATURE","network":"devnet"}'
```

`signature` must decode to 64 bytes of base58. `network` is `devnet` or `mainnet-beta`. Extra fields, arbitrary URLs and oversized request bodies are rejected. The placeholder above must be replaced before running.

The server calls `getTransaction` with `encoding: "json"`, `commitment: "confirmed"` and `maxSupportedTransactionVersion: 1`.

A report contains `schemaVersion`, `signature`, `network`, `source`, `checkedAt`, `slot`, `version`, `status`, `diagnosis`, `fee`, `compute`, `instructions`, `logs`, `warnings`, `summaryText` and `raw`. Unavailable values are `null` or carry an explicit unknown state. Monetary values and large integers use exact decimal strings. `raw` is the validated RPC record, with known integer fields normalized to strings and unknown fields retained.

Instruction `index` is zero-based; `number` is one-based. The identified failed program is the top-level program. Inner calls and logs are preserved without claiming a verified innermost cause. Requested settings do not establish the exact charged base/priority fee split.

## Offline examples

- `GET /api/examples`: example names and descriptions.
- `GET /api/examples/insufficient-funds`: a complete fictional report.
- Other IDs: `unknown-program`, `successful-v0`, `missing-metadata`, `v1-config`.

Examples run the same analyzer without querying RPC. Every example report has `source: "example"`.

`GET /api/health` reports that the local HTTP server is running; it does not assert RPC availability.

## Errors and bounds

Errors use `{ "error": { "code": "TRANSACTION_NOT_FOUND", "message": "..." } }` with a non-200 status. Not found is 404; invalid input is 400; rejected origin is 403; non-JSON body is 415; excessive request size is 413; throttling is 429; RPC problems use 502, 503 or 504. Throttled responses include `Retry-After` when available.

The server accepts 16 KiB JSON requests and 2 MiB RPC responses, with a 12-second RPC timeout, four concurrent lookups and 30 live lookups per minute. No automatic retries. A null RPC result may mean wrong network, unconfirmed, pruned or unavailable history; it does not prove nonexistence.

Browser export is a local download of this report, not another API call.
