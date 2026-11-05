import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

const PORT = 8799;
const BASE = `http://localhost:${PORT}`;
let dev;
let log = "";

before(async () => {
  dev = spawn(
    "npx",
    [
      // The committed template, so tests never depend on a developer's private wrangler.jsonc.
      "wrangler", "dev", "--config", "wrangler.example.jsonc", "--local", "--port", String(PORT),
      "--var", `MCP_RESOURCE:${BASE}/mcp`,
      "--var", "CONTACT_EMAIL:contact@test.invalid",
      "--var", "LINKEDIN_CLIENT_ID:test-client-id",
      "--var", "LINKEDIN_CLIENT_SECRET:test-secret",
    ],
    { stdio: ["ignore", "pipe", "pipe"], detached: true, env: { ...process.env, CI: "1" } },
  );
  dev.stdout.on("data", (d) => (log += d));
  dev.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`${BASE}/privacy`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("wrangler dev did not start:\n" + log.slice(-2000));
}, { timeout: 120000 });

after(() => {
  try { process.kill(-dev.pid, "SIGTERM"); } catch {}
  dev?.stdout.destroy();
  dev?.stderr.destroy();
});

test("public pages render", async () => {
  for (const p of ["/", "/privacy", "/terms"]) {
    const r = await fetch(BASE + p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get("content-type"), /text\/html/);
  }
});

test("privacy contact comes from config, not source", async () => {
  const body = await (await fetch(`${BASE}/privacy`)).text();
  assert.match(body, /contact@test\.invalid/);
});

test("unauthenticated /mcp is challenged", async () => {
  const r = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  assert.equal(r.status, 401);
  assert.match(r.headers.get("www-authenticate") ?? "", /Bearer/i);
});

test("discovery documents are served", async () => {
  const meta = await fetch(`${BASE}/.well-known/oauth-authorization-server`);
  assert.equal(meta.status, 200);
  const j = await meta.json();
  assert.ok(j.authorization_endpoint.endsWith("/authorize"));
  assert.ok(j.registration_endpoint.endsWith("/oauth/register"));
  const pr = await fetch(`${BASE}/.well-known/oauth-protected-resource/mcp`);
  assert.equal(pr.status, 200);
});

test("full flow: register, consent, redirect to LinkedIn", async () => {
  const redirect = "http://localhost:9999/cb";
  const reg = await fetch(`${BASE}/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Test <b>Client</b>",
      redirect_uris: [redirect],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  assert.equal(reg.status, 201, await reg.clone().text());
  const { client_id } = await reg.json();

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const q = new URLSearchParams({
    response_type: "code", client_id, redirect_uri: redirect, state: "xyz",
    scope: "profile post", code_challenge: challenge, code_challenge_method: "S256",
    resource: `${BASE}/mcp`,
  });

  // Consent page: escapes the client's name, can't be framed, offers the post permission.
  const page = await fetch(`${BASE}/authorize?${q}`);
  assert.equal(page.status, 200, await page.clone().text());
  const body = await page.text();
  assert.ok(!body.includes("<b>Client</b>"), "client name must be escaped");
  assert.match(body, /Publish posts/);
  assert.match(page.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  // form-action would block the redirect chain back to the MCP client after the form posts.
  assert.ok(!/form-action/.test(page.headers.get("content-security-policy") ?? ""), "CSP must not set form-action");
  const cookie = (page.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const handle = body.match(/name="handle" value="([^"]+)"/)[1];

  // A post without the browser-bound cookie is refused.
  const forged = await fetch(`${BASE}/authorize`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ handle, decision: "approve", scope: "profile" }),
  });
  assert.equal(forged.status, 400);

  // Approve with the cookie: redirected to LinkedIn with the Worker's callback.
  const approve = await fetch(`${BASE}/authorize`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams([["handle", handle], ["decision", "approve"], ["scope", "profile"], ["scope", "post"]]),
  });
  assert.equal(approve.status, 302, await approve.clone().text());
  const loc = new URL(approve.headers.get("location"));
  assert.equal(loc.origin + loc.pathname, "https://www.linkedin.com/oauth/v2/authorization");
  assert.equal(loc.searchParams.get("client_id"), "test-client-id");
  assert.equal(loc.searchParams.get("redirect_uri"), `${BASE}/callback`);
  assert.match(loc.searchParams.get("scope"), /w_member_social/);
  assert.ok(loc.searchParams.get("state"));
});

test("posting scope is not requested from LinkedIn unless the user allowed it", async () => {
  const redirect = "http://localhost:9999/cb";
  const reg = await (await fetch(`${BASE}/oauth/register`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "c2", redirect_uris: [redirect], grant_types: ["authorization_code"], response_types: ["code"], token_endpoint_auth_method: "none" }),
  })).json();
  const verifier = randomBytes(32).toString("base64url");
  const q = new URLSearchParams({
    response_type: "code", client_id: reg.client_id, redirect_uri: redirect, state: "s",
    scope: "profile post", code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256", resource: `${BASE}/mcp`,
  });
  const page = await fetch(`${BASE}/authorize?${q}`);
  const body = await page.text();
  const cookie = (page.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const handle = body.match(/name="handle" value="([^"]+)"/)[1];
  const r = await fetch(`${BASE}/authorize`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams([["handle", handle], ["decision", "approve"], ["scope", "profile"]]), // post unticked
  });
  assert.equal(r.status, 302);
  assert.ok(!/w_member_social/.test(new URL(r.headers.get("location")).searchParams.get("scope")));
});
