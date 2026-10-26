import { z } from "zod";
import { isSignature } from "./base58.js";
export const networkSchema = z.enum(["mainnet-beta", "devnet"]);
export type Network = z.infer<typeof networkSchema>;
export const requestSchema = z.strictObject({
  signature: z
    .string()
    .refine(
      isSignature,
      "Enter a base58 Solana transaction signature (64 bytes).",
    ),
  network: networkSchema,
});
export const uint = z
  .union([
    z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .transform(String),
    z.string().regex(/^(0|[1-9][0-9]{0,19})$/),
  ])
  .refine((v) => BigInt(v) <= 18446744073709551615n, "Value exceeds u64");
const index = z.number().int().nonnegative().max(65535);
const instruction = z
  .object({
    programIdIndex: index,
    accounts: z.array(index).max(4096),
    data: z.string().max(8192),
    stackHeight: index.nullable().optional(),
  })
  .passthrough();
export const transactionSchema = z
  .object({
    slot: uint,
    blockTime: z
      .number()
      .int()
      .nonnegative()
      .max(8640000000000)
      .nullable()
      .optional(),
    version: z
      .union([z.literal("legacy"), z.literal(0), z.literal(1)])
      .optional(),
    transaction: z
      .object({
        signatures: z.array(z.string().refine(isSignature)).min(1).max(256),
        message: z
          .object({
            accountKeys: z.array(z.string().min(1).max(64)).max(4096),
            instructions: z.array(instruction).max(4096),
            transactionConfig: z
              .object({
                computeUnitLimit: uint.nullable(),
                priorityFee: uint.nullable(),
                heapSize: uint.nullable().optional(),
                loadedAccountsDataSizeLimit: uint.nullable().optional(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough(),
      })
      .passthrough(),
    meta: z
      .object({
        err: z.json(),
        fee: uint,
        computeUnitsConsumed: uint.nullable().optional(),
        costUnits: uint.nullable().optional(),
        logMessages: z
          .array(z.string().max(200000))
          .max(20000)
          .nullable()
          .optional(),
        loadedAddresses: z
          .object({
            writable: z.array(z.string().max(64)).max(4096),
            readonly: z.array(z.string().max(64)).max(4096),
          })
          .nullable()
          .optional(),
        innerInstructions: z
          .array(
            z.object({ index, instructions: z.array(instruction).max(4096) }),
          )
          .max(4096)
          .nullable()
          .optional(),
      })
      .passthrough()
      .nullable(),
  })
  .passthrough();
export type Transaction = z.infer<typeof transactionSchema>;
