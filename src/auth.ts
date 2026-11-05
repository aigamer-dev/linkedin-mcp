import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { clientId, clientSecret, redirectUri, scopes, saveToken } from "./config.js";

if (!clientId || !clientSecret) {
  console.error("Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in .env first.");
  process.exit(1);
}

const state = randomBytes(16).toString("hex");
const authUrl =
  "https://www.linkedin.com/oauth/v2/authorization?" +
  new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: scopes.join(" "),
  });

const port = Number(new URL(redirectUri).port || 80);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", redirectUri);
  if (url.pathname !== new URL(redirectUri).pathname) {
    res.writeHead(404).end();
    return;
  }
  if (url.searchParams.get("state") !== state) {
    res.writeHead(400).end("State mismatch");
    return;
  }
  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end(url.searchParams.get("error_description") ?? "No code");
    return;
  }
  const r = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const body = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!r.ok || !body.access_token) {
    res.writeHead(500).end("Token exchange failed");
    console.error("Token exchange failed with status", r.status);
    server.close();
    return;
  }
  saveToken({
    access_token: body.access_token,
    expires_at: Date.now() + (body.expires_in ?? 5184000) * 1000,
  });
  res.writeHead(200, { "Content-Type": "text/plain" }).end("LinkedIn connected. You can close this tab.");
  console.log("Token saved to ~/.config/linkedin-mcp/token.json");
  server.close();
});

server.listen(port, () => {
  console.log("Open this URL in your browser to authorize:\n\n" + authUrl + "\n");
});
