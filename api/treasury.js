// Vercel serverless function — current 10-year U.S. Treasury par yield.
//
// Source: U.S. Treasury daily par yield curve XML feed (free, no API key).
// We fetch server-side because the Treasury endpoint is CORS-blocked for
// browsers. The data updates once per business day, so we cache aggressively
// at the edge (see Cache-Control below).
//
// Feed shape (Atom): one <entry> per business day; each carries
//   <d:NEW_DATE>2026-07-22T00:00:00</d:NEW_DATE>
//   <d:BC_10YEAR>4.28</d:BC_10YEAR>
// We take the most recent entry that has a 10-year value.

const FEED = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml';

const monthParam = (d) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

// Pull the latest {date, yield} from one month's XML, or null if none.
async function fetchMonth(yyyymm) {
  const url = `${FEED}?data=daily_treasury_yield_curve&field_tdr_date_value_month=${yyyymm}`;
  const res = await fetch(url, { headers: { Accept: 'application/xml' } });
  if (!res.ok) throw new Error(`Treasury feed ${res.status}`);
  const xml = await res.text();

  let best = null;
  const entries = xml.match(/<entry[\s\S]*?<\/entry>/g) || [];
  for (const entry of entries) {
    // Tags carry attributes, e.g. <d:BC_10YEAR m:type="Edm.Double">4.71</d:BC_10YEAR>.
    const date = (entry.match(/<d:NEW_DATE[^>]*>([^<]+)<\/d:NEW_DATE>/) || [])[1];
    const ten = (entry.match(/<d:BC_10YEAR[^>]*>([^<]+)<\/d:BC_10YEAR>/) || [])[1];
    if (!date || ten == null) continue;
    const val = parseFloat(ten);
    if (isNaN(val)) continue;
    if (!best || date > best.date) best = { date, yield: val };
  }
  return best;
}

export default async function handler(req, res) {
  try {
    const now = new Date();
    // Try the current month; near the 1st it may be empty, so fall back to
    // the previous month.
    let latest = await fetchMonth(monthParam(now));
    if (!latest) {
      const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      latest = await fetchMonth(monthParam(prev));
    }
    if (!latest) {
      res.status(502).json({ error: 'No 10-year Treasury data available' });
      return;
    }

    // Daily data — cache 6h at the edge, serve stale for a day while revalidating.
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
    res.status(200).json({
      yield: latest.yield,
      date: latest.date.slice(0, 10), // YYYY-MM-DD
      source: 'U.S. Treasury daily par yield curve',
    });
  } catch (e) {
    res.status(502).json({ error: 'Failed to fetch Treasury yield' });
  }
}
