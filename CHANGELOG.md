# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Hosted remote MCP connector (`worker/`, Cloudflare Workers): users add one URL and sign in with LinkedIn, with no developer app of their own. OAuth 2.1 with dynamic client registration, a consent page with per-member posting permission, privacy and terms pages, and a 10 posts per day per member limit.
- `install.sh --hosted` (and `--url`): registers the hosted connector's URL with Claude Code, OpenClaw, Gemini CLI, OpenCode, Cursor, Windsurf and VS Code using each app's own syntax, prints the right steps for Codex and Claude Desktop, and needs no clone or build. `scripts/merge-config.mjs` gained an `add-remote` action.
- CI job that boots the Worker locally and exercises the full OAuth flow.

### Security
- Update `zod` to 4.6.7, fixing GHSA-mrhx-c7xc-m3w5 (memory exhaustion when validating oversized constrained collections). This project's schemas never validated collections, so it was not exploitable here.

## [0.1.0] - 2026-11-06

### Added
- MCP server over stdio with two tools: `get_profile` and `create_post`.
- `npm run auth`: local OAuth 2.0 helper that stores the token outside the repo (`~/.config/linkedin-mcp/token.json`, mode 600).
- `install.sh`: one-line installer and uninstaller for Claude Code, Codex CLI, OpenClaw, Gemini CLI, OpenCode, Cursor, Windsurf, Claude Desktop and VS Code, with `--list`, `--agents`, `--dry-run` and `--uninstall`.
- `scripts/merge-config.mjs`: idempotent, backup-first JSON config editor.
- Test suite (`npm test`) covering the config editor and the server's tool list and error paths.
- GitHub Actions: CI on Ubuntu and macOS (Node 20 and 22) plus an installer job, and a GitHub Pages deploy for the landing page.
- Landing page, README, CONTRIBUTING, CLAUDE.md and AGENTS.md.
- MIT license.

[Unreleased]: https://github.com/aigamer-dev/linkedin-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/aigamer-dev/linkedin-mcp/releases/tag/v0.1.0
