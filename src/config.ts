import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env loader (no extra dependency). Real env vars win.
const envFile = join(root, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

export const clientId = process.env.LINKEDIN_CLIENT_ID ?? "";
export const clientSecret = process.env.LINKEDIN_CLIENT_SECRET ?? "";
export const redirectUri =
  process.env.LINKEDIN_REDIRECT_URI ?? "http://localhost:3000/callback";
export const scopes = ["openid", "profile", "email", "w_member_social"];

// Tokens live outside the repo.
const tokenPath = join(homedir(), ".config", "linkedin-mcp", "token.json");

export interface Token {
  access_token: string;
  expires_at: number;
}

export function saveToken(t: Token): void {
  mkdirSync(dirname(tokenPath), { recursive: true, mode: 0o700 });
  writeFileSync(tokenPath, JSON.stringify(t), { mode: 0o600 });
}

export function loadToken(): Token {
  if (!existsSync(tokenPath)) {
    throw new Error("Not authenticated. Run `npm run auth` in the linkedin-mcp folder.");
  }
  const t = JSON.parse(readFileSync(tokenPath, "utf8")) as Token;
  if (Date.now() > t.expires_at) {
    throw new Error("LinkedIn token expired. Run `npm run auth` again.");
  }
  return t;
}
