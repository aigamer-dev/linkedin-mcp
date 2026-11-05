# CLAUDE.md

Guidance for coding agents working in this repository. Humans: see [CONTRIBUTING.md](CONTRIBUTING.md).

## What this is

`linkedin-mcp` is a local MCP server (TypeScript, Node 20+, stdio transport) that exposes two tools, `get_profile` and `create_post`, backed by LinkedIn's official OAuth 2.0 API. Users bring their own LinkedIn developer app.

## Commands

```bash
npm install
npm run build     # tsc -> dist/
npm test          # build + node --test (merge-config and server suites)
npm run auth      # build + one-off OAuth flow (needs .env; opens a localhost:3000 listener)
./install.sh --dry-run --agents claude,cursor   # preview the installer
```

Run `npm test` before proposing a change. If you edit `install.sh`, also run `shellcheck install.sh` when available.

## Layout

- `src/index.ts`: server and tools. `src/auth.ts`: OAuth helper. `src/config.ts`: `.env` loading, scopes, token storage.
- `install.sh` + `scripts/merge-config.mjs`: multi-agent installer. `test/`: `node:test` suites. `docs/`: GitHub Pages landing page.

## Rules that are easy to get wrong

- **stdout is the MCP protocol stream.** Never `console.log` in server code. Use `console.error`.
- **Never read, print, commit or log** `.env`, `~/.config/linkedin-mcp/token.json`, client secrets or access tokens. Tests must run with an empty `HOME` and no network.
- `create_post` publishes to a real LinkedIn feed. Never call it against a real token while testing or demonstrating; mock or stop at validation. Confirm post text with the user before any real publish.
- The installer must stay idempotent, back up every file it edits, and refuse to edit config it cannot parse as plain JSON. Do not "fix" that by stripping comments or rewriting the file.
- Changing a tool's name, inputs or required scopes is a breaking change: update `README.md`, `docs/index.html` and `CHANGELOG.md` together.
- LinkedIn app names cannot contain "LinkedIn". Do not use LinkedIn or other vendors' logos or branding in the project.

## Workflow

- `main` is protected: work on a branch and open a PR (2 approvals and passing CI are required; only the maintainer merges). Never force-push `main`.
- Update `CHANGELOG.md` under `## [Unreleased]` for any user-visible change.
- Keep changes small and focused; match the existing style (ES modules, strict TypeScript, no extra runtime dependencies without a reason).

## Using the server from an agent

Tools: `get_profile` (no input) and `create_post` (`text` 1-3000 chars, `visibility` `PUBLIC` or `CONNECTIONS`). If a call returns "Not authenticated" or "token expired", tell the user to run `npm run auth` in the install directory; do not try to obtain tokens yourself.
