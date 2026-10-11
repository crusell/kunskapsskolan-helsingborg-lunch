import type { StoredMenu } from "./menu";

const escape = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/([;,])/g, "\\$1").replace(/\r?\n/g, "\\n");

/** RFC 5545: lines are max 75 octets, continuation lines start with a space. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  let out = "";
  let length = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (length + size > 75) {
      out += "\r\n ";
      length = 1;
    }
    out += char;
    length += size;
  }
  return out;
}

const compact = (isoDate: string) => isoDate.replaceAll("-", "");

function nextDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function buildIcs(menu: StoredMenu, host: string): string {
  const stamp = menu.updatedAt.replace(/[-:]|\.\d+/g, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//matsedel-ks//Lunch Kunskapsskolan Helsingborg//SV",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Skollunch",
    "X-WR-CALDESC:Lunch på Kunskapsskolan Helsingborg",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];

  for (const date of Object.keys(menu.days).sort()) {
    const { dish, vegetarian, note } = menu.days[date];
    const summary = dish ? (note ? `${dish} (${note})` : dish) : `Ingen lunch${note ? ` (${note})` : ""}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:lunch-${date}@${host}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(date)}`,
      `DTEND;VALUE=DATE:${compact(nextDay(date))}`,
      `SUMMARY:${escape(summary)}`,
      ...(vegetarian ? [`DESCRIPTION:${escape(`Veg: ${vegetarian}`)}`] : []),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
