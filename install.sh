#!/usr/bin/env bash
# Install linkedin-mcp and register it with your AI agents.
#
#   curl -fsSL https://raw.githubusercontent.com/aigamer-dev/linkedin-mcp/main/install.sh | bash
#   ./install.sh [--agents claude,codex,...] [--dry-run] [--uninstall] [--dir PATH] [--list]
#
# Supported agents: claude, codex, openclaw, gemini, opencode, cursor, windsurf,
#                   claude-desktop, vscode
# With no --agents flag, every agent detected on this machine is configured.
set -euo pipefail

REPO_URL="https://github.com/aigamer-dev/linkedin-mcp.git"
NAME="linkedin"
ALL_AGENTS="claude codex openclaw gemini opencode cursor windsurf claude-desktop vscode"
INSTALL_DIR="${LINKEDIN_MCP_DIR:-$HOME/.local/share/linkedin-mcp}"
AGENTS=""
DRY=0
UNINSTALL=0
LIST=0

while [ $# -gt 0 ]; do
  case "$1" in
    --agents) AGENTS="$(echo "$2" | tr ',' ' ')"; shift 2 ;;
    --dir) INSTALL_DIR="$2"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    --list) LIST=1; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
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

# --- build -------------------------------------------------------------------
if [ "$UNINSTALL" = 0 ]; then
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

# --- register ----------------------------------------------------------------
json_agent() { # file format
  if [ "$UNINSTALL" = 1 ]; then run node "$MERGE" remove "$1" "$2" "$NAME"
  else run node "$MERGE" add "$1" "$2" "$NAME" node "[\"$ENTRY\"]"; fi
}

for a in $AGENTS; do
  say "-> $a"
  case "$a" in
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
    *) say "  unknown agent: $a" ;;
  esac
done

if [ "$UNINSTALL" = 1 ]; then
  say "Done. Source and token were left in place ($INSTALL_DIR, ~/.config/linkedin-mcp)."
  exit 0
fi

# --- next steps --------------------------------------------------------------
if [ "$DRY" = 0 ] && [ ! -f "$INSTALL_DIR/.env" ]; then
  cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env" && chmod 600 "$INSTALL_DIR/.env"
fi
cat <<EOF

Installed. Two steps left (see README for details):
  1. Create a LinkedIn developer app and put its client ID/secret in
       $INSTALL_DIR/.env
  2. Authorize once:   cd "$INSTALL_DIR" && npm run auth
Then restart your agent so it loads the new server.
EOF
