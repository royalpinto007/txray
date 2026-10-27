#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

try {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      port: { type: "string" },
    },
    allowPositionals: false,
  });
  if (values.help) {
    console.log(`txray | Solana Transaction Autopsy

Usage: txray [--port 4450]

  --port         Local dashboard port (default: PORT or 4450)
  -h, --help     Show this help
  -v, --version  Show the package version

Open the printed localhost URL. Press Ctrl+C to stop.
Read-only; no wallet, keys or funds required.`);
  } else if (values.version) {
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    console.log(manifest.version);
  } else {
    if (values.port !== undefined) process.env.PORT = values.port;
    await import("./server.js");
  }
} catch (error) {
  console.error(
    `txray: ${error instanceof Error ? error.message : "Could not start. Run txray --help."}`,
  );
  process.exitCode = 1;
}
