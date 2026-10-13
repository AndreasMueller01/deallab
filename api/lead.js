// Vercel serverless function — durable "this visitor already gave us their info"
// marker, so the lead-capture gate only prompts once per device.
//
// Why server-side: Safari's Intelligent Tracking Prevention deletes localStorage
// and JavaScript-set cookies after 7 days of no visits, which re-prompts returning
// users. A cookie set by the SERVER (via Set-Cookie) is not subject to that 7-day
// cap and persists up to the browser maximum (~400 days).
//
// Why TWO cookies (2026-09-15): the app's real home is an iframe on
// nashvilleinvestoragent.com. Whether that frame counts as first-party depends on
// the domain the app is served from, so we set both shapes and accept either:
//
//   deallab_lead    SameSite=Lax                     — the app and the embedding
//                   page share a registrable domain (app.nashvilleinvestoragent.com
//                   inside www.nashvilleinvestoragent.com), or the app is opened
//                   directly at its own URL. The durable, preferred case.
//   deallab_lead_p  SameSite=None; Secure; Partitioned — the app is served from an
//                   unrelated domain (the raw *.vercel.app URL), which makes the
//                   frame third-party. A Lax cookie is then refused at set time AND
//                   never sent back, so it is useless. This CHIPS cookie is keyed to
//                   the embedding site and is the only thing that survives there.
//                   Chrome/Edge/Firefox honour it; Safari does not, reliably — which
//                   is why the same-registrable-domain setup above is the real fix.
//
//   POST  -> sets both cookies, returns { ok: true }
//   GET   -> reports whether either is present, returns { hasLead }
//
// Neither cookie is HttpOnly, so the client can read them on load without a
// round-trip; durability comes from being server-set, not from HttpOnly. They hold
// no PII — just a "1" flag. The actual lead data still goes to Jotform as before.
//
// Lead ID (2026-10-13): POST also issues `deallab_lid` (+ partitioned twin
// `deallab_lid_p`), a random opaque id — still no PII in any cookie. It is the
// join key between the Leads and Deals tabs of the Google Sheet: /api/deal reads
// it so every analysed property is tied to the person who ran it, even after
// Safari has evicted localStorage. When the POST carries contact details, a row
// is written to the Leads tab. `source` is 'gate' for a fresh submission and
// 'backfill' for a visitor captured before lead IDs existed.

import { forwardToSheet, readCookie, readJson, readLeadId, originOk, str, LID, LID_PARTITIONED } from './_sheet.js';

const COOKIE = 'deallab_lead';
const COOKIE_PARTITIONED = 'deallab_lead_p';
const MAX_AGE = 60 * 60 * 24 * 400; // 400 days — the practical browser cap.

const hasLeadCookie = (req) =>
  !!(readCookie(req, COOKIE) || readCookie(req, COOKIE_PARTITIONED));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); // per-user; never cache.

  if (req.method === 'POST') {
    if (!originOk(req)) { res.status(403).json({ ok: false }); return; }
    const body = await readJson(req);
    const existing = readLeadId(req);
    const leadId = existing || crypto.randomUUID();

    res.setHeader('Set-Cookie', [
      `${COOKIE}=1; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax; Secure`,
      `${COOKIE_PARTITIONED}=1; Max-Age=${MAX_AGE}; Path=/; SameSite=None; Secure; Partitioned`,
      `${LID}=${leadId}; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax; Secure`,
      `${LID_PARTITIONED}=${leadId}; Max-Age=${MAX_AGE}; Path=/; SameSite=None; Secure; Partitioned`,
    ]);

    const email = str(body.email, 200);
    const source = body.source === 'backfill' ? 'backfill' : 'gate';
    // A backfill only logs once per device: if this browser already had a lead
    // id, its Leads row already exists.
    const shouldLog = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !(source === 'backfill' && existing);
    if (shouldLog) {
      await forwardToSheet('Leads', {
        timestamp: new Date().toISOString(),
        leadId,
        name: str(body.name, 120),
        email,
        phone: str(body.phone, 40),
        source,
        referrer: str(body.referrer, 300),
      });
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(200).json({ hasLead: hasLeadCookie(req) });
}
