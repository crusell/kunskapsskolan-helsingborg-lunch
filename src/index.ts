import { extractMenu, type ExtractedMenu, type GatewayEnv } from "./extract";
import { buildIcs } from "./ics";
import { findPdfUrl, sha256, toDays, type StoredMenu } from "./menu";

export type Env = GatewayEnv & {
  MENU: KVNamespace;
  SOURCE_URL: string;
};

type Deps = {
  fetch: typeof fetch;
  extract: (pdf: ArrayBuffer, env: Env) => Promise<ExtractedMenu>;
  now: () => Date;
};

const KEY = "menu";
const USER_AGENT = "Mozilla/5.0 (compatible; matsedel-ks; +https://lunch.martincrusell.com)";

/**
 * Checks the school page for a new menu PDF. Claude is only called when both the
 * link and the PDF content differ from what is stored.
 */
export async function refresh(
  env: Env,
  deps: Deps = { fetch, extract: extractMenu, now: () => new Date() },
): Promise<StoredMenu> {
  const stored = await env.MENU.get<StoredMenu>(KEY, "json");

  const page = await deps.fetch(env.SOURCE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!page.ok) throw new Error(`School page returned ${page.status}`);
  const sourceUrl = findPdfUrl(await page.text(), env.SOURCE_URL);
  if (!sourceUrl) throw new Error("No menu PDF link found on school page");
  if (stored?.sourceUrl === sourceUrl) return stored;

  const pdfResponse = await deps.fetch(sourceUrl, { headers: { "User-Agent": USER_AGENT } });
  if (!pdfResponse.ok) throw new Error(`Menu PDF returned ${pdfResponse.status}`);
  const pdf = await pdfResponse.arrayBuffer();
  const sourceHash = await sha256(pdf);

  let menu: StoredMenu;
  if (stored?.sourceHash === sourceHash) {
    menu = { ...stored, sourceUrl }; // same file re-uploaded under a new link
  } else {
    const now = deps.now();
    const days = toDays(await deps.extract(pdf, env), now);
    menu = { sourceUrl, sourceHash, updatedAt: now.toISOString(), days: { ...stored?.days, ...days } };
    console.log(`New menu from ${sourceUrl}: ${Object.keys(days).length} days`);
  }
  await env.MENU.put(KEY, JSON.stringify(menu));
  return menu;
}

export default {
  async fetch(request, env) {
    const { pathname, host } = new URL(request.url);
    if (pathname !== "/lunch.ics" && pathname !== "/menu.json") {
      return new Response("Not found", { status: 404 });
    }

    let menu: StoredMenu;
    try {
      // First request after deploy has nothing stored yet; after that the cron keeps it fresh
      menu = (await env.MENU.get<StoredMenu>(KEY, "json")) ?? (await refresh(env));
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Menu not available yet" }, { status: 503 });
    }

    const cache = { "Cache-Control": "public, max-age=900" };
    if (pathname === "/menu.json") return Response.json(menu, { headers: cache });
    return new Response(buildIcs(menu, host), {
      headers: {
        ...cache,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="lunch.ics"',
      },
    });
  },

  async scheduled(_controller, env) {
    await refresh(env);
  },
} satisfies ExportedHandler<Env>;
