import { analyzeTransaction } from "../domain/analyze.js";
import { toBase58 } from "../domain/base58.js";
import { SYSTEM, COMPUTE } from "../domain/instructions.js";
export const examples = [
  {
    id: "insufficient-funds",
    title: "Insufficient funds",
    description: "A known instruction failure, with earlier work rolled back.",
  },
  {
    id: "unknown-program",
    title: "Unknown program error",
    description:
      "A custom error and nested calls, with no invented explanation.",
  },
  {
    id: "successful-v0",
    title: "Successful v0",
    description: "A transfer using a loaded address from a lookup table.",
  },
  {
    id: "missing-metadata",
    title: "Missing metadata",
    description:
      "A transaction whose outcome, fee and compute are unavailable.",
  },
  {
    id: "v1-config",
    title: "v1 transaction",
    description:
      "Compute and priority fee settings read from the message config.",
  },
] as const;
const payer = toBase58(new Uint8Array(32).fill(7));
const recipient = toBase58(new Uint8Array(32).fill(8));
const unknown = toBase58(new Uint8Array(32).fill(9));
function base() {
  const limit = new Uint8Array([2, 64, 13, 3, 0]);
  const transfer = new Uint8Array(12);
  transfer[0] = 2;
  transfer[4] = 64;
  transfer[5] = 66;
  transfer[6] = 15;
  return {
    slot: 321654987,
    blockTime: 1760000000,
    version: "legacy" as "legacy" | 0 | 1,
    transaction: {
      signatures: [toBase58(new Uint8Array(64).fill(11))],
      message: {
        header: {
          numRequiredSignatures: 1,
          numReadonlySignedAccounts: 0,
          numReadonlyUnsignedAccounts: 2,
        },
        recentBlockhash: payer,
        accountKeys: [payer, recipient, COMPUTE, SYSTEM],
        instructions: [
          {
            programIdIndex: 2,
            accounts: [] as number[],
            data: toBase58(limit),
          },
          { programIdIndex: 3, accounts: [0, 1], data: toBase58(transfer) },
          { programIdIndex: 3, accounts: [0, 1], data: toBase58(transfer) },
        ],
      },
    },
    meta: {
      err: { InstructionError: [1, "InsufficientFunds"] } as unknown,
      fee: 5000,
      computeUnitsConsumed: 18420,
      preBalances: [25000, 0, 1, 1],
      postBalances: [20000, 0, 1, 1],
      loadedAddresses: { writable: [] as string[], readonly: [] as string[] },
      innerInstructions: [],
      logMessages: [
        `Program ${COMPUTE} invoke [1]`,
        `Program ${COMPUTE} success`,
        `Program ${SYSTEM} invoke [1]`,
        "Program log: fictional example: account lacks required funds",
        `Program ${SYSTEM} consumed 18420 of 200000 compute units`,
        `Program ${SYSTEM} failed: insufficient funds`,
      ],
    },
  };
}
export function exampleTransaction(id: string): unknown | null {
  if (!examples.some((example) => example.id === id)) return null;
  const raw = base();
  if (id === "insufficient-funds") return raw;
  if (id === "missing-metadata") return { ...raw, meta: null };
  if (id === "unknown-program") {
    raw.transaction.message.accountKeys.push(unknown);
    raw.transaction.message.instructions[1]!.programIdIndex = 4;
    raw.meta.err = { InstructionError: [1, { Custom: 6001 }] };
    raw.meta.logMessages = [
      `Program ${COMPUTE} invoke [1]`,
      `Program ${COMPUTE} success`,
      `Program ${unknown} invoke [1]`,
      `Program ${SYSTEM} invoke [2]`,
      `Program ${SYSTEM} consumed 120 of 197000 compute units`,
      `Program ${SYSTEM} failed: custom program error: 0x1771`,
      `Program ${unknown} consumed 2440 of 200000 compute units`,
      `Program ${unknown} failed: custom program error: 0x1771`,
    ];
    raw.meta.computeUnitsConsumed = 2590;
    return raw;
  }
  raw.meta.err = null;
  raw.meta.computeUnitsConsumed = 450;
  raw.transaction.message.instructions =
    raw.transaction.message.instructions.slice(0, 2);
  raw.meta.logMessages = [
    `Program ${COMPUTE} invoke [1]`,
    `Program ${COMPUTE} success`,
    `Program ${SYSTEM} invoke [1]`,
    `Program ${SYSTEM} success`,
  ];
  if (id === "successful-v0") {
    raw.version = 0;
    raw.transaction.message.accountKeys = [payer, COMPUTE, SYSTEM];
    raw.transaction.message.instructions[0]!.programIdIndex = 1;
    raw.transaction.message.instructions[1]!.programIdIndex = 2;
    raw.transaction.message.instructions[1]!.accounts = [0, 3];
    raw.meta.loadedAddresses.writable = [recipient];
    raw.meta.preBalances = [2000000, 1, 1, 0];
    raw.meta.postBalances = [995000, 1, 1, 1000000];
    return {
      ...raw,
      transaction: {
        ...raw.transaction,
        message: {
          ...raw.transaction.message,
          addressTableLookups: [
            { accountKey: unknown, writableIndexes: [0], readonlyIndexes: [] },
          ],
        },
      },
    };
  }
  raw.version = 1;
  raw.meta.fee = 6000;
  raw.meta.preBalances = [2000000, 0, 1, 1];
  raw.meta.postBalances = [994000, 1000000, 1, 1];
  return {
    ...raw,
    transaction: {
      ...raw.transaction,
      message: {
        ...raw.transaction.message,
        transactionConfig: {
          computeUnitLimit: 30000,
          priorityFee: 1000,
          heapSize: null,
          loadedAccountsDataSizeLimit: 200000,
        },
      },
    },
  };
}
export function inspectExample(id: string) {
  const raw = exampleTransaction(id);
  if (raw === null) return null;
  const signature = base().transaction.signatures[0]!;
  return analyzeTransaction(raw, {
    signature,
    network: "devnet",
    source: "example",
    exampleId: id,
  });
}
