import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
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

export type GatewayEnv = {
  AI_GATEWAY_URL: string;
  AI_GATEWAY_TOKEN: string;
  ANTHROPIC_API_KEY?: string;
  MODEL: string;
};

const PROMPT = `This PDF is a Swedish school lunch menu ("matsedel") covering one or more ISO weeks ("Vecka 42" etc). The layout may be multi-column, so match each day to the week heading it sits under.

Extract every week and every weekday listed:
- week: the ISO week number.
- day: Måndag=mon, Tisdag=tue, Onsdag=wed, Torsdag=thu, Fredag=fri.
- dish: the main dish exactly as written (fix nothing but obvious line-break artifacts). null if no lunch is served that day (e.g. "EJ MAT").
- vegetarian: the "Veg:"/"Vegetariskt:" alternative without the prefix, or null if none is listed.
- note: short extra info for the day, e.g. the country on a theme week ("Japan") or the reason there is no lunch ("EJ MAT"). Otherwise null.

A week where the whole week is closed (e.g. "LOV") gets an empty days array. Do not invent days or dishes that are not in the PDF.`;

function toBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function gatewayBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/anthropic") ? trimmed : `${trimmed}/anthropic`;
}

export async function extractMenu(pdf: ArrayBuffer, env: GatewayEnv): Promise<ExtractedMenu> {
  if (!env.AI_GATEWAY_URL || !env.AI_GATEWAY_TOKEN) {
    throw new Error("AI_GATEWAY_URL and AI_GATEWAY_TOKEN must be set");
  }
  const client = new Anthropic({
    baseURL: gatewayBaseUrl(env.AI_GATEWAY_URL),
    apiKey: env.ANTHROPIC_API_KEY || null,
    defaultHeaders: {
      "cf-aig-authorization": `Bearer ${env.AI_GATEWAY_TOKEN}`,
      // Without our own key the gateway supplies it, so send no x-api-key at all
      ...(env.ANTHROPIC_API_KEY ? {} : { "x-api-key": null }),
    },
  });

  const response = await client.messages.parse({
    model: env.MODEL,
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: toBase64(pdf),
            },
          },
          { type: "text", text: PROMPT },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(ExtractedMenu) },
  });

  if (!response.parsed_output) {
    throw new Error(`Menu extraction failed (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}
