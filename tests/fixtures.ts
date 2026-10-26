export const SIGNATURE = "3".repeat(87);
export const SYSTEM = "11111111111111111111111111111111";
export const COMPUTE = "ComputeBudget111111111111111111111111111111";
export const UNKNOWN = "BPFLoaderUpgradeab1e11111111111111111111111";
export function transaction() {
  return {
    slot: 123456,
    blockTime: 1700000000,
    version: "legacy" as string | number,
    transaction: {
      signatures: [SIGNATURE],
      message: {
        header: {
          numRequiredSignatures: 1,
          numReadonlySignedAccounts: 0,
          numReadonlyUnsignedAccounts: 1,
        },
        accountKeys: [
          "Vote111111111111111111111111111111111111111",
          SYSTEM,
          UNKNOWN,
        ],
        recentBlockhash: SYSTEM,
        instructions: [
          { programIdIndex: 1, accounts: [0], data: "" },
          { programIdIndex: 2, accounts: [0], data: "" },
          { programIdIndex: 1, accounts: [0], data: "" },
        ],
      },
    },
    meta: {
      err: { InstructionError: [1, "InsufficientFunds"] } as unknown,
      fee: 5000,
      computeUnitsConsumed: 18420,
      costUnits: 21000,
      preBalances: [100000, 1, 1],
      postBalances: [95000, 1, 1],
      loadedAddresses: { writable: [] as string[], readonly: [] as string[] },
      innerInstructions: [] as {
        index: number;
        instructions: {
          programIdIndex: number;
          accounts: number[];
          data: string;
          stackHeight?: number;
        }[];
      }[],
      logMessages: [
        `Program ${SYSTEM} invoke [1]`,
        `Program ${SYSTEM} success`,
        `Program ${UNKNOWN} invoke [1]`,
        "Program log: fictional example",
        `Program ${UNKNOWN} consumed 18420 of 200000 compute units`,
        `Program ${UNKNOWN} failed: insufficient funds`,
      ] as string[] | null,
    },
  };
}
