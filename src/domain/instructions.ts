import { fromBase58 } from "./base58.js";
export const COMPUTE = "ComputeBudget111111111111111111111111111111";
export const SYSTEM = "11111111111111111111111111111111";
const programs: Record<string, string> = {
  [SYSTEM]: "System Program",
  [COMPUTE]: "Compute Budget",
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: "Token Program",
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: "Token-2022",
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: "Associated Token",
  MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: "Memo",
  BPFLoaderUpgradeab1e11111111111111111111111: "Upgradeable Loader",
};
export const programName = (id: string | null): string =>
  id
    ? Object.hasOwn(programs, id)
      ? programs[id]!
      : "Unknown program"
    : "Unresolved program";
export function formatLamports(value: string): string {
  const number = BigInt(value);
  const whole = number / 1000000000n;
  const fraction = (number % 1000000000n)
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "");
  return whole.toString() + (fraction ? "." + fraction : "");
}
function le(bytes: Uint8Array): bigint {
  return bytes.reduceRight((value, byte) => value * 256n + BigInt(byte), 0n);
}
export function decodeInstruction(
  programId: string | null,
  data: string,
): { action: string | null; limit: string | null; price: string | null } {
  const result: {
    action: string | null;
    limit: string | null;
    price: string | null;
  } = { action: null, limit: null, price: null };
  try {
    const bytes = fromBase58(data);
    if (programId === COMPUTE) {
      if (bytes[0] === 2 && bytes.length === 5) {
        result.limit = le(bytes.slice(1)).toString();
        result.action = `Set compute unit limit: ${result.limit} CU`;
      }
      if (bytes[0] === 3 && bytes.length === 9) {
        result.price = le(bytes.slice(1)).toString();
        result.action = `Set compute unit price: ${result.price} micro-lamports/CU`;
      }
    } else if (
      programId === SYSTEM &&
      bytes.length === 12 &&
      le(bytes.slice(0, 4)) === 2n
    ) {
      result.action = `Transfer requested: ${formatLamports(le(bytes.slice(4)).toString())} SOL`;
    }
  } catch {
    /* Unrecognized or malformed instruction data remains undecoded. */
  }
  return result;
}
