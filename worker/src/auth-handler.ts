import { Hono } from "hono";
import { AuthorizationError, CimdFetchError, authorizationErrorRedirect } from "@cloudflare/workers-oauth-provider";
import { authorizeUrl, exchangeCode, getUserInfo } from "./linkedin";
import { consentPage, errorPage, homePage, privacyPage, termsPage } from "./pages";

/** Everything this server can grant. "offline_access" is carried silently, never shown. */
export const SCOPES_SUPPORTED = ["profile", "post", "offline_access"];

const html = (body: string, status = 200, headers?: Headers) => {
  const h = new Headers(headers);
  h.set("Content-Type", "text/html; charset=utf-8");
  h.set("X-Content-Type-Options", "nosniff");
  // No `form-action`: browsers apply it to the whole redirect chain after the form posts, which would
  // block the final redirect back to the MCP client's callback. Framing is blocked by the library's headers.
  h.append("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'");
  return new Response(body, { status, headers: h });
};

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => html(homePage(c.env.MCP_RESOURCE)));
app.get("/privacy", (c) => html(privacyPage(c.env.CONTACT_EMAIL)));
app.get("/terms", () => html(termsPage()));

// Step 1: show the consent page.
app.get("/authorize", async (c) => {
  const oauth = c.env.OAUTH_PROVIDER;
  try {
    const authRequest = await oauth.parseAuthRequest(c.req.raw);
    const details = await oauth.describeConsent(authRequest);
    const requested = details.scope.filter((s) => SCOPES_SUPPORTED.includes(s));
    const shown = (requested.length ? requested : SCOPES_SUPPORTED).filter((s) => s !== "offline_access");
    const hidden = requested.includes("offline_access") || requested.length === 0 ? ["offline_access"] : [];
    const consent = await oauth.beginConsent(authRequest);
    return html(consentPage(details, consent.handle, shown, hidden), 200, consent.headers);
  } catch (e) {
    return handleError(e);
  }
});

// Step 2: the user decided. Only on approval do we start the LinkedIn redirect.
app.post("/authorize", async (c) => {
  const oauth = c.env.OAUTH_PROVIDER;
  try {
    const form = await c.req.formData();
    const handle = String(form.get("handle") ?? "");
    if (form.get("decision") !== "approve") {
      const denied = await oauth.denyConsent(c.req.raw, handle);
      return new Response(null, { status: 302, headers: denied.headers });
    }
    const chosen = form.getAll("scope").map(String).filter((s) => SCOPES_SUPPORTED.includes(s));
    const scope = Array.from(new Set(["profile", ...chosen]));
    const approved = await oauth.approveConsent(c.req.raw, handle, { scope });
    const wantsPost = approved.request.scope.includes("post");
    const { state, headers } = await oauth.beginUpstream(approved.request, { data: {}, headers: approved.headers });
    headers.set("Location", authorizeUrl(c.env, state, wantsPost));
    return new Response(null, { status: 302, headers });
  } catch (e) {
    return handleError(e);
  }
});

// Step 3: LinkedIn sent the user back.
app.get("/callback", async (c) => {
  const oauth = c.env.OAUTH_PROVIDER;
  try {
    const { request: original, headers } = await oauth.finishUpstream(c.req.raw);
    const url = new URL(c.req.url);
    if (url.searchParams.get("error")) {
      headers.set("Location", authorizationErrorRedirect(original, "access_denied", "LinkedIn sign-in was cancelled"));
      return new Response(null, { status: 302, headers });
    }
    const code = url.searchParams.get("code");
    if (!code) return html(errorPage("LinkedIn did not return a sign-in code."), 400, headers);
    const token = await exchangeCode(c.env, code);
    const me = await getUserInfo(token.accessToken);
    const props: Props = {
      sub: me.sub,
      name: me.name ?? "LinkedIn member",
      accessToken: token.accessToken,
      expiresAt: Date.now() + token.expiresIn * 1000,
      scopes: original.scope,
    };
    const { redirectTo } = await oauth.completeAuthorization({
      request: original,
      userId: me.sub,
      metadata: { label: props.name },
      scope: original.scope,
      props,
    });
    headers.set("Location", redirectTo);
    return new Response(null, { status: 302, headers });
  } catch (e) {
    return handleError(e);
  }
});

function handleError(e: unknown): Response {
  if (e instanceof AuthorizationError && e.redirectTo) return Response.redirect(e.redirectTo, 302);
  if (e instanceof AuthorizationError) return html(errorPage(e.description ?? "This sign-in link is invalid or expired."), 400);
  if (e instanceof CimdFetchError) return html(errorPage("This app could not be verified."), 400);
  console.error("auth flow error", e instanceof Error ? e.message : String(e));
  return html(errorPage("We could not complete the sign-in. Please try again."), 500);
}

export default app;
