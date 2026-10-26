import { transactionSchema, type Network } from "./schema.js";
import { diagnose } from "./errors.js";
import { parseLogs } from "./logs.js";
import {
  programName,
  decodeInstruction,
  formatLamports,
  COMPUTE,
} from "./instructions.js";
export interface InspectionContext {
  signature: string;
  network: Network;
  source: "live" | "example";
  exampleId?: string;
}
export function analyzeTransaction(input: unknown, context: InspectionContext) {
  const raw = transactionSchema.parse(input);
  const meta = raw.meta;
  const message = raw.transaction.message;
  const status =
    meta === null ? "unknown" : meta.err === null ? "succeeded" : "failed";
  const diagnosis = diagnose(meta?.err ?? null, status);
  const warnings: string[] = [];
  if (meta === null)
    warnings.push(
      "Transaction metadata is missing. Outcome, fee and compute usage are unknown.",
    );
  if (raw.version === undefined)
    warnings.push(
      "Transaction version was not provided. Compute configuration is not inferred.",
    );
  if (raw.version === 1 && !message.transactionConfig)
    warnings.push(
      "The v1 transaction config is missing. Requested compute and priority fee are unknown.",
    );
  const keys = [
    ...message.accountKeys,
    ...(meta?.loadedAddresses?.writable ?? []),
    ...(meta?.loadedAddresses?.readonly ?? []),
  ];
  const resolve = (index: number): string | null => {
    const key = keys[index];
    if (!key && !warnings.some((w) => w.startsWith("Some account")))
      warnings.push(
        "Some account addresses could not be resolved. Lookup-table addresses may be missing.",
      );
    return key ?? null;
  };
  if (
    diagnosis.instructionIndex !== null &&
    diagnosis.instructionIndex >= message.instructions.length
  ) {
    warnings.push(
      "The reported failed instruction index is outside the instruction list. Its location is unknown.",
    );
    diagnosis.instructionIndex = null;
  }
  let requestedLimit: string | null = null;
  let price: string | null = null;
  let limitCount = 0;
  let priceCount = 0;
  const instructions = message.instructions.map((instruction, index) => {
    const programId = resolve(instruction.programIdIndex);
    const decoded = decodeInstruction(programId, instruction.data);
    if (raw.version === "legacy" || raw.version === 0) {
      if (decoded.limit !== null) {
        requestedLimit = decoded.limit;
        limitCount++;
      }
      if (decoded.price !== null) {
        price = decoded.price;
        priceCount++;
      }
    }
    const state =
      status === "unknown"
        ? "unknown"
        : status === "succeeded"
          ? "succeeded"
          : diagnosis.instructionIndex === null
            ? "unknown"
            : index < diagnosis.instructionIndex
              ? "rolled_back"
              : index === diagnosis.instructionIndex
                ? "failed"
                : "not_run";
    return {
      index,
      number: index + 1,
      programId,
      programName: programName(programId),
      accounts: instruction.accounts.map(resolve),
      data: instruction.data,
      status: state,
      action:
        raw.version === 1 && programId === COMPUTE
          ? "Compute Budget instruction (configuration ignored in v1)"
          : decoded.action,
      inner: (
        meta?.innerInstructions
          ?.filter((group) => group.index === index)
          .flatMap((group) => group.instructions) ?? []
      ).map((inner) => {
        const id = resolve(inner.programIdIndex);
        return {
          programId: id,
          programName: programName(id),
          accounts: inner.accounts.map(resolve),
          data: inner.data,
          stackHeight: inner.stackHeight ?? null,
          action: decodeInstruction(id, inner.data).action,
        };
      }),
    };
  });
  if (limitCount > 1 || priceCount > 1) {
    warnings.push(
      "Duplicate compute settings were recorded. Requested limits and prices are not inferred.",
    );
    requestedLimit = null;
    price = null;
  }
  if (raw.version === 1)
    requestedLimit = message.transactionConfig?.computeUnitLimit ?? null;
  diagnosis.programId =
    diagnosis.instructionIndex === null
      ? null
      : (instructions[diagnosis.instructionIndex]?.programId ?? null);
  const logs = meta?.logMessages ? parseLogs(meta.logMessages) : null;
  if (logs === null)
    warnings.push(
      "Execution logs are unavailable. No log-based execution sequence is inferred.",
    );
  if (logs?.some((log) => log.kind === "truncated"))
    warnings.push(
      "The runtime truncated its logs. This execution log is incomplete.",
    );
  if (meta?.computeUnitsConsumed == null)
    warnings.push(
      "Compute consumption was not reported. Missing compute is not zero.",
    );
  const fee = {
    lamports: meta?.fee ?? null,
    sol: meta ? formatLamports(meta.fee) : null,
    baseLamports: null,
    requestedPriorityLamports:
      raw.version === 1
        ? (message.transactionConfig?.priorityFee ?? null)
        : null,
    requestedMicroLamportsPerCu: price,
    payer: message.accountKeys[0] ?? null,
  };
  const report = {
    schemaVersion: 1,
    signature: context.signature,
    network: context.network,
    source: context.source,
    exampleId: context.exampleId ?? null,
    checkedAt: new Date().toISOString(),
    slot: raw.slot,
    blockTime: raw.blockTime ?? null,
    version: raw.version ?? "unknown",
    status,
    diagnosis,
    fee,
    compute: {
      consumed: meta?.computeUnitsConsumed ?? null,
      costUnits: meta?.costUnits ?? null,
      requestedLimit,
    },
    instructions,
    logs,
    warnings,
    raw,
    summaryText: "",
  };
  report.summaryText = [
    `txray | ${context.source === "example" ? "Fictional offline example" : "Live RPC inspection"}`,
    `Network: ${context.network}`,
    `Signature: ${context.signature}`,
    `Outcome: ${status}`,
    `Diagnosis: ${diagnosis.title}`,
    diagnosis.explanation,
    `Failed instruction: ${diagnosis.instructionIndex === null ? "Not identified" : `#${diagnosis.instructionIndex + 1} (RPC index ${diagnosis.instructionIndex})`}`,
    `Top-level program: ${diagnosis.programId ?? "Not identified"}`,
    `Recorded fee: ${fee.sol === null ? "Not reported" : `${fee.sol} SOL (${fee.lamports} lamports)`}`,
    "Base/priority fee split: not provided by getTransaction",
    `Compute used: ${report.compute.consumed ?? "Not reported"} CU`,
    ...(status === "failed"
      ? [
          "Ordinary program state changes roll back on failure. Fees and durable-nonce advancement can persist.",
        ]
      : []),
    ...warnings.map((w) => `Note: ${w}`),
    `Observed: ${report.checkedAt}`,
  ].join("\n");
  return report;
}
export type Report = ReturnType<typeof analyzeTransaction>;
