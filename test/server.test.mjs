import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const entry = new URL("../dist/index.js", import.meta.url).pathname;

function rpc(messages) {
  // Empty HOME so a real token on the developer's machine is never used.
  const home = mkdtempSync(tmpdir() + "/lm-home-");
  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, HOME: home, USERPROFILE: home },
    stdio: ["pipe", "pipe", "inherit"],
  });
  return new Promise((resolve, reject) => {
    const replies = new Map();
    let buf = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("timeout")); }, 15000);
    child.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        const m = JSON.parse(line);
        if (m.id != null) replies.set(m.id, m);
        if (replies.size === messages.filter((x) => x.id != null).length) {
          clearTimeout(timer);
          child.kill();
          resolve(replies);
        }
      }
    });
    child.on("error", reject);
    for (const m of messages) child.stdin.write(JSON.stringify(m) + "\n");
  });
}

const init = {
  jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } },
};
const ready = { jsonrpc: "2.0", method: "notifications/initialized" };

test("server lists get_profile and create_post", async () => {
  const r = await rpc([init, ready, { jsonrpc: "2.0", id: 2, method: "tools/list" }]);
  const names = r.get(2).result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["create_post", "get_profile"]);
});

test("create_post rejects empty text before touching the network", async () => {
  const r = await rpc([
    init, ready,
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "create_post", arguments: { text: "" } } },
  ]);
  const res = r.get(2);
  assert.ok(res.error || res.result?.isError, "validation error expected");
});

test("tools fail with a clear message when not authenticated", async () => {
  const r = await rpc([
    init, ready,
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_profile", arguments: {} } },
  ]);
  const res = r.get(2);
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /Not authenticated/);
});
