import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { chatCompletionsUrl, parseMenuJson, pdfTextLayout, type ExtractedMenu } from "../src/extract";
import { buildIcs } from "../src/ics";
import { refresh, type Env } from "../src/index";
import { findPdfUrl, isoWeekMonday, resolveWeekMonday, toDays, type StoredMenu } from "../src/menu";

const PAGE_URL = "https://www.kunskapsskolan.se/skolor/helsingborg/om-skolan/praktisk-information";
const page = (href: string) => `
  <a href="/download/18.3508/1733406295191/Blankett_ledighet.pdf" download>Ladda ner ledighetsansökan</a>
  <h2 class="sv-font-h2-undersida" id="h-Matsedel">Matsedel</h2>
  <p class="normal"><a href="${href}"><strong> Se vad som serveras under veckan</strong></a></p>`;
const HREF = "/download/18.fdaf/1791546821225/Matsedel%20KSH,%20v.42-45.pdf";

const extracted: ExtractedMenu = {
  weeks: [
    {
      week: 42,
      days: [
        { day: "mon", dish: "Korv med potatismos, ketchup och lingon", vegetarian: "Sojakorv", note: null },
        { day: "thu", dish: null, vegetarian: null, note: "EJ MAT" },
      ],
    },
    { week: 44, days: [] },
    { week: 45, days: [{ day: "fri", dish: "Kycklingwok", vegetarian: "Vegetarisk Pad Thai", note: "Thailand" }] },
  ],
};
const now = new Date("2026-10-11T08:00:00Z");

describe("findPdfUrl", () => {
  it("picks the PDF link under the Matsedel heading", () => {
    expect(findPdfUrl(page(HREF), PAGE_URL)).toBe(`https://www.kunskapsskolan.se${HREF}`);
  });

  it("falls back to a link named matsedel when the heading is gone", () => {
    const html = page(HREF).replace('id="h-Matsedel"', "");
    expect(findPdfUrl(html, PAGE_URL)).toBe(`https://www.kunskapsskolan.se${HREF}`);
  });

  it("returns null when there is no menu link", () => {
    expect(findPdfUrl("<a href='/x.pdf'>x</a>", PAGE_URL)).toBeNull();
  });
});

describe("week dates", () => {
  it("resolves ISO week mondays", () => {
    expect(isoWeekMonday(2026, 42).toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(isoWeekMonday(2026, 1).toISOString()).toBe("2025-12-29T00:00:00.000Z");
  });

  it("picks the year closest to now", () => {
    expect(resolveWeekMonday(2, new Date("2026-12-20T00:00:00Z")).toISOString().slice(0, 10)).toBe("2027-01-11");
    expect(resolveWeekMonday(51, new Date("2027-01-05T00:00:00Z")).toISOString().slice(0, 10)).toBe("2026-12-14");
  });

  it("maps extracted weeks to dates and skips closed weeks", () => {
    expect(toDays(extracted, now)).toEqual({
      "2026-10-12": { dish: "Korv med potatismos, ketchup och lingon", vegetarian: "Sojakorv", note: null },
      "2026-10-15": { dish: null, vegetarian: null, note: "EJ MAT" },
      "2026-11-06": { dish: "Kycklingwok", vegetarian: "Vegetarisk Pad Thai", note: "Thailand" },
    });
  });
});

describe("buildIcs", () => {
  const menu: StoredMenu = {
    sourceUrl: "https://example.com/m.pdf",
    sourceHash: "abc",
    updatedAt: "2026-10-11T08:00:00.000Z",
    days: {
      ...toDays(extracted, now),
      "2026-10-13": {
        dish: "Potatis- och purjolökssoppa, rostade kikärtor & bröd med extra allt; och lite till",
        vegetarian: null,
        note: null,
      },
    },
  };
  const ics = buildIcs(menu, "lunch.martincrusell.com");

  it("emits all-day events with escaped text", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(4);
    expect(ics).toContain("UID:lunch-2026-10-12@lunch.martincrusell.com");
    expect(ics).toContain("DTSTAMP:20261011T080000Z");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261012\r\nDTEND;VALUE=DATE:20261013");
    expect(ics).toContain("SUMMARY:Korv med potatismos\\, ketchup och lingon");
    expect(ics).toContain("DESCRIPTION:Veg: Sojakorv");
    expect(ics).toContain("SUMMARY:Ingen lunch (EJ MAT)");
    expect(ics).toContain("SUMMARY:Kycklingwok (Thailand)");
  });

  it("folds lines to 75 octets", () => {
    const encoder = new TextEncoder();
    for (const line of ics.split("\r\n")) expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    expect(ics.replaceAll("\r\n ", "")).toContain("rostade kikärtor & bröd med extra allt\\; och lite till");
  });
});

describe("gateway helpers", () => {
  it("builds the OpenAI-compatible endpoint from any gateway URL form", () => {
    const want = "https://gateway.ai.cloudflare.com/v1/acc/gw/compat/chat/completions";
    for (const suffix of ["", "/", "/anthropic", "/compat", "/compat/chat/completions"]) {
      expect(chatCompletionsUrl(`https://gateway.ai.cloudflare.com/v1/acc/gw${suffix}`)).toBe(want);
    }
    expect(chatCompletionsUrl("https://api.example.com/v1/")).toBe("https://api.example.com/v1/chat/completions");
  });

  it("parses fenced JSON and rejects the wrong shape", () => {
    expect(parseMenuJson("```json\n" + JSON.stringify(extracted) + "\n```")).toEqual(extracted);
    expect(() => parseMenuJson('{"weeks":[{"week":"42","days":[]}]}')).toThrow();
  });
});

describe("pdfTextLayout", () => {
  it("keeps the two columns of the real menu apart, with positions", async () => {
    const file = readFileSync("test/matsedel-v42-45.pdf");
    const layout = await pdfTextLayout(new Uint8Array(file).buffer);
    const lines = layout.split("\n");
    expect(lines).toContain("122,137: Vecka 42:");
    expect(lines).toContain("402,137: Vecka 44:");
    expect(lines).toContain("48,151: Måndag: Korv med potatismos, ketchup och lingon");
    expect(lines).toContain("414,151: LOV");
  });
});

describe("refresh", () => {
  function setup(stored?: StoredMenu) {
    let value = stored ? JSON.stringify(stored) : null;
    let href = HREF;
    let pdf = "pdf-v1";
    const env = {
      SOURCE_URL: PAGE_URL,
      MENU: {
        get: async () => (value ? JSON.parse(value) : null),
        put: async (_key: string, v: string) => void (value = v),
      },
    } as unknown as Env;
    const extract = vi.fn(async () => extracted);
    const deps = {
      fetch: (async (url: string) =>
        url === PAGE_URL ? new Response(page(href)) : new Response(pdf)) as unknown as typeof fetch,
      extract,
      now: () => now,
    };
    return {
      extract,
      run: () => refresh(env, deps),
      publish: (newHref: string, newPdf: string) => ((href = newHref), (pdf = newPdf)),
    };
  }

  it("extracts once, then skips while the link is unchanged", async () => {
    const { run, extract } = setup();
    const menu = await run();
    expect(menu.sourceUrl).toBe(`https://www.kunskapsskolan.se${HREF}`);
    expect(Object.keys(menu.days)).toHaveLength(3);
    await run();
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it("skips the AI call when a new link serves the same PDF", async () => {
    const { run, extract, publish } = setup();
    await run();
    publish("/download/new/Matsedel.pdf", "pdf-v1");
    const menu = await run();
    expect(extract).toHaveBeenCalledTimes(1);
    expect(menu.sourceUrl).toBe("https://www.kunskapsskolan.se/download/new/Matsedel.pdf");
  });

  it("re-extracts when the PDF changes and keeps earlier days", async () => {
    const { run, extract, publish } = setup();
    await run();
    extract.mockResolvedValueOnce({
      weeks: [{ week: 46, days: [{ day: "mon", dish: "Pannkakor", vegetarian: null, note: null }] }],
    });
    publish("/download/new/Matsedel.pdf", "pdf-v2");
    const menu = await run();
    expect(extract).toHaveBeenCalledTimes(2);
    expect(menu.days["2026-11-09"].dish).toBe("Pannkakor");
    expect(menu.days["2026-10-12"].dish).toContain("Korv");
  });
});
