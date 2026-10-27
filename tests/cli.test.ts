import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const version = (
  JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string }
).version;
function run(args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, ["--import", "tsx", cli, ...args], {
    encoding: "utf8",
    timeout: 5000,
    env: { ...process.env, ...env },
  });
}
test("help explains how to launch txray without starting a server", () => {
  const result = run(["--help"], { PORT: "not-a-port" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage: txray/);
  assert.match(result.stdout, /--port/);
  assert.match(result.stdout, /Read-only/);
});
test("version prints package version without binding a port", () => {
  const result = run(["--version"], { PORT: "not-a-port" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), version);
});
test("invalid ports and unknown arguments fail with nonzero exit codes", () => {
  for (const args of [
    ["--port", "0"],
    ["--port", "65536"],
    ["--port", "123abc"],
    ["--port"],
    ["--unknown"],
    ["unexpected"],
  ]) {
    const result = run(args);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert(result.stderr.length > 0);
  }
});
