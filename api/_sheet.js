/* global process */
// Shared helpers for the serverless functions. The leading underscore keeps
// Vercel from exposing this file as a route.
//
// Rows go to a Google Apps Script web app bound to Andreas's "DealLab Leads &
// Deals" sheet (see scripts/sheet-webhook.gs). The URL and shared secret live in
// Vercel env vars so neither ever ships to the browser:
//
//   SHEET_WEBHOOK_URL     the Apps Script /exec URL
//   SHEET_WEBHOOK_SECRET  any long random string; must match SECRET in the script
//
// If either is unset (local dev, preview deploys), forwarding is a silent no-op.

export const ALLOWED_ORIGINS = [
  'https://app.nashvilleinvestoragent.com',
  'https://deallab-seven.vercel.app',
];

// Cheap guard against drive-by posts from other sites. Not security: anything
// outside a browser can forge Origin. It keeps the sheet from filling with junk
// posted by someone else's page.
export const originOk = (req) => {
  const o = req.headers.origin;
  if (!o) return true;                                  // same-origin fetches may omit it
  if (ALLOWED_ORIGINS.includes(o)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);   // dev
};

export const readCookie = (req, name) => {
  const jar = (req.headers.cookie || '').split(';').map((c) => c.trim());
  const hit = jar.find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : '';
};

export const LID = 'deallab_lid';
export const LID_PARTITIONED = 'deallab_lid_p';

// The opaque lead id issued by /api/lead. Validated so a hand-edited cookie
// can't inject arbitrary text into the sheet.
export const readLeadId = (req) => {
  const v = readCookie(req, LID) || readCookie(req, LID_PARTITIONED);
  return /^[a-f0-9-]{36}$/.test(v) ? v : '';
};

// Vercel parses JSON bodies into req.body; the Vite dev shim does not, so fall
// back to reading the stream. Capped so nobody can post a novel.
export const readJson = async (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20000) return {};
  }
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
};

export const str = (v, max = 120) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ') // eslint-disable-line no-control-regex
   .trim().slice(0, max) : '';

export const num = (v) => {
  if (v === '' || v === null || v === undefined) return '';   // "not applicable", not zero
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : '';
};

// Await this before responding: Vercel may freeze the function the moment the
// response is sent, which would drop an un-awaited fetch.
export const forwardToSheet = async (tab, row) => {
  const url = process.env.SHEET_WEBHOOK_URL;
  const secret = process.env.SHEET_WEBHOOK_SECRET;
  if (!url || !secret) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      // text/plain: Apps Script reads e.postData.contents either way, and this
      // avoids its redirect quirks with JSON content types.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret, tab, row }),
      redirect: 'follow',
      signal: ctrl.signal,
    });
    return res.ok;
  } catch (e) {
    console.error('sheet forward failed', tab, e && e.message);
    return false;
  } finally {
    clearTimeout(timer);
  }
};
