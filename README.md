# Matsedel KS

School lunch for Kunskapsskolan Helsingborg as a calendar feed and a small PWA, on
Cloudflare Workers at <https://lunch.martincrusell.com>.

The school publishes the menu as a PDF linked from
[Praktisk information](https://www.kunskapsskolan.se/skolor/helsingborg/om-skolan/praktisk-information).
A cron trigger checks that page twice a day. When the PDF link changes (and the file's
SHA-256 differs from the stored one), the PDF is sent to Claude through Cloudflare AI Gateway,
which returns the menu as structured JSON. The result is merged into KV.

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

- `AI_GATEWAY_URL` – `https://gateway.ai.cloudflare.com/v1/<account>/<gateway>` (`/anthropic` is appended if missing)
- `AI_GATEWAY_TOKEN` – sent as `cf-aig-authorization: Bearer …`
- `ANTHROPIC_API_KEY` – optional; leave out when the gateway holds the provider key
- `MODEL` (in `wrangler.jsonc`) – defaults to `claude-haiku-5-5`

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
