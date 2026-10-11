# Matsedel KS

School lunch for Kunskapsskolan Helsingborg as a calendar feed and a small PWA, on
Cloudflare Workers at <https://lunch.martincrusell.com>.

The school publishes the menu as a PDF linked from
[Praktisk information](https://www.kunskapsskolan.se/skolor/helsingborg/om-skolan/praktisk-information).
A cron trigger checks that page twice a day. When the PDF link changes (and the file's
SHA-256 differs from the stored one), the PDF's text is sent to Claude Haiku through
Cloudflare's OpenAI-compatible chat completions endpoint, which returns the menu as JSON.
The result is validated with zod and merged into KV.

That endpoint accepts text and images but not PDFs, so the Worker reads the PDF's text layer
with `unpdf` and sends each line with its page position (`x,y: text`); the model uses the
positions to untangle the two-column layout. A scanned PDF without a text layer fails with a
clear error and the previous menu stays in place.

| Path | What |
|---|---|
| `/` | PWA showing today's and tomorrow's lunch (static files in `public/`) |
| `/lunch.ics` | Calendar feed, one all-day event per school day |
| `/menu.json` | Stored menu: `{ sourceUrl, sourceHash, updatedAt, days: { "YYYY-MM-DD": { dish, vegetarian, note } } }` |

`dish: null` means no lunch that day. Closed weeks (lov) have no entries.

## Setup

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in AI_GATEWAY_URL and AI_GATEWAY_TOKEN
```

- `AI_GATEWAY_URL` – OpenAI-style base URL, e.g. `https://api.cloudflare.com/client/v4/accounts/<account>/ai/v1`
- `AI_GATEWAY_TOKEN` – Cloudflare token, sent as `Authorization: Bearer …`
- `ANTHROPIC_API_KEY` – optional provider key, sent as `Authorization` instead
- `MODEL` (in `wrangler.jsonc`) – `anthropic/claude-haiku-5.5` (note the dot; this endpoint's naming)

## Develop

```bash
npm run dev          # http://localhost:8787
curl "http://localhost:8787/__scheduled?cron=0+4+*+*+*"   # run the cron handler
npm test
npm run typecheck
```

The first request to `/menu.json` or `/lunch.ics` with an empty KV also triggers a refresh.

## Deploy

```bash
npm run secrets      # uploads .dev.vars as Worker secrets
npm run deploy
```

The KV namespace (`matsedel-ks-menu`) id is set in `wrangler.jsonc`. The zone `martincrusell.com` must be
in the same Cloudflare account for the custom domain route.

To force a re-analysis of the current PDF, delete the `menu` key in the `MENU` namespace
(this also drops earlier weeks).
