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

const COOKIE = 'deallab_lead';
const COOKIE_PARTITIONED = 'deallab_lead_p';
const MAX_AGE = 60 * 60 * 24 * 400; // 400 days — the practical browser cap.

const hasLeadCookie = (req) => {
  const jar = (req.headers.cookie || '').split(';').map((c) => c.trim());
  return jar.some(
    (c) => c.startsWith(`${COOKIE}=`) || c.startsWith(`${COOKIE_PARTITIONED}=`)
  );
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); // per-user; never cache.

  if (req.method === 'POST') {
    res.setHeader('Set-Cookie', [
      `${COOKIE}=1; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax; Secure`,
      `${COOKIE_PARTITIONED}=1; Max-Age=${MAX_AGE}; Path=/; SameSite=None; Secure; Partitioned`,
    ]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(200).json({ hasLead: hasLeadCookie(req) });
}
