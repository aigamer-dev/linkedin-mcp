# linkedin-mcp

An MCP server that lets AI agents read your LinkedIn profile basics and publish posts, using LinkedIn's **official** API. You bring your own LinkedIn developer app, so your credentials never leave your machine.

> Not affiliated with or endorsed by LinkedIn. "LinkedIn" is a trademark of LinkedIn Corporation.

| Tool | What it does |
|------|--------------|
| `get_profile` | Basic profile of the signed-in member (name, email, picture, locale) |
| `create_post` | Publish a text post (`PUBLIC` or `CONNECTIONS`) to your feed |

LinkedIn does not expose profile editing (headline, About, experience) to individual developers, so that is out of scope.

## Install

One line, for every supported agent found on your machine:

```bash
curl -fsSL https://raw.githubusercontent.com/aigamer-dev/linkedin-mcp/main/install.sh | bash
```

Or from a clone, choosing agents yourself:

```bash
git clone https://github.com/aigamer-dev/linkedin-mcp.git && cd linkedin-mcp
./install.sh --list                      # which agents were detected
./install.sh --agents claude,codex       # only these
./install.sh --dry-run                   # show what would change
./install.sh --uninstall                 # remove from all detected agents
```

Requires Node.js 20+, npm and git. Config files are backed up (`*.bak.<timestamp>`) before any edit.

| Agent | How it is registered |
|-------|----------------------|
| Claude Code | `claude mcp add --scope user` |
| Codex CLI | `codex mcp add` (prints the `config.toml` block if the CLI is missing) |
| OpenClaw | `openclaw mcp add --command node --arg ...` |
| Gemini CLI | `gemini mcp add --scope user` (falls back to `~/.gemini/settings.json`) |
| OpenCode | `~/.config/opencode/opencode.json` |
| Cursor | `~/.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Claude Desktop | `claude_desktop_config.json` |
| VS Code | user `mcp.json` |

Any other MCP client: point it at `node <install dir>/dist/index.js` over stdio. Windows is not covered by the script yet; use the manual route.

## Set up LinkedIn access (one time)

1. Create a LinkedIn Page you administer (any small page works) and an app at <https://www.linkedin.com/developers/apps>. App names cannot contain "LinkedIn".
2. On the **Products** tab, add **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect**.
3. On the **Auth** tab, add the redirect URL `http://localhost:3000/callback`.
4. Put the client ID and secret in `<install dir>/.env` (the installer creates it from `.env.example`).
5. Run `npm run auth` in the install dir, open the printed URL and approve.
6. Restart your agent.

Tokens are stored in `~/.config/linkedin-mcp/token.json` (mode 600), outside the repo, and last about 60 days. Re-run `npm run auth` to refresh.

## Security notes

- Credentials live only in your local `.env` and token file. Nothing is sent anywhere except LinkedIn's API.
- `create_post` publishes publicly by default. Agents should confirm post text with you first.
- Never commit `.env`; it is git-ignored.

## Development

```bash
npm install && npm run build
```

MIT licensed.
