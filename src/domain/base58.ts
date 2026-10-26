const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function fromBase58(value: string): Uint8Array {
  if (value.length > 8192) throw new Error("Base58 input too large");
  let number = 0n;
  for (const char of value) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid base58");
    number = number * 58n + BigInt(index);
  }
  const bytes: number[] = [];
  while (number > 0n) {
    bytes.push(Number(number & 255n));
    number >>= 8n;
  }
  let zeros = 0;
  while (value[zeros] === "1") zeros++;
  return Uint8Array.from([
    ...new Array<number>(zeros).fill(0),
    ...bytes.reverse(),
  ]);
}
export function toBase58(bytes: Uint8Array): string {
  let number = 0n;
  for (const byte of bytes) number = number * 256n + BigInt(byte);
  let result = "";
  while (number > 0n) {
    result = alphabet[Number(number % 58n)]! + result;
    number /= 58n;
  }
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  return "1".repeat(zeros) + result;
}
export function isSignature(value: string): boolean {
  if (value.length < 64 || value.length > 88) return false;
  try {
    return fromBase58(value).length === 64;
  } catch {
    return false;
  }
}
