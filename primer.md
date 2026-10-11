# Primer

## What this is

Cloudflare Worker + static PWA for Kunskapsskolan Helsingborg school lunch, to be hosted at
https://lunch.martincrusell.com. Scrapes the menu PDF link from the school site, has Claude
(Cloudflare OpenAI-compatible endpoint, `anthropic/claude-haiku-5.5`) extract it to JSON, stores it in KV,
serves `/lunch.ics`, `/menu.json` and a PWA (`public/`) showing today's and tomorrow's lunch.

## State (2026-10-11)

- Works end to end locally: real run extracted all 15 days of the v.42-45 PDF correctly
  (week 44 LOV empty, Thu week 42 EJ MAT, week 45 country notes). Second run skipped the AI call.
- Uses Cloudflare's OpenAI-compatible endpoint (`api.cloudflare.com/.../ai/v1`) with
  `anthropic/claude-haiku-5.5`. No PDF input there, so PDF text + positions is sent (`unpdf`).
- 14 vitest tests pass, typecheck clean.
- KV namespace `matsedel-ks-menu` created, id in `wrangler.jsonc`.
- PWA in `public/` designed by a Fable subagent. Has an "Installera" button (native prompt on
  Chromium, instruction sheet on iOS). User confirmed the live site works.
- Pushed to https://github.com/crusell/kunskapsskolan-helsingborg-lunch (`main`).
- Deployed 2026-10-11 to https://lunch.martincrusell.com (custom domain, cron, secrets set).
  Production extraction ran fine: 15 days in KV, `/lunch.ics` has 15 events.

## Next steps

1. On a phone: check service worker offline reload, install prompt, `webcal://` on iOS.
2. Watch the next menu change (after week 45) to confirm the cron picks it up.

## Open blockers

- None. Known limit: a scanned/handwritten PDF without a text layer cannot be read
  (endpoint takes no PDF; image input would need PDF rendering in the Worker).
