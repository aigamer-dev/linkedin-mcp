import type { ConsentDescription } from "@cloudflare/workers-oauth-provider";

export const REPO_URL = "https://github.com/aigamer-dev/linkedin-mcp";

export const esc = (v: string): string => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const CSS = `
:root{--bg:#f7f8fa;--card:#fff;--text:#151a24;--muted:#5a6478;--line:#dfe3ea;--accent:#1f6feb;--ink:#fff}
@media(prefers-color-scheme:dark){:root{--bg:#0c111b;--card:#131a28;--text:#e8ecf4;--muted:#98a3b8;--line:#263049;--accent:#5aa2ff;--ink:#08111f}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:640px;margin:0 auto;padding:32px 16px}.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:24px}
h1{font-size:1.5rem;margin:0 0 12px}h2{font-size:1.1rem;margin:24px 0 6px}p,li{color:var(--muted)}a{color:var(--accent)}
code{background:var(--bg);border:1px solid var(--line);border-radius:5px;padding:1px 6px;font-size:.9em;word-break:break-all}
button{font:inherit;font-weight:600;padding:10px 18px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--text);cursor:pointer}
button.primary{background:var(--accent);color:var(--ink);border-color:var(--accent)}label{display:block;margin:6px 0;color:var(--text)}
.warn{border:1px solid #d97706;border-radius:8px;padding:10px 12px;color:var(--text)}.row{display:flex;gap:10px;margin-top:20px;flex-wrap:wrap}
footer{margin-top:20px;font-size:.85rem;color:var(--muted)}`;

export function layout(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="robots" content="noindex"><style>${CSS}</style></head><body><main><div class="card">${body}</div>
<footer>linkedin-mcp is open source (<a href="${REPO_URL}">GitHub</a>) and is not affiliated with or endorsed by LinkedIn.
 <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></footer></main></body></html>`;
}

export function homePage(mcpUrl: string): string {
  return layout(
    "linkedin-mcp",
    `<h1>linkedin-mcp</h1>
<p>A hosted MCP connector that lets your AI assistant read your LinkedIn profile basics and publish posts for you, only after you approve.</p>
<h2>Add it to your assistant</h2>
<p>Add a custom MCP connector with this URL, then choose <strong>Connect</strong> and sign in to LinkedIn:</p>
<p><code>${esc(mcpUrl)}</code></p>
<p>Prefer to keep everything on your own machine? The <a href="${REPO_URL}">open-source local version</a> uses your own LinkedIn app.</p>`,
  );
}

/** `contact` comes from the CONTACT_EMAIL variable in the private deployment config. */
export function privacyPage(contact: string): string {
  const CONTACT = esc(contact);
  return layout(
    "Privacy policy",
    `<h1>Privacy policy</h1><p>Last updated: 6 November 2026.</p>
<h2>What this service does</h2><p>It connects your AI assistant to your LinkedIn account through LinkedIn's official API so the assistant can read your basic profile and, if you allow it, publish posts.</p>
<h2>What we store</h2><ul>
<li>Your LinkedIn member ID and name, and the LinkedIn access token issued for you. These are encrypted at rest and tied to the connection you approved.</li>
<li>A per-day post counter per member ID, used only to limit abuse.</li>
<li>Standard request logs kept by Cloudflare, our hosting provider.</li></ul>
<h2>What we do not store</h2><p>We do not store the text of your posts, your connections, messages or feed, and we do not sell, share or use your data for advertising or analytics.</p>
<h2>Who processes data</h2><p>LinkedIn (sign-in and posting) and Cloudflare (hosting and storage). Your AI assistant provider receives whatever the tools return to it.</p>
<h2>Retention and deletion</h2><p>Data is kept until you disconnect. You can disconnect by removing the connector in your assistant, or by removing "linkedin-mcp" under Permitted Services in your LinkedIn settings. To have remaining data deleted, email <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>
<h2>Contact</h2><p><a href="mailto:${CONTACT}">${CONTACT}</a></p>`,
  );
}

export function termsPage(): string {
  return layout(
    "Terms of use",
    `<h1>Terms of use</h1><p>Last updated: 6 November 2026.</p>
<ul><li>The service is provided "as is", with no warranty and no guarantee of availability.</li>
<li>Posts are published as you. You are responsible for what is posted through your account, and for following LinkedIn's terms and API terms.</li>
<li>Do not use the service for spam, automated mass posting, scraping or anything unlawful. Posting is rate limited and access can be revoked for abuse.</li>
<li>We may change or stop the service at any time. Disconnecting is always possible as described in the <a href="/privacy">privacy policy</a>.</li>
<li>Not affiliated with or endorsed by LinkedIn. LinkedIn is a trademark of LinkedIn Corporation.</li></ul>`,
  );
}

const LABELS: Record<string, string> = {
  post: "Publish posts to my LinkedIn feed (only when I ask)",
};

export function consentPage(details: ConsentDescription, handle: string, scopes: string[], hidden: string[]): string {
  const name = esc(details.clientName);
  const origin = details.clientDomain
    ? `Published by <strong>${esc(details.clientDomain)}</strong>.`
    : "This app registered itself, so its name is not verified.";
  const boxes = scopes
    .filter((s) => s !== "profile")
    .map((s) => `<label><input type="checkbox" name="scope" value="${esc(s)}" checked> ${esc(LABELS[s] ?? s)}</label>`)
    .join("");
  const extra = hidden.map((s) => `<input type="hidden" name="scope" value="${esc(s)}">`).join("");
  return layout(
    `Connect ${details.clientName}`,
    `<h1>Allow ${name} to use your LinkedIn?</h1>
<p>${origin} Access will be sent to <strong>${esc(details.redirectHost)}</strong>.</p>
${details.redirectIsLoopback ? `<p class="warn"><strong>This sends access to an app on your computer.</strong> Continue only if you just started signing in from it.</p>` : ""}
<form method="post">
<input type="hidden" name="handle" value="${esc(handle)}">
<label><input type="checkbox" checked disabled> Read my basic LinkedIn profile (name, photo, email)</label>
<input type="hidden" name="scope" value="profile">${boxes}${extra}
<p>Next you will sign in on LinkedIn and approve there.</p>
<div class="row"><button class="primary" name="decision" value="approve">Continue to LinkedIn</button>
<button name="decision" value="deny">Cancel</button></div></form>`,
  );
}

export function errorPage(message: string): string {
  return layout("Something went wrong", `<h1>Something went wrong</h1><p>${esc(message)}</p><p>Go back to your assistant and try connecting again.</p>`);
}
