#!/usr/bin/env bash
# Install linkedin-mcp and register it with your AI agents.
#
#   Hosted connector (no setup, sign in with LinkedIn):
#     curl -fsSL https://raw.githubusercontent.com/aigamer-dev/linkedin-mcp/main/install.sh | bash -s -- --hosted
#   Local server (your own LinkedIn app):
#     curl -fsSL https://raw.githubusercontent.com/aigamer-dev/linkedin-mcp/main/install.sh | bash
#
#   ./install.sh [--hosted] [--url URL] [--agents claude,codex,...] [--dry-run]
#                [--uninstall] [--dir PATH] [--list]
#
# Supported agents: claude, codex, openclaw, gemini, opencode, cursor, windsurf,
#                   claude-desktop, vscode
# With no --agents flag, every agent detected on this machine is configured.
set -euo pipefail

REPO_URL="https://github.com/aigamer-dev/linkedin-mcp.git"
RAW_URL="https://raw.githubusercontent.com/aigamer-dev/linkedin-mcp/main"
HOSTED_URL="https://linkedin-mcp.hariharankvasn.workers.dev/mcp"
NAME="linkedin"
ALL_AGENTS="claude codex openclaw gemini opencode cursor windsurf claude-desktop vscode"
INSTALL_DIR="${LINKEDIN_MCP_DIR:-$HOME/.local/share/linkedin-mcp}"
AGENTS=""
DRY=0
UNINSTALL=0
LIST=0
HOSTED=0

while [ $# -gt 0 ]; do
  case "$1" in
    --agents) AGENTS="$(echo "$2" | tr ',' ' ')"; shift 2 ;;
    --dir) INSTALL_DIR="$2"; shift 2 ;;
    --hosted) HOSTED=1; shift ;;
    --url) HOSTED_URL="$2"; HOSTED=1; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    --list) LIST=1; shift ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

say()  { printf '%s\n' "$*"; }
run()  { if [ "$DRY" = 1 ]; then say "  [dry-run] $*"; else "$@"; fi; }
have() { command -v "$1" >/dev/null 2>&1; }

case "$(uname -s)" in
  Darwin) APPSUP="$HOME/Library/Application Support" ;;
  *)      APPSUP="${XDG_CONFIG_HOME:-$HOME/.config}" ;;
esac

# --- locate or fetch the source ---------------------------------------------
SELF_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
if [ -n "$SELF_DIR" ] && [ -f "$SELF_DIR/package.json" ] && grep -q '"linkedin-mcp"' "$SELF_DIR/package.json"; then
  INSTALL_DIR="$SELF_DIR"   # running from a clone: use it in place
fi
ENTRY="$INSTALL_DIR/dist/index.js"
MERGE="$INSTALL_DIR/scripts/merge-config.mjs"

# The JSON editor ships in the repo. In hosted mode there may be no clone, so fetch just that file.
ensure_merge() {
  [ -f "$MERGE" ] && return 0
  have node || { say "  Node.js is required to edit this agent's config file."; return 1; }
  [ "$DRY" = 1 ] && return 0
  have curl || { say "  curl is required to fetch the config editor."; return 1; }
  MERGE="$(mktemp -d)/merge-config.mjs"
  curl -fsSL "$RAW_URL/scripts/merge-config.mjs" -o "$MERGE"
}

# --- per-agent detection -----------------------------------------------------
detected() {
  case "$1" in
    claude)         have claude ;;
    codex)          have codex || [ -d "$HOME/.codex" ] ;;
    openclaw)       have openclaw || [ -d "$HOME/.openclaw" ] ;;
    gemini)         have gemini || [ -d "$HOME/.gemini" ] ;;
    opencode)       have opencode || [ -d "$HOME/.config/opencode" ] ;;
    cursor)         [ -d "$HOME/.cursor" ] ;;
    windsurf)       [ -d "$HOME/.codeium/windsurf" ] ;;
    claude-desktop) [ -d "$APPSUP/Claude" ] ;;
    vscode)         have code || [ -d "$APPSUP/Code/User" ] ;;
    *) return 1 ;;
  esac
}

if [ "$LIST" = 1 ]; then
  for a in $ALL_AGENTS; do
    if detected "$a"; then say "detected   $a"; else say "not found  $a"; fi
  done
  exit 0
fi

[ -n "$AGENTS" ] || for a in $ALL_AGENTS; do detected "$a" && AGENTS="$AGENTS $a"; done
if [ -z "${AGENTS// /}" ]; then
  say "No supported agents detected. Pass --agents explicitly, e.g. --agents claude,cursor"
  [ "$UNINSTALL" = 1 ] && exit 0
fi

# --- build (local mode only) -------------------------------------------------
if [ "$UNINSTALL" = 0 ] && [ "$HOSTED" = 0 ]; then
  have node || { say "Node.js 20+ is required."; exit 1; }
  have npm  || { say "npm is required."; exit 1; }
  if [ ! -f "$INSTALL_DIR/package.json" ]; then
    have git || { say "git is required."; exit 1; }
    say "Cloning into $INSTALL_DIR"
    run mkdir -p "$(dirname "$INSTALL_DIR")"
    run git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  fi
  say "Building"
  if [ "$DRY" = 1 ]; then say "  [dry-run] npm install && npm run build in $INSTALL_DIR"
  else (cd "$INSTALL_DIR" && npm install --silent && npm run build --silent); fi
fi

# --- register: local server --------------------------------------------------
json_agent() { # file format
  ensure_merge || return 0
  if [ "$UNINSTALL" = 1 ]; then run node "$MERGE" remove "$1" "$2" "$NAME"
  else run node "$MERGE" add "$1" "$2" "$NAME" node "[\"$ENTRY\"]"; fi
}

local_agent() {
  case "$1" in
    claude)
      if [ "$UNINSTALL" = 1 ]; then run claude mcp remove "$NAME" --scope user || true
      else run claude mcp add "$NAME" --scope user -- node "$ENTRY"; fi ;;
    codex)
      if have codex; then
        if [ "$UNINSTALL" = 1 ]; then run codex mcp remove "$NAME" || true
        else run codex mcp add "$NAME" -- node "$ENTRY"; fi
      else
        say "  codex CLI not on PATH; add to ~/.codex/config.toml:"
        say "    [mcp_servers.$NAME]"; say "    command = \"node\""; say "    args = [\"$ENTRY\"]"
      fi ;;
    openclaw)
      if have openclaw; then
        if [ "$UNINSTALL" = 1 ]; then run openclaw mcp remove "$NAME" || true
        else run openclaw mcp add "$NAME" --command node --arg "$ENTRY"; fi
      else
        say "  openclaw CLI not on PATH; run: openclaw mcp add $NAME --command node --arg \"$ENTRY\""
      fi ;;
    gemini)
      if have gemini; then
        if [ "$UNINSTALL" = 1 ]; then run gemini mcp remove "$NAME" --scope user || true
        else run gemini mcp add --scope user "$NAME" node "$ENTRY"; fi
      else json_agent "$HOME/.gemini/settings.json" mcpServers; fi ;;
    opencode)       json_agent "$HOME/.config/opencode/opencode.json" opencode ;;
    cursor)         json_agent "$HOME/.cursor/mcp.json" mcpServers ;;
    windsurf)       json_agent "$HOME/.codeium/windsurf/mcp_config.json" mcpServers ;;
    claude-desktop) json_agent "$APPSUP/Claude/claude_desktop_config.json" mcpServers ;;
    vscode)         json_agent "$APPSUP/Code/User/mcp.json" vscode ;;
    *) say "  unknown agent: $1" ;;
  esac
}

# --- register: hosted connector (remote URL, OAuth sign-in) ------------------
remote_json() { # file format
  ensure_merge || return 0
  if [ "$UNINSTALL" = 1 ]; then run node "$MERGE" remove "$1" "$2" "$NAME"
  else run node "$MERGE" add-remote "$1" "$2" "$NAME" "$HOSTED_URL"; fi
}

hosted_agent() {
  case "$1" in
    claude)
      if [ "$UNINSTALL" = 1 ]; then run claude mcp remove "$NAME" --scope user || true
      else run claude mcp add --transport http --scope user "$NAME" "$HOSTED_URL"; fi ;;
    codex)
      if [ "$UNINSTALL" = 1 ]; then
        if have codex; then run codex mcp remove "$NAME" || true; else say "  remove [mcp_servers.$NAME] from ~/.codex/config.toml"; fi
      else
        say "  add to ~/.codex/config.toml, then follow Codex's sign-in prompt:"
        say "    [mcp_servers.$NAME]"; say "    url = \"$HOSTED_URL\""
      fi ;;
    openclaw)
      if have openclaw; then
        if [ "$UNINSTALL" = 1 ]; then run openclaw mcp remove "$NAME" || true
        else run openclaw mcp add "$NAME" --url "$HOSTED_URL" --transport streamable-http --auth oauth; fi
      else
        say "  openclaw CLI not on PATH; run: openclaw mcp add $NAME --url $HOSTED_URL --transport streamable-http --auth oauth"
      fi ;;
    gemini)
      if have gemini; then
        if [ "$UNINSTALL" = 1 ]; then run gemini mcp remove "$NAME" --scope user || true
        else run gemini mcp add --scope user --transport http "$NAME" "$HOSTED_URL"; fi
      else remote_json "$HOME/.gemini/settings.json" gemini; fi ;;
    opencode) remote_json "$HOME/.config/opencode/opencode.json" opencode ;;
    cursor)   remote_json "$HOME/.cursor/mcp.json" mcpServers ;;
    windsurf) remote_json "$HOME/.codeium/windsurf/mcp_config.json" windsurf ;;
    vscode)   remote_json "$APPSUP/Code/User/mcp.json" vscode ;;
    claude-desktop)
      say "  Claude Desktop adds remote connectors in the app: Settings > Connectors > Add custom connector,"
      say "  then paste $HOSTED_URL" ;;
    *) say "  unknown agent: $1" ;;
  esac
}

for a in $AGENTS; do
  say "-> $a"
  if [ "$HOSTED" = 1 ]; then hosted_agent "$a"; else local_agent "$a"; fi
done

# --- wrap up -----------------------------------------------------------------
if [ "$UNINSTALL" = 1 ]; then
  if [ "$HOSTED" = 1 ]; then say "Done. Connector removed; your LinkedIn grant can also be revoked in LinkedIn > Settings > Permitted services."
  else say "Done. Source and token were left in place ($INSTALL_DIR, ~/.config/linkedin-mcp)."; fi
  exit 0
fi

if [ "$HOSTED" = 1 ]; then
  cat <<EOF

Added the hosted connector ($HOSTED_URL).
Now sign in with LinkedIn the first time you use it:
  Claude Code      run /mcp, pick "$NAME", then Authenticate
  OpenClaw         openclaw mcp login $NAME
  Cursor / VS Code / others   approve the sign-in prompt that appears on first use
You will choose on a consent page whether to allow posting, then approve on LinkedIn.
EOF
  exit 0
fi

if [ "$DRY" = 0 ] && [ ! -f "$INSTALL_DIR/.env" ]; then
  cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env" && chmod 600 "$INSTALL_DIR/.env"
fi
cat <<EOF

Installed. Two steps left (see README for details):
  1. Create a LinkedIn developer app and put its client ID/secret in
       $INSTALL_DIR/.env
  2. Authorize once:   cd "$INSTALL_DIR" && npm run auth
Then restart your agent so it loads the new server.
(No LinkedIn app of your own? Re-run with --hosted to use the hosted connector instead.)
EOF
