const AUTHORIZE = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN = "https://www.linkedin.com/oauth/v2/accessToken";
const API = "https://api.linkedin.com";

export function callbackUrl(env: Env): string {
  return new URL("/callback", env.MCP_RESOURCE).toString();
}

export function authorizeUrl(env: Env, state: string, wantsPost: boolean): string {
  const scope = ["openid", "profile", "email", ...(wantsPost ? ["w_member_social"] : [])].join(" ");
  return (
    AUTHORIZE +
    "?" +
    new URLSearchParams({
      response_type: "code",
      client_id: env.LINKEDIN_CLIENT_ID,
      redirect_uri: callbackUrl(env),
      state,
      scope,
    })
  );
}

export async function exchangeCode(env: Env, code: string) {
  const r = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl(env),
      client_id: env.LINKEDIN_CLIENT_ID,
      client_secret: env.LINKEDIN_CLIENT_SECRET,
    }),
  });
  const body = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!r.ok || !body.access_token) throw new Error(`LinkedIn token exchange failed (${r.status})`);
  return { accessToken: body.access_token, expiresIn: body.expires_in ?? 5184000 };
}

async function li(path: string, token: string, init: RequestInit = {}) {
  const r = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`LinkedIn API ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

export interface UserInfo {
  sub: string;
  name?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
  locale?: unknown;
}

export const getUserInfo = (token: string) => li("/v2/userinfo", token) as Promise<UserInfo>;

export async function createPost(token: string, sub: string, text: string, visibility: "PUBLIC" | "CONNECTIONS") {
  const res = await li("/v2/ugcPosts", token, {
    method: "POST",
    body: JSON.stringify({
      author: `urn:li:person:${sub}`,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": visibility },
    }),
  });
  return (res as { id?: string }).id ?? "ok";
}
