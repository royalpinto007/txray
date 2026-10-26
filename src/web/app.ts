import type { Report } from "../domain/analyze.js";
import { isSignature } from "../domain/base58.js";
function get<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node as T;
}
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
const form = get<HTMLFormElement>("inspect-form");
const signature = get<HTMLInputElement>("signature");
const network = get<HTMLSelectElement>("network");
const activity = get("activity");
const error = get("error");
const result = get("result");
const empty = get("empty");
let current: Report | null = null;
const labels: Record<string, string> = {
  succeeded: "Succeeded",
  failed: "Failed",
  rolled_back: "Ran; rolled back",
  not_run: "Not run",
  unknown: "Not determined",
};
function integer(value: string | null): string {
  return value === null
    ? "Not reported"
    : BigInt(value).toLocaleString("en-US");
}
function fact(list: HTMLElement, title: string, value: string, className = "") {
  list.append(element("dt", "", title), element("dd", className, value));
}
function render(report: Report) {
  current = report;
  const synthetic = report.source === "example";
  get("source-label").textContent = synthetic
    ? "Offline example · Fictional values"
    : `Live RPC · ${report.network === "devnet" ? "Devnet" : "Mainnet"}`;
  get("source-label").className = `source-label${synthetic ? " example" : ""}`;
  get("diagnosis").className = `diagnosis ${report.status}`;
  get("outcome").textContent =
    report.status === "failed"
      ? "Transaction failed"
      : report.status === "succeeded"
        ? "Execution completed"
        : "Incomplete record";
  get("diagnosis-title").textContent = report.diagnosis.title;
  get("explanation").textContent = report.diagnosis.explanation;
  const failure = get("failure-note");
  failure.hidden = report.status !== "failed";
  failure.textContent =
    "Program state changes ordinarily roll back on failure. Fees and durable-nonce advancement can persist. A recorded fee is not refunded by this debugger.";
  const index = report.diagnosis.instructionIndex;
  get("failed-instruction").textContent =
    index === null ? "Not identified" : `#${index + 1} (RPC index ${index})`;
  get("fee").textContent =
    report.fee.sol === null ? "Not reported" : `${report.fee.sol} SOL`;
  get("compute").textContent =
    report.compute.consumed === null
      ? "Not reported"
      : `${integer(report.compute.consumed)} CU`;
  get("failed-program").textContent =
    report.diagnosis.programId ?? "Not identified";
  const resources = get("resources");
  resources.replaceChildren();
  fact(
    resources,
    "Recorded fee",
    report.fee.lamports === null
      ? "Not reported"
      : `${integer(report.fee.lamports)} lamports`,
  );
  fact(resources, "Base / priority split", "Not provided by getTransaction");
  fact(
    resources,
    "Requested compute limit",
    report.compute.requestedLimit === null
      ? "Not reported"
      : `${integer(report.compute.requestedLimit)} CU`,
  );
  if (report.version === 1)
    fact(
      resources,
      "Requested priority fee (v1)",
      report.fee.requestedPriorityLamports === null
        ? "Not set or unavailable"
        : `${integer(report.fee.requestedPriorityLamports)} lamports`,
    );
  else
    fact(
      resources,
      "Requested CU price",
      report.fee.requestedMicroLamportsPerCu === null
        ? "Not reported"
        : `${integer(report.fee.requestedMicroLamportsPerCu)} micro-lamports/CU`,
    );
  fact(
    resources,
    "Scheduling cost",
    report.compute.costUnits === null
      ? "Not reported"
      : `${integer(report.compute.costUnits)} cost units`,
  );
  const identity = get("identity");
  identity.replaceChildren();
  fact(identity, "Signature", report.signature, "address");
  fact(identity, "Version", String(report.version));
  fact(identity, "Slot", integer(report.slot));
  fact(identity, "Fee payer", report.fee.payer ?? "Not reported", "address");
  const time =
    report.blockTime === null ? null : new Date(report.blockTime * 1000);
  fact(
    identity,
    "Block time",
    time && !Number.isNaN(time.getTime()) ? time.toISOString() : "Not reported",
  );
  fact(identity, "Observed", new Date(report.checkedAt).toISOString());
  const warnings = get("warnings");
  warnings.replaceChildren(...report.warnings.map((w) => element("li", "", w)));
  get("warnings-section").hidden = report.warnings.length === 0;
  get("raw-error").textContent = JSON.stringify(report.diagnosis.raw, null, 2);
  get("instruction-count").textContent =
    `${report.instructions.length} top-level`;
  get("instructions").replaceChildren(
    ...report.instructions.map((instruction) => {
      const row = element("li", `instruction ${instruction.status}`);
      row.append(
        element("span", "instruction-number", `#${instruction.number}`),
      );
      const body = element("div");
      const heading = element("div", "instruction-header");
      heading.append(
        element("strong", "", instruction.programName),
        element(
          "span",
          "instruction-state",
          labels[instruction.status] ?? "Not determined",
        ),
      );
      body.append(
        heading,
        element(
          "p",
          "instruction-id address",
          instruction.programId ?? "Program address not available",
        ),
      );
      if (instruction.action)
        body.append(element("p", "instruction-action", instruction.action));
      const details = element("details");
      details.append(
        element(
          "summary",
          "",
          `Accounts & data (RPC index ${instruction.index})`,
        ),
      );
      details.append(
        element(
          "pre",
          "",
          `Accounts:\n${instruction.accounts.map((address, i) => `${i}: ${address ?? "Unresolved address"}`).join("\n") || "None"}\n\nData (base58):\n${instruction.data || "(empty)"}`,
        ),
      );
      for (const inner of instruction.inner) {
        const child = element("div", "inner-call");
        child.append(
          element("strong", "", `Inner call: ${inner.programName}`),
          element("p", "address", inner.programId ?? "Unresolved address"),
        );
        if (inner.action) child.append(element("p", "", inner.action));
        details.append(child);
      }
      body.append(details);
      row.append(body);
      return row;
    }),
  );
  get("log-count").textContent =
    report.logs === null ? "Unavailable" : `${report.logs.length} lines`;
  const logs = get("logs");
  logs.replaceChildren();
  if (report.logs === null || report.logs.length === 0)
    logs.append(
      element(
        "p",
        "logs-empty",
        report.logs === null
          ? "The RPC did not provide logs for this transaction."
          : "No execution log lines were recorded.",
      ),
    );
  else
    for (const event of report.logs) {
      const line = element(
        "div",
        `log-line log-${event.kind} log-depth-${Math.min(8, event.depth ?? 1)}`,
      );
      line.append(
        element("span", "log-number", String(event.line)),
        element("span", "log-text", event.text),
      );
      logs.append(line);
    }
  const explorer = get<HTMLAnchorElement>("explorer");
  explorer.hidden = synthetic;
  explorer.href = `https://explorer.solana.com/tx/${encodeURIComponent(report.signature)}${report.network === "devnet" ? "?cluster=devnet" : ""}`;
  empty.hidden = true;
  result.hidden = false;
}
async function load(url: string, body?: object) {
  error.hidden = true;
  activity.textContent = body
    ? "Looking up transaction…"
    : "Loading offline example…";
  result.hidden = true;
  empty.hidden = true;
  const controls = document.querySelectorAll<
    HTMLButtonElement | HTMLInputElement | HTMLSelectElement
  >(
    "#inspect-form button,#inspect-form input,#inspect-form select,#examples button",
  );
  controls.forEach((control) => (control.disabled = true));
  try {
    const response = await fetch(url, {
      ...(body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
      signal: AbortSignal.timeout(16000),
    });
    const data = (await response.json()) as Report & {
      error?: { message?: string };
    };
    if (!response.ok)
      throw new Error(data.error?.message ?? "Lookup failed. Try again.");
    render(data);
    activity.textContent = "";
  } catch (cause) {
    current = null;
    error.textContent =
      cause instanceof Error && cause.name === "TimeoutError"
        ? "Lookup timed out. Please try again."
        : cause instanceof Error
          ? cause.message
          : "Could not reach the local server.";
    error.hidden = false;
    empty.hidden = false;
    activity.textContent = "";
  } finally {
    controls.forEach((control) => (control.disabled = false));
  }
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = signature.value.trim();
  if (!isSignature(value)) {
    error.textContent =
      "Enter a valid Solana transaction signature: a base58 value representing 64 bytes.";
    error.hidden = false;
    signature.setAttribute("aria-invalid", "true");
    signature.focus();
    return;
  }
  signature.removeAttribute("aria-invalid");
  void load("/api/transactions", { signature: value, network: network.value });
});
get("copy").addEventListener("click", () => {
  if (!current) return;
  void navigator.clipboard
    ?.writeText(current.summaryText)
    .then(() => {
      activity.textContent = "Report copied.";
    })
    .catch(() => {
      activity.textContent =
        "Clipboard unavailable. Export JSON to save this report.";
    });
  if (!navigator.clipboard)
    activity.textContent =
      "Clipboard unavailable. Export JSON to save this report.";
});
get("export").addEventListener("click", () => {
  if (!current) return;
  const blob = new Blob([JSON.stringify(current, null, 2) + "\n"], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = element("a");
  link.href = url;
  link.download = `txray-${current.source === "example" ? "example-" + current.exampleId : current.signature.slice(0, 12)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  activity.textContent = "JSON export downloaded.";
});
async function loadExamples() {
  try {
    const response = await fetch("/api/examples");
    if (!response.ok) throw new Error("Examples unavailable");
    const examples = (await response.json()) as {
      id: string;
      title: string;
      description: string;
    }[];
    for (const example of examples) {
      const button = element("button", "", example.title);
      button.type = "button";
      button.title = example.description;
      button.addEventListener(
        "click",
        () => void load(`/api/examples/${encodeURIComponent(example.id)}`),
      );
      get("examples").append(button);
    }
  } catch {
    activity.textContent =
      "Offline examples could not be loaded. Refresh the page or inspect a signature.";
  }
}
void loadExamples();
