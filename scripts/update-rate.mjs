// Scrapes the MND 30-yr fixed rate index and writes public/rate.json.
// Run by .github/workflows/update-rate.yml on a daily schedule.
// No dependencies — uses built-in fetch (Node 18+).

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'rate.json');
const URL = 'https://www.mortgagenewsdaily.com/mortgage-rates/mnd';

function parseRate(html) {
  // The page renders the 30YR figure in a few places. Strategy:
  // 1) Find the "30 Yr. Fixed" table row and grab the first percentage + change.
  // 2) Fall back to the header "30YR Fixed Rate 6.57% -0.03%" pattern.
  let m = html.match(/30\s*Yr\.?\s*Fixed[\s\S]{0,160}?(\d\.\d{2})%[\s\S]{0,40}?([+\-]\d\.\d{2}%)/i);
  if (!m) m = html.match(/30YR\s*Fixed\s*Rate[\s\S]{0,40}?(\d\.\d{2})%[\s\S]{0,40}?([+\-]\d\.\d{2}%)/i);
  if (!m) m = html.match(/(\d\.\d{2})%[\s\S]{0,40}?([+\-]\d\.\d{2}%)/); // last resort: first rate+change pair
  if (!m) return null;
  return { rate: parseFloat(m[1]), change: m[2] };
}

function parseDate(html) {
  const m = html.match(/Last Updated:\s*<\/?[^>]*>?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)
    || html.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*30\s*Yr/i)
    || html.match(/Last Updated:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (!m) return null;
  // Normalize to M/D/YY
  const parts = m[1].split('/');
  const yy = parts[2].length === 4 ? parts[2].slice(2) : parts[2];
  return `${parseInt(parts[0], 10)}/${parseInt(parts[1], 10)}/${yy}`;
}

async function main() {
  const res = await fetch(URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; DealLabRateBot/1.0; +https://www.nashvilleinvestoragent.com)',
      'Accept': 'text/html',
    },
  });
  if (!res.ok) throw new Error(`MND fetch failed: ${res.status}`);
  const html = await res.text();

  const parsed = parseRate(html);
  if (!parsed || isNaN(parsed.rate) || parsed.rate < 1 || parsed.rate > 20) {
    throw new Error('Could not parse a sane 30YR rate from MND');
  }
  const date = parseDate(html) || new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });

  // Avoid rewriting an identical file (keeps git history clean).
  let prev = {};
  try { prev = JSON.parse(readFileSync(OUT, 'utf8')); } catch { /* none */ }

  const out = {
    rate: parsed.rate,
    date,
    change: parsed.change,
    source: 'Mortgage News Daily 30YR Fixed',
    updated: new Date().toISOString(),
  };

  if (prev.rate === out.rate && prev.date === out.date && prev.change === out.change) {
    console.log(`No change (${out.rate}% as of ${out.date}). Skipping write.`);
    return;
  }

  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`Updated rate.json -> ${out.rate}% (${out.change}) as of ${out.date}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
