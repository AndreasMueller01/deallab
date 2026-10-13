# DealLab — notes for future work

Hard-won context that is not obvious from the code. Read before changing the embed,
the lead gate, or anything to do with how the app is served.

## How this reaches users

The public home is the Webflow page `/deal-analyzer` on www.nashvilleinvestoragent.com,
which embeds this app in an iframe. **The Vite `index.html` is never what visitors or
Google see.** Lead generation is the entire purpose — Andreas is a broker and the
calculator feeds his funnel. Judge changes by leads and lead quality, not app polish.

The app is served from **app.nashvilleinvestoragent.com** (Vercel custom domain, GoDaddy
CNAME). The raw `deallab-seven.vercel.app` URL still resolves but must NOT be what the
embed points at — see "Lead gate" below for why.

## Lead gate persistence (the subtle one)

`api/lead.js` sets a durable server cookie so returning visitors are not re-prompted.
Originally `SameSite=Lax` only. That silently never worked inside the embed: when the
app was on `*.vercel.app` inside `nashvilleinvestoragent.com`, the iframe was
**third-party**, and browsers refuse to store or send a `Lax` cookie set from a
cross-site frame. Only `localStorage` was holding on, and that is partitioned (Chrome)
or capped at 7 days (Safari ITP). Symptom: repeat prompting on every browser.

Two things fixed it, and both should stay:
1. Two cookies — `deallab_lead` (`SameSite=Lax`) and `deallab_lead_p`
   (`SameSite=None; Secure; Partitioned`). The client accepts either. Note
   `deallab_lead_p=` does not match a `startsWith('deallab_lead=')` test.
2. Serving the app from `app.` so it is **same-site** with `www.` — same registrable
   domain. This is the real fix; the partitioned cookie does not reliably work in Safari.

**Any storage-based "remember this visitor" mechanism added here is subject to the
frame's first-party status.** Check that before designing one. Changing the app's origin
also wipes every visitor's marker once.

## Embed protocol (app <-> Webflow page)

App -> parent: `{source:'deallab', type:'height'|'expand'|'collapse', height?}`
Parent -> app: `{source:'deallab-host', type:'expanded'|'collapsed'}`

The parent identifies the sender by `e.source !== frame.contentWindow`, not a hardcoded
origin, so moving the app again will not silently break sizing.

- `IS_EMBEDDED = window.self !== window.top`; all of this is inert when the app's own
  URL is opened top-level.
- A `ResizeObserver` on `#root` reports height so the frame sizes to content. The
  1680/2150/3250px heights in the embed CSS are only a pre-JS placeholder now.
- **`min-h-screen` is dropped from the root while embedded and collapsed.** With it, the
  measured height is `max(content, frameHeight)`, so the frame could only ever grow —
  switching off Fix & Flip would never shrink it back.
- **The lead gate pins the frame to 760px** rather than auto-height. `LeadGate` is
  `fixed inset-0`, and inside an auto-height frame `fixed` resolves against the frame's
  full height — a 1,700px frame parks the modal ~850px down where nobody sees it.
- Full window: header button ("Try it in Full Window!", primary orange, full-width on
  phones) plus a sticky pill in the host page. The pill exists because in collapsed
  auto-height mode the frame does not scroll, so **nothing inside the app can stay
  pinned to the visitor's viewport** — the app's own button scrolls away with its
  header. Desktop shows the pill only after that header passes; phones show it almost
  immediately, as a full-width bar.
- **Advanced Mode auto-expands to full window**, guarded by a `leftFullWindow` ref set
  on any explicit exit (button, Esc, host message). An explicit exit is an answer — do
  not override it. Advanced persists in localStorage, so test the hand-off in a private
  window.
- Tradeoff: full window hides the site nav, footer and closing CTA. Only the app's own
  footer link back to Andreas survives.

## Working on this repo from a cloud session

- **`git push` does not work from the sandbox bridge** — no network (HTTP 403 via proxy).
  `git commit` works but leaves `.git/*.lock` and `.git/objects/**/tmp_obj_*` it cannot
  delete. Hand Andreas terminal commands instead, and **lead with the lock cleanup**:
  `rm -f .git/HEAD.lock .git/index.lock .git/maintenance.lock`. Andreas runs commands
  verbatim — always start from a freshly opened terminal and include the `cd`.
- The remote is often ahead by the automated rate.json commit, so `git pull --rebase`
  before pushing.
- `npm run build` fails on the bridge (cannot empty `dist/`). Use
  `npx vite build --outDir "$HOME/dl-build-check" --emptyOutDir`.
- `npx eslint src/App.jsx` reports **18 pre-existing problems**. That is the baseline —
  compare against the number, do not read it as new breakage.
- To verify the embed end to end, stage `src/` into the cloud container, `npm install`,
  `vite build`, serve on one port and a harness replicating the Webflow embed on
  another, and drive it with Playwright. Ports differ but hosts match, so that setup is
  same-site — it will NOT reproduce third-party cookie behaviour.
- **Chrome-extension synthetic clicks do not reach into the cross-origin app iframe.**
  Clicking the app's own buttons on the live Webflow page silently does nothing; it
  looks like a bug but is a tooling limit. Verify in-app interactions headlessly, or by
  driving the app's own URL top-level, or ask Andreas to click.
- Do NOT click the PDF export button via browser automation — `openPrintReport` opens a
  print dialog that freezes the session.

## Webflow

Site `66969ce03d94cc8b50b2f354`, page `6a18688cbf449ebc46a7ffb3`, app-embed element
`f74652b9-d262-69ec-d779-121556afc46e`, scoped-CSS embed `5a6f56ba-b8b2-fc79-5b9a-6c0cd1327061`.
Element ids take `component` = the page id. Embed HTML is the `code` setting, read/written
with `data_element_settings_tool`. The site's heading and text classes all ship with
`margin: 0` — fix spacing with page-scoped CSS keyed off a dom id, never by editing the
global classes. Publishing goes live on the real site: ask first, every time.

## Deal snapshots -> Google Sheet (2026-10-13)

The gate captures the person before they have entered a deal, so the deal is sent
separately and joined by an opaque lead id.

- `api/lead.js` POST also issues `deallab_lid` (+ partitioned `deallab_lid_p`), a
  random UUID — still no PII in cookies — and writes a **Leads** row when the body has
  contact details. `source: 'gate'` on submit; `'backfill'` when a visitor captured
  before lead ids existed loads the app (client sends their localStorage details once).
- `api/deal.js` writes a **Deals** row. Triggers: `auto` (a headline input moved off its
  default, then 20s without edits; flushed on `pagehide`/tab hide if pending),
  `pdf`/`csv` on export. Re-sends only when strategy/address/price/rent change; max 25
  auto rows per page load.
- Both forward through `api/_sheet.js` to the Apps Script in `scripts/sheet-webhook.gs`,
  bound to the "DealLab Leads & Deals" sheet. Env vars: `SHEET_WEBHOOK_URL`,
  `SHEET_WEBHOOK_SECRET`. Unset = silent no-op. The script fills missing name/email on
  Deals rows from Leads by leadId (covers Safari-evicted localStorage), de-dupes
  backfills by email, neutralises `=`-prefixed input, and emails Andreas on exports.
- Unlike `track()`, snapshots DO carry the address. They go to our endpoint, not
  analytics, and the gate copy discloses it — keep the disclosure if you touch the gate.
- Testing headlessly: use Playwright's `wait_for_timeout`, not `time.sleep` — a blocked
  sync client stalls the page's network while a route is installed, which looks exactly
  like the debounce or cookies failing.
- **KW Command:** no public API, and its Zapier app can only create contacts. So a Chrome-driven
  scheduled task ("DealLab lead processor", companion to Andreas's "Bp lead processor") is
  the bridge. `queueForCommand` (15-min timer from `setup`) writes ONE row per `gate` lead to
  **To Command** once it is 30 min old, deals summarised in `notes`. The task creates the
  Command contact (tag NEW), sends a DealLab welcome email, adds to Substack, and writes
  `commandStatus`/`processedAt` BEFORE emailing so a lead is never emailed twice. It also
  handles every Deals row with trigger pdf/csv and an empty `commandStatus` (export = buying
  signal: update the contact, tag "DealLab Export", add a follow-up task). Never write a
  second To Command row for a lead. Backfilled (pre-2026-10-13) leads are not queued. Of the 38
  real ones: 11 already existed in Command (tagged "DealLab" by hand), 2 other-brokerage agents
  dropped, 25 added with tags NEW, Cultivate - Follow up, DealLab, "DealLab pre-Oct13".
  Command CSV import gotchas: tags must be COMMA-separated (semicolons become one tag), the
  Notes column is silently dropped, re-uploading the same file name is refused, rows can fail
  for no stated reason (9 of 25 did; create those by hand), a phone match merges into the
  existing contact, the search index lags new contacts by minutes (filter by tag instead), and
  every Import Contacts click demands a KW step-up code that only Andreas can enter.
- **Live setup (2026-10-13):** Apps Script project bound to the sheet, deployed as a web
  app (Execute as Andreas, access Anyone). To change the script: edit, save, then Deploy →
  Manage deployments → Edit → Version: **New version** (keeps the same /exec URL). Web-app
  `console.log` from anonymous callers does NOT show in Executions — log to a sheet tab if
  you need to debug. `api/deal`'s `{ok}` only means Google answered 200; a secret mismatch
  also answers 200 (`{ok:false,error:'forbidden'}` in the body), so verify by checking the sheet.
