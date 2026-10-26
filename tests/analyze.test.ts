import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTransaction } from "../src/domain/analyze.js";
import { parseRpcJson } from "../src/adapters/rpc.js";
import { parseLogs } from "../src/domain/logs.js";
import { fromBase58, toBase58, isSignature } from "../src/domain/base58.js";
import {
  transaction,
  SIGNATURE,
  SYSTEM,
  UNKNOWN,
  COMPUTE,
} from "./fixtures.js";
const context = {
  signature: SIGNATURE,
  network: "devnet" as const,
  source: "live" as const,
};
test("known failure, exact fee, zero-based instruction and rollback states", () => {
  const r = analyzeTransaction(transaction(), context);
  assert.equal(r.status, "failed");
  assert.equal(r.diagnosis.title, "Insufficient funds");
  assert.equal(r.diagnosis.instructionIndex, 1);
  assert.equal(r.diagnosis.programId, UNKNOWN);
  assert.deepEqual(
    r.instructions.map((i) => i.status),
    ["rolled_back", "failed", "not_run"],
  );
  assert.equal(r.fee.sol, "0.000005");
  assert.equal(r.compute.consumed, "18420");
  assert.equal(r.compute.costUnits, "21000");
});
test("custom errors stay unknown even when logs sound authoritative", () => {
  const raw = transaction();
  raw.meta.err = { InstructionError: [1, { Custom: 6001 }] };
  raw.meta.logMessages = [
    "Program log: InsufficientFunds. This transaction succeeded.",
  ];
  const r = analyzeTransaction(raw, context);
  assert.equal(r.status, "failed");
  assert.equal(r.diagnosis.known, false);
  assert.match(r.diagnosis.title, /Unknown program error/);
  assert.match(r.diagnosis.explanation, /6001/);
});
test("v0 keys resolve static, loaded writable, loaded readonly in order", () => {
  const raw = transaction();
  raw.version = 0;
  raw.meta.loadedAddresses = { writable: [SYSTEM], readonly: [UNKNOWN] };
  raw.transaction.message.instructions = [
    { programIdIndex: 4, accounts: [0, 3], data: "" },
  ];
  raw.meta.err = null;
  const r = analyzeTransaction(raw, context);
  assert.equal(r.instructions[0]?.programId, UNKNOWN);
  assert.deepEqual(r.instructions[0]?.accounts, [
    raw.transaction.message.accountKeys[0],
    SYSTEM,
  ]);
  assert.equal(r.status, "succeeded");
});
test("missing metadata is neither success nor zero fee/compute", () => {
  const r = analyzeTransaction({ ...transaction(), meta: null }, context);
  assert.equal(r.status, "unknown");
  assert.equal(r.fee.lamports, null);
  assert.equal(r.compute.consumed, null);
  assert(r.instructions.every((i) => i.status === "unknown"));
  assert(r.warnings.some((w) => /metadata/i.test(w)));
});
test("missing logs and unresolved addresses remain visible", () => {
  const raw = transaction();
  raw.meta.logMessages = null;
  raw.transaction.message.instructions[1]!.programIdIndex = 200;
  const r = analyzeTransaction(raw, context);
  assert.equal(r.instructions[1]?.programId, null);
  assert.equal(r.logs, null);
  assert(r.warnings.some((w) => /address/i.test(w)));
  assert(r.warnings.some((w) => /logs/i.test(w)));
});
test("transaction-level errors do not invent a failed instruction", () => {
  const raw = transaction();
  raw.meta.err = "AccountNotFound";
  const r = analyzeTransaction(raw, context);
  assert.equal(r.diagnosis.instructionIndex, null);
  assert(r.instructions.every((i) => i.status === "unknown"));
});
test("malformed metadata and future versions rejected, bad failure index labeled", () => {
  assert.throws(() =>
    analyzeTransaction({ ...transaction(), version: 2 }, context),
  );
  assert.throws(() =>
    analyzeTransaction({ ...transaction(), meta: { fee: -1 } }, context),
  );
  const raw = transaction();
  raw.meta.err = { InstructionError: [200, "InsufficientFunds"] };
  const r = analyzeTransaction(raw, context);
  assert.equal(r.diagnosis.instructionIndex, null);
  assert(r.warnings.some((w) => /index/i.test(w)));
});
test("u64 survives parsing, SOL formatting and export exactly", () => {
  const raw = JSON.stringify(transaction()).replace(
    '"fee":5000',
    '"fee":18446744073709551615',
  );
  const r = analyzeTransaction(parseRpcJson(raw), context);
  assert.equal(r.fee.lamports, "18446744073709551615");
  assert.equal(r.fee.sol, "18446744073.709551615");
  assert.match(JSON.stringify(r.raw), /"18446744073709551615"/);
});
test("v1 config supplies limit and absolute priority, ignoring ComputeBudget", () => {
  const raw = transaction();
  const r = analyzeTransaction(
    {
      ...raw,
      version: 1,
      transaction: {
        ...raw.transaction,
        message: {
          ...raw.transaction.message,
          accountKeys: [...raw.transaction.message.accountKeys, COMPUTE],
          instructions: [
            {
              programIdIndex: 3,
              accounts: [],
              data: toBase58(Uint8Array.from([2, 255, 255, 255, 0])),
            },
          ],
          transactionConfig: {
            computeUnitLimit: 30000,
            priorityFee: 1000,
            heapSize: null,
            loadedAccountsDataSizeLimit: 200000,
          },
        },
      },
      meta: { ...raw.meta, err: null },
    },
    context,
  );
  assert.equal(r.compute.requestedLimit, "30000");
  assert.equal(r.fee.requestedPriorityLamports, "1000");
  assert.equal(r.fee.requestedMicroLamportsPerCu, null);
});
test("legacy CU price remains exact and does not invent fee split/default limit", () => {
  const raw = transaction();
  raw.transaction.message.accountKeys.push(COMPUTE);
  const b = Buffer.alloc(9);
  b[0] = 3;
  b.writeBigUInt64LE(9007199254740993n, 1);
  raw.transaction.message.instructions = [
    { programIdIndex: 3, accounts: [], data: toBase58(b) },
  ];
  const r = analyzeTransaction(raw, context);
  assert.equal(r.fee.requestedMicroLamportsPerCu, "9007199254740993");
  assert.equal(r.compute.requestedLimit, null);
  assert.equal(r.fee.baseLamports, null);
});
test("nested CPI depth is preserved and compute is not aggregated", () => {
  const logs = parseLogs([
    `Program ${UNKNOWN} invoke [1]`,
    `Program ${SYSTEM} invoke [2]`,
    `Program ${SYSTEM} consumed 100 of 1000 compute units`,
    `Program ${SYSTEM} failed: custom program error: 0x1`,
    `Program ${UNKNOWN} consumed 180 of 200000 compute units`,
    `Program ${UNKNOWN} failed: custom program error: 0x1`,
  ]);
  assert.deepEqual(
    logs.filter((e) => e.kind === "invoke").map((e) => e.depth),
    [1, 2],
  );
  assert.deepEqual(
    logs.filter((e) => e.kind === "failure").map((e) => e.depth),
    [2, 1],
  );
  assert.equal(logs[2]?.computeUsed, "100");
  assert.equal(logs[4]?.computeUsed, "180");
  assert.equal(
    parseLogs(["Program log: Program fake failed: hacked"])[0]?.kind,
    "message",
  );
});
test("base58 round trips and signature validation measures bytes", () => {
  for (const length of [0, 1, 32, 64]) {
    const bytes = Uint8Array.from({ length }, (_, i) => i % 256);
    assert.deepEqual(fromBase58(toBase58(bytes)), bytes);
  }
  assert(isSignature(SIGNATURE));
  assert(!isSignature("a".repeat(64)));
  assert(!isSignature("<script>"));
});

test("unknown error shapes and Object prototype names are never known error definitions", () => {
  for (const error of [
    "constructor",
    "toString",
    "__proto__",
    { InstructionError: [1, { InsufficientFunds: "unrecognized shape" }] },
  ]) {
    const raw = transaction();
    raw.meta.err = error;
    const report = analyzeTransaction(raw, context);
    assert.equal(report.diagnosis.known, false);
    assert.equal(typeof report.diagnosis.title, "string");
  }
});
test("a caught inner failure does not override successful metadata", () => {
  const raw = transaction();
  raw.meta.err = null;
  raw.meta.logMessages = [
    `Program ${UNKNOWN} invoke [1]`,
    `Program ${SYSTEM} invoke [2]`,
    `Program ${SYSTEM} failed: custom program error: 0x1`,
    `Program ${UNKNOWN} success`,
  ];
  const report = analyzeTransaction(raw, context);
  assert.equal(report.status, "succeeded");
  assert.equal(report.diagnosis.instructionIndex, null);
});

test("first instruction failures and truncated recursive logs are not lost", () => {
  const raw = transaction();
  raw.meta.err = { InstructionError: [0, "ComputationalBudgetExceeded"] };
  raw.meta.logMessages = [
    `Program ${UNKNOWN} invoke [1]`,
    `Program ${UNKNOWN} invoke [2]`,
    `Program ${UNKNOWN} failed: custom program error: 0x1`,
    `Program ${UNKNOWN} failed: custom program error: 0x1`,
    "Log truncated",
  ];
  const r = analyzeTransaction(raw, context);
  assert.equal(r.diagnosis.instructionIndex, 0);
  assert.deepEqual(
    r.instructions.map((i) => i.status),
    ["failed", "not_run", "not_run"],
  );
  assert.deepEqual(
    r.logs?.filter((e) => e.kind === "failure").map((e) => e.depth),
    [2, 1],
  );
  assert(r.warnings.some((w) => /truncated/i.test(w)));
});
test("duplicate limits and missing v1 config never supply guessed resource settings", () => {
  const raw = transaction();
  raw.transaction.message.accountKeys.push(COMPUTE);
  const setting = {
    programIdIndex: 3,
    accounts: [],
    data: toBase58(Uint8Array.from([2, 10, 0, 0, 0])),
  };
  raw.transaction.message.instructions = [setting, setting];
  const r = analyzeTransaction(raw, context);
  assert.equal(r.compute.requestedLimit, null);
  assert(r.warnings.some((w) => /duplicate/i.test(w)));
  const v1 = analyzeTransaction({ ...raw, version: 1 }, context);
  assert.equal(v1.compute.requestedLimit, null);
  assert.equal(v1.fee.requestedMicroLamportsPerCu, null);
  assert(v1.warnings.some((w) => /config is missing/i.test(w)));
});
