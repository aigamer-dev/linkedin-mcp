# linkedin-mcp

MCP server for LinkedIn using the official API.

| Tool | What it does |
|------|--------------|
| `get_profile` | Basic profile of the signed-in member (name, email, picture) |
| `create_post` | Publish a text post to your feed |

LinkedIn does not expose profile editing (headline, About, experience) to individual developers, so that is out of scope for this server.

## Setup
1. Create an app at <https://www.linkedin.com/developers/apps> and add the products **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**.
2. Under Auth, add the redirect URL `http://localhost:3000/callback`.
3. `cp .env.example .env` and fill in the client ID and secret.
4. `npm install && npm run auth`, then open the printed URL and approve.
5. Register it with Claude Code:

```bash
claude mcp add linkedin --scope user -- node /home/hari/dev/personal/linkedin-mcp/dist/index.js
```

Tokens are stored in `~/.config/linkedin-mcp/token.json` (mode 600), outside the repo. They last about 60 days.
