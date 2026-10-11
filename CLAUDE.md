# Matsedel KS

Cloudflare Worker (TypeScript) that turns the Kunskapsskolan Helsingborg lunch menu PDF into
an ICS feed and feeds a static PWA. See README.md for setup and deploy.

## Layout

- `src/index.ts` – Worker entry: `fetch` (`/lunch.ics`, `/menu.json`), `scheduled` (cron), and `refresh()`
- `src/menu.ts` – PDF link scraping, ISO week → date mapping, stored types
- `src/extract.ts` – PDF text layout (`unpdf`) + Claude call via Cloudflare's OpenAI-compatible endpoint (plain `fetch`), reply validated with zod
- `src/ics.ts` – ICS rendering
- `public/` – PWA (plain HTML/CSS/JS, no build step), served by Workers static assets
- `test/menu.test.ts` – vitest, plain node, real PDF fixture `test/matsedel-v42-45.pdf`; `refresh()` takes injected `fetch`/`extract`/`now`

## Rules of the system

- Claude is called only when the PDF link changed **and** the PDF hash differs. Keep it that way.
- The menu has week numbers but no year; `resolveWeekMonday` picks the year nearest to now.
- KV holds one key, `menu` (`StoredMenu`). New extractions are merged over existing days.
- `/menu.json` is the contract with `public/index.html`; change both together.
- The endpoint rejects PDF/file parts, drops PDF data URIs, and turns `response_format` into an
  empty tool call. So: text-only prompt with the JSON Schema inlined, no `response_format`.
- Model ids on this endpoint use dots: `anthropic/claude-haiku-5.5`.
- Secrets live in `.dev.vars` (gitignored); `npm run secrets` pushes them.

## Commands

`npm test` · `npm run typecheck` · `npm run dev` · `npm run deploy`
