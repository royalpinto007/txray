export class TxrayError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
const instructionErrors: Record<string, [string, string]> = {
  InsufficientFunds: [
    "Insufficient funds",
    "An account did not have the funds required by this instruction. The record does not identify a specific account.",
  ],
  ComputationalBudgetExceeded: [
    "Compute budget exceeded",
    "Execution used more compute than allowed. Review the program and the requested compute limit before retrying.",
  ],
  ProgramFailedToComplete: [
    "Program did not complete",
    "The program stopped before completing. Inspect the runtime logs; this error alone does not establish why.",
  ],
  InvalidArgument: [
    "Invalid argument",
    "An instruction supplied an argument the program rejected.",
  ],
  InvalidInstructionData: [
    "Invalid instruction data",
    "The program could not accept the instruction data. Check its encoding and the program interface.",
  ],
  InvalidAccountData: [
    "Invalid account data",
    "The program rejected the contents or type of an account.",
  ],
  MissingRequiredSignature: [
    "Missing required signature",
    "An instruction required a signing authority that was not supplied.",
  ],
  IncorrectProgramId: [
    "Incorrect program",
    "The instruction was given an account owned by an unexpected program, or invoked the wrong program.",
  ],
  NotEnoughAccountKeys: [
    "Missing account",
    "The instruction did not supply all required accounts.",
  ],
  AccountAlreadyInitialized: [
    "Account already initialized",
    "The instruction tried to initialize an account that was already initialized.",
  ],
  UninitializedAccount: [
    "Account not initialized",
    "The program expected an initialized account.",
  ],
  PrivilegeEscalation: [
    "Account privilege escalation",
    "An inner call requested signing or writing permissions that its caller did not provide.",
  ],
  ReadonlyDataModified: [
    "Read-only account modified",
    "A program tried to modify data it was not allowed to write.",
  ],
  ArithmeticOverflow: [
    "Arithmetic overflow",
    "An arithmetic operation could not be represented within the allowed numeric range.",
  ],
  InvalidSeeds: [
    "Invalid PDA seeds",
    "The supplied seeds did not produce a valid program-derived address.",
  ],
};
const transactionErrors: Record<string, [string, string]> = {
  InsufficientFundsForFee: [
    "Insufficient funds for fee",
    "The fee payer could not cover the transaction fee.",
  ],
  InsufficientFundsForRent: [
    "Insufficient funds for account storage",
    "An account would not retain the minimum balance needed for its storage.",
  ],
  AccountNotFound: [
    "Account not found",
    "A required account was not available on the selected network.",
  ],
  ProgramAccountNotFound: [
    "Program not found",
    "A required program account was not available.",
  ],
  BlockhashNotFound: [
    "Blockhash not found",
    "The transaction blockhash was unavailable or expired.",
  ],
  InvalidProgramForExecution: [
    "Program cannot execute",
    "An instruction referenced an account that cannot execute as a program.",
  ],
  InvalidAccountIndex: [
    "Invalid account index",
    "An instruction referenced an account outside the transaction account list.",
  ],
  SignatureFailure: [
    "Signature verification failed",
    "At least one transaction signature did not verify.",
  ],
  AddressLookupTableNotFound: [
    "Address lookup table not found",
    "A referenced address lookup table was unavailable.",
  ],
  InvalidAddressLookupTableIndex: [
    "Invalid lookup table index",
    "The transaction referenced an entry outside its address lookup table.",
  ],
  MaxLoadedAccountsDataSizeExceeded: [
    "Account data limit exceeded",
    "The transaction needed more loaded account data than its configured limit.",
  ],
  UnsupportedVersion: [
    "Unsupported transaction version",
    "The transaction uses a version the runtime does not support.",
  ],
};
export interface Diagnosis {
  title: string;
  explanation: string;
  known: boolean;
  instructionIndex: number | null;
  programId: string | null;
  raw: unknown;
}
export function diagnose(
  error: unknown,
  status: "failed" | "succeeded" | "unknown",
): Diagnosis {
  const result: Diagnosis = {
    title:
      status === "succeeded"
        ? "Transaction succeeded"
        : status === "unknown"
          ? "Outcome unavailable"
          : "Unknown transaction error",
    explanation:
      status === "succeeded"
        ? "All instructions completed. This records execution, not service quality or token safety."
        : status === "unknown"
          ? "The RPC did not provide transaction metadata, so the outcome cannot be determined."
          : "The runtime returned an error txray does not recognize. The raw error is preserved below.",
    known: status === "succeeded",
    instructionIndex: null,
    programId: null,
    raw: error,
  };
  if (status !== "failed") return result;
  let detail = error;
  let map = transactionErrors;
  if (
    typeof error === "object" &&
    error !== null &&
    !Array.isArray(error) &&
    "InstructionError" in error
  ) {
    const value = (error as { InstructionError: unknown }).InstructionError;
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      Number.isSafeInteger(value[0]) &&
      value[0] >= 0
    ) {
      result.instructionIndex = value[0] as number;
      detail = value[1];
      map = instructionErrors;
    }
  }
  if (
    typeof detail === "object" &&
    detail !== null &&
    !Array.isArray(detail) &&
    "Custom" in detail
  ) {
    result.title = "Unknown program error";
    result.explanation = `The program returned custom error ${JSON.stringify((detail as { Custom: unknown }).Custom)}. Its meaning is program-specific; txray has no verified definition for it. Read the program documentation and logs. Log text alone is not a verified error definition.`;
    return result;
  }
  let code: string | undefined;
  if (typeof detail === "string") code = detail;
  else if (
    map === transactionErrors &&
    typeof detail === "object" &&
    detail !== null &&
    !Array.isArray(detail) &&
    Object.keys(detail).length === 1 &&
    "InsufficientFundsForRent" in detail
  ) {
    const rent = (detail as { InsufficientFundsForRent: unknown })
      .InsufficientFundsForRent;
    if (
      typeof rent === "object" &&
      rent !== null &&
      "account_index" in rent &&
      Number.isSafeInteger(rent.account_index) &&
      Number(rent.account_index) >= 0
    )
      code = "InsufficientFundsForRent";
  }
  const known = code && Object.hasOwn(map, code) ? map[code] : undefined;
  if (known) {
    result.title = known[0];
    result.explanation = known[1];
    result.known = true;
  }
  return result;
}
