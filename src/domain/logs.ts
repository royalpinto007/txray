export interface LogEvent {
  line: number;
  text: string;
  kind: "invoke" | "success" | "failure" | "compute" | "message" | "truncated";
  depth: number | null;
  programId: string | null;
  computeUsed: string | null;
  computeLimit: string | null;
}
export function parseLogs(lines: string[]): LogEvent[] {
  const stack: { programId: string; depth: number }[] = [];
  return lines.map((text, index) => {
    const event: LogEvent = {
      line: index + 1,
      text,
      kind: "message",
      depth: stack.at(-1)?.depth ?? null,
      programId: null,
      computeUsed: null,
      computeLimit: null,
    };
    const invoke =
      /^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) invoke \[([0-9]+)\]$/.exec(text);
    const end =
      /^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) (success|failed: .*)$/.exec(text);
    const compute =
      /^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) consumed ([0-9]+) of ([0-9]+) compute units$/.exec(
        text,
      );
    if (invoke && Number(invoke[2]) > 0 && Number(invoke[2]) <= 64) {
      const depth = Number(invoke[2]);
      while (stack.length && (stack.at(-1)?.depth ?? 0) >= depth) stack.pop();
      stack.push({ programId: invoke[1]!, depth });
      Object.assign(event, { kind: "invoke", programId: invoke[1], depth });
    } else if (end) {
      const frame = stack.findLastIndex((f) => f.programId === end[1]);
      Object.assign(event, {
        kind: end[2] === "success" ? "success" : "failure",
        programId: end[1],
        depth: frame < 0 ? null : stack[frame]!.depth,
      });
      if (frame >= 0) stack.splice(frame);
    } else if (compute) {
      Object.assign(event, {
        kind: "compute",
        programId: compute[1],
        depth: stack.findLast((f) => f.programId === compute[1])?.depth ?? null,
        computeUsed: compute[2],
        computeLimit: compute[3],
      });
    } else if (/^Log truncated(?:$|:)/i.test(text)) {
      event.kind = "truncated";
    }
    return event;
  });
}
