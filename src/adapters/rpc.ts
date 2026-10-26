import { z } from "zod";
import { TxrayError } from "../domain/errors.js";
import { analyzeTransaction } from "../domain/analyze.js";
import { requestSchema } from "../domain/schema.js";
export const ENDPOINTS = {
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
} as const;
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export function parseRpcJson(text: string): unknown {
  return JSON.parse(
    text,
    (_key: string, value: unknown, context?: { source?: string }) =>
      typeof value === "number" &&
      !Number.isSafeInteger(value) &&
      context?.source &&
      /^-?[0-9]+$/.test(context.source)
        ? context.source
        : value,
  ) as unknown;
}
const envelope = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.literal(1),
  result: z.unknown().optional(),
  error: z.object({ code: z.number(), message: z.string() }).optional(),
});
export interface RpcOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}
async function readBody(response: Response): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new TxrayError(
      "RESPONSE_TOO_LARGE",
      "RPC response exceeded the 2 MiB limit.",
    );
  }
  if (!response.body)
    throw new TxrayError(
      "RPC_INVALID_RESPONSE",
      "RPC returned an empty response.",
    );
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new TxrayError(
          "RESPONSE_TOO_LARGE",
          "RPC response exceeded the 2 MiB limit.",
        );
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return parseRpcJson(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new TxrayError(
      "RPC_INVALID_RESPONSE",
      "RPC returned unreadable JSON.",
    );
  }
}
export async function inspectTransaction(
  input: unknown,
  options: RpcOptions = {},
) {
  const { signature, network } = requestSchema.parse(input);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 12000,
  );
  try {
    const response = await (options.fetchImpl ?? fetch)(ENDPOINTS[network], {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      redirect: "error",
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [
          signature,
          {
            encoding: "json",
            commitment: "confirmed",
            maxSupportedTransactionVersion: 1,
          },
        ],
      }),
    });
    if (response.status === 429) {
      await response.body?.cancel();
      const retry = Number(response.headers.get("retry-after"));
      throw new TxrayError(
        "RPC_RATE_LIMITED",
        "The public RPC is busy. Wait before retrying.",
        429,
        Number.isFinite(retry) && retry > 0
          ? Math.min(3600, Math.ceil(retry))
          : 30,
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new TxrayError(
        "RPC_UNAVAILABLE",
        `Public RPC returned HTTP ${response.status}. Try again later.`,
        503,
      );
    }
    const parsed = envelope.safeParse(await readBody(response));
    if (!parsed.success)
      throw new TxrayError(
        "RPC_INVALID_RESPONSE",
        "RPC response did not match the expected format.",
      );
    const data = parsed.data;
    if (data.error) {
      if (data.error.code === -32015)
        throw new TxrayError(
          "UNSUPPORTED_VERSION",
          "The RPC cannot return this transaction version. Legacy, v0 and v1 are requested.",
        );
      throw new TxrayError(
        "RPC_ERROR",
        `The RPC could not complete the lookup (code ${data.error.code}). Try again later.`,
      );
    }
    if (data.result === null)
      throw new TxrayError(
        "TRANSACTION_NOT_FOUND",
        "Transaction not available on this network at confirmed commitment. Check the network; it may be unconfirmed, pruned or not found.",
        404,
      );
    if (data.result === undefined)
      throw new TxrayError(
        "RPC_INVALID_RESPONSE",
        "RPC did not return a transaction result.",
      );
    try {
      const report = analyzeTransaction(data.result, {
        signature,
        network,
        source: "live",
      });
      if (report.raw.transaction.signatures[0] !== signature)
        throw new Error("Signature mismatch");
      return report;
    } catch {
      throw new TxrayError(
        "RPC_INVALID_RESPONSE",
        "The RPC transaction has an unsupported or malformed structure. No diagnosis was inferred.",
      );
    }
  } catch (error) {
    if (error instanceof TxrayError) throw error;
    if (controller.signal.aborted)
      throw new TxrayError(
        "RPC_TIMEOUT",
        "The public RPC did not respond in time. Try again.",
        504,
      );
    throw new TxrayError(
      "RPC_UNAVAILABLE",
      "Could not reach the public RPC. Check your connection and try again.",
      503,
    );
  } finally {
    clearTimeout(timer);
  }
}
