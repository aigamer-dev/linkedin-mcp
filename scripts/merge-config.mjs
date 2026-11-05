#!/usr/bin/env node
// Idempotent JSON config editor used by install.sh.
// Usage:
//   merge-config.mjs add        <file> <format> <name> <command> [argsJson]   local stdio server
//   merge-config.mjs add-remote <file> <format> <name> <url>                  hosted (remote) server
//   merge-config.mjs remove     <file> <format> <name>
// formats: mcpServers (Cursor, Claude Desktop) | vscode | opencode | windsurf | gemini
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { dirname } from "node:path";

const [, , action, file, format, name, command, argsJson] = process.argv;
if (!action || !file || !format || !name) {
  console.error("usage: merge-config.mjs <add|add-remote|remove> <file> <format> <name> [command|url] [argsJson]");
  process.exit(2);
}

let cfg = {};
if (existsSync(file)) {
  const raw = readFileSync(file, "utf8").trim();
  if (raw) {
    try {
      cfg = JSON.parse(raw);
    } catch {
      console.error(`Refusing to edit ${file}: it is not plain JSON (comments or trailing commas?). Add the server manually.`);
      process.exit(3);
    }
  }
  copyFileSync(file, `${file}.bak.${Date.now()}`);
}

const args = argsJson ? JSON.parse(argsJson) : [];
const section = format === "vscode" ? "servers" : format === "opencode" ? "mcp" : "mcpServers";
cfg[section] ??= {};

if (action === "add") {
  if (format === "opencode") {
    cfg.$schema ??= "https://opencode.ai/config.json";
    cfg[section][name] = { type: "local", command: [command, ...args], enabled: true };
  } else if (format === "vscode") {
    cfg[section][name] = { type: "stdio", command, args };
  } else {
    cfg[section][name] = { command, args };
  }
} else if (action === "add-remote") {
  const url = command;
  if (!url || !/^https?:\/\//.test(url)) {
    console.error("add-remote needs an http(s) URL");
    process.exit(2);
  }
  if (format === "opencode") {
    cfg.$schema ??= "https://opencode.ai/config.json";
    cfg[section][name] = { type: "remote", url, enabled: true };
  } else if (format === "vscode") {
    cfg[section][name] = { type: "http", url };
  } else if (format === "windsurf") {
    cfg[section][name] = { serverUrl: url };
  } else if (format === "gemini") {
    cfg[section][name] = { httpUrl: url };
  } else {
    cfg[section][name] = { url };
  }
} else if (action === "remove") {
  delete cfg[section][name];
} else {
  console.error(`unknown action: ${action}`);
  process.exit(2);
}

mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
console.log(`${action === "remove" ? "Removed from" : "Registered in"} ${file}`);
