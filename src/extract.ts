import { getDocumentProxy } from "unpdf";
import { z } from "zod";

export const ExtractedMenu = z.object({
  weeks: z.array(
    z.object({
      week: z.number().int(),
      days: z.array(
        z.object({
          day: z.enum(["mon", "tue", "wed", "thu", "fri"]),
          dish: z.string().nullable(),
          vegetarian: z.string().nullable(),
          note: z.string().nullable(),
        }),
      ),
    }),
  ),
});
export type ExtractedMenu = z.infer<typeof ExtractedMenu>;

const ChatCompletion = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});

export type GatewayEnv = {
  AI_GATEWAY_URL: string;
  AI_GATEWAY_TOKEN: string;
  ANTHROPIC_API_KEY?: string;
  MODEL: string;
};

const SCHEMA = z.toJSONSchema(ExtractedMenu);

const PROMPT = `Below is the text of a PDF with a Swedish school lunch menu ("matsedel") covering one or more ISO weeks ("Vecka 42" etc). Each line is "x,y: text", where x,y is the position of the text on the page in points (x grows to the right, y grows downwards). The layout may be multi-column: use the positions to work out the columns and match each day to the week heading above it in the same column.

Extract every week and every weekday listed:
- week: the ISO week number.
- day: Måndag=mon, Tisdag=tue, Onsdag=wed, Torsdag=thu, Fredag=fri.
- dish: the main dish exactly as written (fix nothing but obvious line-break artifacts). null if no lunch is served that day (e.g. "EJ MAT").
- vegetarian: the "Veg:"/"Vegetariskt:" alternative without the prefix, or null if none is listed.
- note: short extra info for the day, e.g. the country on a theme week ("Japan") or the reason there is no lunch ("EJ MAT"). Otherwise null.

A week where the whole week is closed (e.g. "LOV") gets an empty days array. Do not invent days or dishes that are not in the text.

Reply with only a JSON object matching this JSON Schema, no prose and no code fence:
${JSON.stringify(SCHEMA)}`;

/**
 * The gateway's OpenAI-compatible endpoint takes no PDF input, so the PDF's text layer is
 * sent instead, with positions so the model can untangle the columns.
 */
export async function pdfTextLayout(pdf: ArrayBuffer): Promise<string> {
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const lines: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const height = page.getViewport({ scale: 1 }).height;
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const item of (await page.getTextContent()).items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const y = Math.round(height - item.transform[5]);
      rows.set(y, [...(rows.get(y) ?? []), { x: Math.round(item.transform[4]), str: item.str }]);
    }
    if (doc.numPages > 1) lines.push(`--- page ${n} ---`);
    for (const [y, items] of [...rows].sort((a, b) => a[0] - b[0])) {
      // Items on one row that sit far apart belong to different columns
      let run: typeof items = [];
      const flush = () => run.length && lines.push(`${run[0].x},${y}: ${run.map((i) => i.str).join("").trim()}`);
      for (const item of items.sort((a, b) => a.x - b.x)) {
        const last = run.at(-1);
        if (last && item.x - (last.x + last.str.length * 4) > 60) (flush(), (run = []));
        run.push(item);
      }
      flush();
    }
  }
  if (lines.length < 5) throw new Error("Menu PDF has no text layer (scanned image?)");
  return lines.join("\n");
}

/**
 * Treats the configured URL as an OpenAI-style base URL. A gateway.ai.cloudflare.com URL
 * is pointed at the gateway's /compat endpoint whatever provider suffix it came with.
 */
export function chatCompletionsUrl(url: string): string {
  let base = url.trim().replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
  if (new URL(base).hostname === "gateway.ai.cloudflare.com") {
    base = `${base.replace(/\/(anthropic|openai|compat)$/, "")}/compat`;
  }
  return `${base}/chat/completions`;
}

/** Models may wrap the JSON in a code fence despite being told not to. */
export function parseMenuJson(content: string): ExtractedMenu {
  const json = content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1);
  return ExtractedMenu.parse(JSON.parse(json));
}

export async function extractMenu(pdf: ArrayBuffer, env: GatewayEnv): Promise<ExtractedMenu> {
  if (!env.AI_GATEWAY_URL || !env.AI_GATEWAY_TOKEN) {
    throw new Error("AI_GATEWAY_URL and AI_GATEWAY_TOKEN must be set");
  }

  const response = await fetch(chatCompletionsUrl(env.AI_GATEWAY_URL), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "cf-aig-authorization": `Bearer ${env.AI_GATEWAY_TOKEN}`,
      // OpenAI-style auth: our own provider key if set, otherwise the gateway token
      // (the gateway then supplies the provider key itself)
      Authorization: `Bearer ${env.ANTHROPIC_API_KEY || env.AI_GATEWAY_TOKEN}`,
    },
    body: JSON.stringify({
      model: env.MODEL,
      max_tokens: 16000,
      messages: [
        {
          role: "user",
          content: `${PROMPT}\n\n<pdf_text>\n${await pdfTextLayout(pdf)}\n</pdf_text>`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI Gateway returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }
  const body = await response.text();
  try {
    return parseMenuJson(ChatCompletion.parse(JSON.parse(body)).choices[0].message.content);
  } catch (cause) {
    throw new Error(`Unexpected reply from model: ${body.slice(0, 1500)}`, { cause });
  }
}
