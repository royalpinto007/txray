# Using txray

Paste a Solana transaction signature, select its network and choose **Inspect transaction**. A transaction signature is the public identifier of a transaction, not a wallet address.

Start with an **offline example** if you do not have a signature. All example values are fictional. No RPC request is made for an example.

## Read a result

1. **Diagnosis:** a known runtime error gets a plain explanation. Custom program errors remain unknown; a code such as `6001` means different things in different programs.
2. **Failed instruction:** `#2` means RPC index `1`. This identifies the top-level instruction, not necessarily the innermost cause of a nested failure.
3. **Fee and compute:** the fee is the total recorded in metadata. Compute consumption comes from `meta.computeUnitsConsumed`. Missing values say **Not reported**, never zero.
4. **Instruction timeline:** earlier instructions ran before the failure; later instructions did not run. Ordinary program state changes roll back. Fees and durable-nonce advancement can persist.
5. **Execution log:** lines appear in recorded order. Indentation follows runtime invocation depth. A log's wording is evidence of what a program printed, not an independently verified explanation.

An inner call can fail and be caught by its caller; only `meta.err` determines the transaction outcome. Nested calls can report overlapping compute consumption. txray does not add those lines together. Scheduling cost units are a separate metric from compute units.

## Save or share

**Copy report** copies a text diagnosis. **Export JSON** saves the diagnosis and the full returned transaction record, including logs and instructions. Large integer values are decimal strings so exports do not round balances or fees.

Live lookup signatures are sent to the selected official public RPC. txray stores no lookup history and makes no wallet requests. Exports are saved only when you request one.

## Limits

- Reads confirmed Mainnet or Devnet records. A confirmed record can still be affected by a fork; confirmed is not finalized.
- Legacy, v0 and v1 are requested. Newer versions and unsupported shapes are reported explicitly.
- v0 addresses resolve in static, loaded writable, loaded readonly order. Missing addresses remain unresolved.
- v1 compute and absolute priority fees come from the message config. ComputeBudget instructions are ignored for v1 configuration.
- The RPC supplies a total fee, not an exact base/priority split. Requested compute settings are shown separately, not presented as charged fees.
- Only basic System transfer and Compute Budget instructions are decoded. Unknown instruction bytes remain available. No token transfer, price, profit or full balance-change interpretation is inferred.
- Missing metadata, missing logs and runtime log truncation stay visible. txray cannot reconstruct omitted execution.
- Public RPC can rate limit, block access or lack historical records. A not-found result does not prove a transaction never existed. Check network and retry later.
- No automatic retries. Live calls time out after 12 seconds, responses are capped at 2 MiB, and the local server permits four concurrent lookups and 30 live lookups per minute.

[Architecture](architecture.md)

## Official references

[Solana getTransaction](https://solana.com/docs/rpc/http/gettransaction), [versioned transactions](https://solana.com/docs/core/transactions/versioned-transactions), [fees](https://solana.com/docs/core/fees), and [RPC networks](https://solana.com/docs/references/clusters).
