declare namespace Cloudflare {
  interface Env {
    OAUTH_KV: KVNamespace;
    OAUTH_PROVIDER: import("@cloudflare/workers-oauth-provider").OAuthHelpers;
    /** Public MCP endpoint URL, for example https://linkedin-mcp.example.workers.dev/mcp */
    MCP_RESOURCE: string;
    /** Shown on the privacy page as the contact for data requests. Set in your private wrangler.jsonc. */
    CONTACT_EMAIL: string;
    LINKEDIN_CLIENT_ID: string;
    LINKEDIN_CLIENT_SECRET: string;
  }
}
interface Env extends Cloudflare.Env {}

/** What is stored (encrypted) with each grant and handed to tools. */
interface Props extends Record<string, unknown> {
  sub: string;
  name: string;
  accessToken: string;
  /** Epoch ms when LinkedIn's access token stops working (about 60 days). */
  expiresAt: number;
  /** Scopes the user approved on the consent page: "profile", "post". */
  scopes: string[];
}
