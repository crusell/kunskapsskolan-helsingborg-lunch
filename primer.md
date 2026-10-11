# Primer

## What this is

Cloudflare Worker + static PWA for Kunskapsskolan Helsingborg school lunch, to be hosted at
https://lunch.martincrusell.com. Scrapes the menu PDF link from the school site, has Claude
(via Cloudflare AI Gateway, default `claude-haiku-5-5`) extract it to JSON, stores it in KV,
serves `/lunch.ics`, `/menu.json` and a PWA (`public/`) showing today's and tomorrow's lunch.

## State (2026-10-11)

- Worker written, typechecks, 12 vitest tests pass, `wrangler deploy --dry-run` bundles.
- Routes smoke-tested locally with seeded KV.
- PWA in `public/` designed by a Fable subagent.
- Not deployed. Pushed to https://github.com/crusell/kunskapsskolan-helsingborg-lunch (`main`).
- The Claude call through the gateway has never run for real: `.dev.vars` is still empty.

## Next steps

1. User pastes `AI_GATEWAY_URL` + `AI_GATEWAY_TOKEN` into `.dev.vars`.
2. `npm run dev`, hit `/__scheduled?cron=0+4+*+*+*`, check `/menu.json` against the PDF
   (v.42-45: week 44 is LOV, Thursday week 42 is EJ MAT, week 45 is a country theme week).
3. `npm run secrets && npm run deploy`.
4. On the live site: check service worker offline reload, install prompt, `webcal://` on iOS (not verified locally).

## Open blockers

- Gateway credentials (see above).
- Unknown whether the gateway holds the Anthropic key (BYOK/unified billing). If not, set
  `ANTHROPIC_API_KEY` too.
