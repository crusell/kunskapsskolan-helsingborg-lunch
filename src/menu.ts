import type { ExtractedMenu } from "./extract";

export type MenuDay = {
  dish: string | null; // null = no lunch served that day
  vegetarian: string | null;
  note: string | null;
};

export type StoredMenu = {
  sourceUrl: string;
  sourceHash: string;
  updatedAt: string;
  days: Record<string, MenuDay>; // keyed by ISO date
};

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"] as const;
const DAY_MS = 86_400_000;

/** Finds the menu PDF link on the school page: first PDF link after the "Matsedel" heading. */
export function findPdfUrl(html: string, pageUrl: string): string | null {
  const heading = html.indexOf('id="h-Matsedel"');
  const hrefs = (s: string) => [...s.matchAll(/href="([^"]+\.pdf)"/gi)].map((m) => m[1]);
  const href =
    (heading >= 0 ? hrefs(html.slice(heading))[0] : undefined) ??
    hrefs(html).find((h) => /matsedel/i.test(decodeURIComponent(h)));
  return href ? new URL(href.replaceAll("&amp;", "&"), pageUrl).href : null;
}

/** Monday (UTC midnight) of the given ISO week. */
export function isoWeekMonday(year: number, week: number): Date {
  const jan4 = Date.UTC(year, 0, 4); // always in ISO week 1
  const dow = (new Date(jan4).getUTCDay() + 6) % 7;
  return new Date(jan4 - dow * DAY_MS + (week - 1) * 7 * DAY_MS);
}

/** The menu only has week numbers, so pick the year that puts the week closest to now. */
export function resolveWeekMonday(week: number, now: Date): Date {
  const y = now.getUTCFullYear();
  return [y - 1, y, y + 1]
    .map((year) => isoWeekMonday(year, week))
    .reduce((a, b) => (Math.abs(+a - +now) <= Math.abs(+b - +now) ? a : b));
}

export function toDays(extracted: ExtractedMenu, now: Date): Record<string, MenuDay> {
  const days: Record<string, MenuDay> = {};
  for (const week of extracted.weeks) {
    const monday = resolveWeekMonday(week.week, now);
    for (const { day, ...rest } of week.days) {
      const date = new Date(+monday + WEEKDAYS.indexOf(day) * DAY_MS);
      days[date.toISOString().slice(0, 10)] = rest;
    }
  }
  return days;
}

export async function sha256(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
