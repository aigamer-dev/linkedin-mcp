import { McpServer } from "@modelcontextprotocol/server";
import { getMcpAuthContext } from "agents/mcp/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { createPost, getUserInfo } from "./linkedin";

const DAILY_POST_LIMIT = 10;

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }] });
const fail = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });

function session(): { props: Props } | { error: ToolResult } {
  const props = getMcpAuthContext()?.props as Props | undefined;
  if (!props?.accessToken) return { error: fail("Not connected to LinkedIn. Reconnect the connector.") };
  if (Date.now() > props.expiresAt) {
    return { error: fail("Your LinkedIn connection expired (they last about 60 days). Disconnect and reconnect the connector.") };
  }
  return { props };
}

/** Best-effort per-member daily cap. KV is eventually consistent, so this is a guard, not a hard limit. */
async function takePostSlot(sub: string): Promise<boolean> {
  const key = `x:rl:${sub}:${new Date().toISOString().slice(0, 10)}`;
  const used = Number((await env.OAUTH_KV.get(key)) ?? "0");
  if (used >= DAILY_POST_LIMIT) return false;
  await env.OAUTH_KV.put(key, String(used + 1), { expirationTtl: 60 * 60 * 36 });
  return true;
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "linkedin-mcp", version: "0.2.0" });

  server.registerTool(
    "get_profile",
    {
      description: "Get the connected LinkedIn member's basic profile: name, email, picture and locale.",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      const s = session();
      if ("error" in s) return s.error;
      try {
        return ok(JSON.stringify(await getUserInfo(s.props.accessToken), null, 2));
      } catch (e) {
        return fail(e instanceof Error ? e.message : "LinkedIn request failed");
      }
    },
  );

  server.registerTool(
    "create_post",
    {
      description:
        "Publish a text post to the connected member's LinkedIn feed. This is public by default and cannot be undone by this tool, so show the exact text to the user and get their confirmation first.",
      inputSchema: {
        text: z.string().min(1).max(3000).describe("The post text, 1 to 3000 characters"),
        visibility: z.enum(["PUBLIC", "CONNECTIONS"]).default("PUBLIC").describe("Who can see the post"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ text, visibility }) => {
      const s = session();
      if ("error" in s) return s.error;
      if (!s.props.scopes.includes("post")) {
        return fail("Posting was not allowed when you connected. Disconnect and reconnect, and tick the posting permission.");
      }
      if (!(await takePostSlot(s.props.sub))) {
        return fail(`Daily posting limit reached (${DAILY_POST_LIMIT} per day). Try again tomorrow.`);
      }
      try {
        const id = await createPost(s.props.accessToken, s.props.sub, text, visibility);
        return ok(`Posted: ${id}`);
      } catch (e) {
        return fail(e instanceof Error ? e.message : "LinkedIn request failed");
      }
    },
  );

  return server;
}
