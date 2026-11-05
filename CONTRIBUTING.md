# Contributing to linkedin-mcp

Thanks for helping. This guide covers local setup, how the repo is laid out, how to make and ship changes, and how to maintain the project.

## Ground rules

- **`main` is protected.** Only the maintainer can push to it. Everyone else opens a pull request.
- A PR needs **2 approving reviews** and **passing CI**. For now only the maintainer merges.
- Keep PRs focused: one change, tests included, docs and `CHANGELOG.md` updated.
- Never commit secrets (`.env`, tokens, client secrets). A leaked secret must be rotated in the LinkedIn developer portal, not just deleted from history.
- Do not add AI or tool signing lines (such as `Co-Authored-By`, "Generated with", "Built by") to commit messages, PR descriptions, code or docs.

## Development setup

Requires Node.js 20+, npm and git.

```bash
git clone https://github.com/aigamer-dev/linkedin-mcp.git
cd linkedin-mcp
npm install
npm run build        # compile TypeScript to dist/
npm test             # build, then run the test suite
```

To try your changes in an agent, register your working copy:

```bash
./install.sh --agents claude          # uses this checkout in place
```

To exercise the real API you need your own LinkedIn app. Follow "Connect your LinkedIn account" in the [README](README.md), then `npm run auth`.

## Repository layout

| Path | Purpose |
|------|---------|
| `src/index.ts` | The MCP server and its tools (`get_profile`, `create_post`) |
| `src/auth.ts` | One-off OAuth helper started by `npm run auth` |
| `src/config.ts` | `.env` loading, scopes, token read/write |
| `install.sh` | Multi-agent installer and uninstaller |
| `scripts/merge-config.mjs` | Idempotent JSON config editor used by the installer |
| `test/` | Tests (`node:test`, no extra framework) |
| `docs/` | Landing page, deployed to GitHub Pages |
| `.github/workflows/` | CI (`ci.yml`) and Pages deploy (`pages.yml`) |
| `CLAUDE.md`, `AGENTS.md` | Guidance for coding agents working in this repo |

## Making a change

1. Fork the repo (or branch, if you are the maintainer) and create a branch: `feat/short-name` or `fix/short-name`.
2. Make the change. Add or update tests in `test/`.
3. Run `npm test`. If you touched `install.sh`, also run `shellcheck install.sh` and `./install.sh --dry-run`.
4. Add a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md).
5. Commit with a clear imperative subject ("Add X", "Fix Y"), then open a PR using the template.
6. Address review feedback by pushing more commits; keep the history readable.

### Important: stdout belongs to the protocol

The server speaks MCP over **stdout**. Never use `console.log` in `src/index.ts` or anything it imports; it corrupts the stream. Log to stderr with `console.error`.

### Adding or changing a tool

1. Register it in `src/index.ts` with `server.tool(name, description, zodSchema, handler)`.
2. Validate inputs with zod; keep the description clear because agents choose tools from it.
3. If it needs a new LinkedIn permission, update the scopes in `src/config.ts`, the README setup steps and the landing page.
4. Add a test in `test/server.test.mjs` (the suite runs with an empty `HOME`, so nothing touches a real token or the network).

### Adding support for another agent

Edit `install.sh`:

1. Add the agent id to `ALL_AGENTS`.
2. Add a detection rule in `detected()`.
3. Add a `case` branch in the registration loop. Prefer the agent's own CLI when it has an `mcp add` command; otherwise call `json_agent <file> <format>`.
4. If its JSON shape differs from `mcpServers`, add a format to `scripts/merge-config.mjs` and a test in `test/merge-config.test.mjs`.
5. Add the agent to the tables in `README.md` and `docs/index.html`, and a line to the CHANGELOG.

The installer must stay idempotent, back up files it edits, and refuse to modify config files it cannot parse.

## The hosted connector (`worker/`)

A separate TypeScript project: a remote MCP server on Cloudflare Workers that signs members in with LinkedIn through one shared LinkedIn app, so end users need no developer account.

| File | Purpose |
|------|---------|
| `src/index.ts` | Wires `OAuthProvider` (authorize, token and registration endpoints) to the MCP handler on `/mcp` |
| `src/auth-handler.ts` | `/authorize` consent page, redirect to LinkedIn, `/callback`, plus the public pages |
| `src/server.ts` | The MCP tools, reading the signed-in member from `getMcpAuthContext()` |
| `src/linkedin.ts` | LinkedIn OAuth and API calls |
| `src/pages.ts` | HTML for the consent, privacy, terms and home pages (escape everything from clients) |
| `test/worker.test.mjs` | Boots `wrangler dev` and drives the OAuth flow end to end |

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars          # local-only LinkedIn credentials (git-ignored)
cp wrangler.example.jsonc wrangler.jsonc # your private deployment config (git-ignored)
npm test                         # type-check, then the integration tests
npm run dev                      # http://localhost:8787
```

To try the real LinkedIn flow locally, add `http://localhost:8787/callback` as a redirect URL in a LinkedIn developer app of your own.

**Public vs private.** The repo contains the code and a template (`wrangler.example.jsonc`). Everything specific to a live deployment is kept out of it: the real `wrangler.jsonc` (KV namespace id, public URL, contact email) and `.dev.vars` are git-ignored, and the LinkedIn client ID and secret live only in Cloudflare's secret store. Tests always use the template, never your private config. If you change what the config needs, update the template and the privacy-relevant docs in the same PR.

**Deploying is maintainer-only.** Deploys run from the maintainer's machine with `npm run deploy`; secrets are set with `npx wrangler secret put LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` (never in files or CI logs). `MCP_RESOURCE` in `wrangler.jsonc` must equal the public URL clients connect to, and the matching `/callback` URL must be registered in the LinkedIn app. Changing either breaks existing connections.

Things that bite:
- **Do not add `form-action` to the consent page's Content-Security-Policy.** Browsers apply it to the whole redirect chain after the form posts, which blocks the final redirect back to the MCP client. A test guards this.
- Never log or return `props.accessToken` or anything from `authInfo.extra`.
- LinkedIn gives no refresh tokens to this kind of app. Tokens last about 60 days and members must reconnect; keep the error messages for that clear.
- The privacy policy in `src/pages.ts` is a promise. If you change what is stored, change the policy and the CHANGELOG in the same PR.

## Tests and CI

`npm test` builds the project and runs two suites:

- `test/merge-config.test.mjs`: the config editor (formats, idempotency, backups, refusal on non-JSON).
- `test/server.test.mjs`: starts the real server over stdio and checks the tool list and error paths.

CI (`.github/workflows/ci.yml`) runs the suite on Ubuntu and macOS with Node 20 and 22, and an `Installer` job that runs ShellCheck, a dry run for every agent, and an install/uninstall round trip in a throwaway `HOME`. All jobs must pass before merge.

## Maintaining the repo

### Releases

Versioning follows [SemVer](https://semver.org). The maintainer releases:

1. Move the `## [Unreleased]` entries in `CHANGELOG.md` under a new `## [x.y.z] - YYYY-MM-DD` heading and update the compare links.
2. Bump `version` in `package.json` and in the `McpServer` constructor in `src/index.ts`.
3. `npm install` (updates the lockfile), `npm test`.
4. Open a PR titled `Release vX.Y.Z`, merge it, then tag and publish:

   ```bash
   git switch main && git pull
   git tag vX.Y.Z && git push origin vX.Y.Z
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <(sed -n '/^## \[X.Y.Z\]/,/^## \[/p' CHANGELOG.md | sed '$d')
   ```

### Dependencies

Dependabot opens update PRs. Review them like any other PR: CI green, changelog entry for anything user-visible. Major bumps of `@modelcontextprotocol/sdk` or `zod` need a manual check of every tool.

### LinkedIn API changes

The server uses `GET /v2/userinfo` and `POST /v2/ugcPosts`. LinkedIn versions and deprecates its APIs; if posting starts failing with 4xx errors after a LinkedIn announcement, check the [LinkedIn Posts API docs](https://learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api) and migrate the endpoint, then add a CHANGELOG entry marked **Changed**.

### Landing page

`docs/` is deployed by `pages.yml` whenever it changes on `main`. Keep it in sync with the README (tools, agents, limits). Preview locally with `python3 -m http.server -d docs 8765`.

### Branch protection (maintainer reference)

`main` requires: PRs, 2 approving reviews, stale reviews dismissed on new commits, resolved conversations, passing CI checks, linear history, no force pushes or deletions. Pushes and merges are restricted to the maintainer, who can bypass the review requirement. To change the settings: **Settings → Branches → main**, or `gh api repos/aigamer-dev/linkedin-mcp/branches/main/protection`.

### Security

Report vulnerabilities privately through the Security tab, not in public issues. If a client secret or token leaks, rotate the secret in the LinkedIn developer portal immediately and re-run `npm run auth`.
