import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { createMcpHandler } from "agents/mcp/server";
import { env } from "cloudflare:workers";
import authApp, { SCOPES_SUPPORTED } from "./auth-handler";
import { createServer } from "./server";

const mcpHandler = createMcpHandler(createServer);

export default new OAuthProvider<Env>({
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  apiRoute: "/mcp",
  apiHandler: {
    fetch(request: Request, e: Env, ctx: ExecutionContext) {
      return mcpHandler(request, e, ctx);
    },
  },
  defaultHandler: { fetch: (request: Request, e: Env, ctx: ExecutionContext) => authApp.fetch(request, e, ctx) },
  scopesSupported: SCOPES_SUPPORTED,
  requiredScopes: ["profile"],
  // The URL MCP clients connect to. Every token is bound to it.
  resourceMetadata: { resource: env.MCP_RESOURCE },
  clientIdMetadataDocumentEnabled: true,
});
