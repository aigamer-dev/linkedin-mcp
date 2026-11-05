import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const script = new URL("../scripts/merge-config.mjs", import.meta.url).pathname;
const run = (...a) => spawnSync(process.execPath, [script, ...a], { encoding: "utf8" });
const read = (f) => JSON.parse(readFileSync(f, "utf8"));
const args = JSON.stringify(["/opt/linkedin-mcp/dist/index.js"]);

test("adds to a new mcpServers file", () => {
  const f = join(mkdtempSync(join(tmpdir(), "lm-")), "nested", "mcp.json");
  assert.equal(run("add", f, "mcpServers", "linkedin", "node", args).status, 0);
  assert.deepEqual(read(f).mcpServers.linkedin, { command: "node", args: JSON.parse(args) });
});

test("keeps other servers and is idempotent", () => {
  const dir = mkdtempSync(join(tmpdir(), "lm-"));
  const f = join(dir, "mcp.json");
  writeFileSync(f, JSON.stringify({ mcpServers: { other: { command: "x" } }, theme: "dark" }));
  run("add", f, "mcpServers", "linkedin", "node", args);
  run("add", f, "mcpServers", "linkedin", "node", args);
  const c = read(f);
  assert.equal(c.theme, "dark");
  assert.deepEqual(Object.keys(c.mcpServers).sort(), ["linkedin", "other"]);
  assert.ok(readdirSync(dir).some((n) => n.includes(".bak.")), "backup written");
});

test("opencode and vscode formats", () => {
  const dir = mkdtempSync(join(tmpdir(), "lm-"));
  const oc = join(dir, "opencode.json");
  run("add", oc, "opencode", "linkedin", "node", args);
  assert.deepEqual(read(oc).mcp.linkedin, {
    type: "local",
    command: ["node", ...JSON.parse(args)],
    enabled: true,
  });
  const vs = join(dir, "vscode.json");
  run("add", vs, "vscode", "linkedin", "node", args);
  assert.equal(read(vs).servers.linkedin.type, "stdio");
});

test("remove deletes only the named server", () => {
  const f = join(mkdtempSync(join(tmpdir(), "lm-")), "mcp.json");
  writeFileSync(f, JSON.stringify({ mcpServers: { other: { command: "x" } } }));
  run("add", f, "mcpServers", "linkedin", "node", args);
  run("remove", f, "mcpServers", "linkedin");
  assert.deepEqual(Object.keys(read(f).mcpServers), ["other"]);
});

test("refuses to touch non-JSON config", () => {
  const f = join(mkdtempSync(join(tmpdir(), "lm-")), "settings.json");
  writeFileSync(f, '{ // comment\n "a": 1 }');
  const r = run("add", f, "mcpServers", "linkedin", "node", args);
  assert.equal(r.status, 3);
  assert.match(readFileSync(f, "utf8"), /comment/);
});
