// Vercel serverless function — durable "this visitor already gave us their info"
// marker, so the lead-capture gate only prompts once per device.
//
// Why server-side: Safari's Intelligent Tracking Prevention deletes localStorage
// and JavaScript-set cookies after 7 days of no visits, which re-prompts returning
// users. A first-party cookie set by the SERVER (via Set-Cookie) is not subject to
// that 7-day cap and persists up to the browser maximum (~400 days).
//
//   POST  -> sets the cookie, returns { ok: true }
//   GET   -> reports whether the cookie is present, returns { hasLead }
//
// The cookie is intentionally NOT HttpOnly so the client can read it directly on
// load (no round-trip); its durability comes from being server-set, not from
// HttpOnly. It holds no PII — just a "1" flag. The actual lead data still goes to
// Jotform as before.

const COOKIE = 'deallab_lead';
const MAX_AGE = 60 * 60 * 24 * 400; // 400 days — the practical browser cap.

const hasLeadCookie = (req) =>
  (req.headers.cookie || '')
    .split(';')
    .some((c) => c.trim().startsWith(`${COOKIE}=`));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); // per-user; never cache.

  if (req.method === 'POST') {
    res.setHeader(
      'Set-Cookie',
      `${COOKIE}=1; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax; Secure`
    );
    res.status(200).json({ ok: true });
    return;
  }

  res.status(200).json({ hasLead: hasLeadCookie(req) });
}
