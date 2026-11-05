#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadToken } from "./config.js";

const API = "https://api.linkedin.com";

async function li(path: string, init: RequestInit = {}) {
  const { access_token } = loadToken();
  const r = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${access_token}`,
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`LinkedIn API ${r.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

const server = new McpServer({ name: "linkedin-mcp", version: "0.1.0" });

server.tool(
  "get_profile",
  "Get the authenticated member's basic LinkedIn profile (name, email, picture, locale).",
  async () => {
    const me = await li("/v2/userinfo");
    return { content: [{ type: "text", text: JSON.stringify(me, null, 2) }] };
  },
);

server.tool(
  "create_post",
  "Publish a text post to the authenticated member's LinkedIn feed.",
  {
    text: z.string().min(1).max(3000),
    visibility: z.enum(["PUBLIC", "CONNECTIONS"]).default("PUBLIC"),
  },
  async ({ text, visibility }) => {
    const me = await li("/v2/userinfo");
    const body = {
      author: `urn:li:person:${me.sub}`,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": visibility },
    };
    const res = await li("/v2/ugcPosts", { method: "POST", body: JSON.stringify(body) });
    return { content: [{ type: "text", text: `Posted: ${res.id ?? "ok"}` }] };
  },
);

await server.connect(new StdioServerTransport());
