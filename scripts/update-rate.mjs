// Scrapes the MND 30-yr fixed rate index and writes public/rate.json.
// Run by .github/workflows/update-rate.yml on a daily schedule.
// No dependencies — uses built-in fetch (Node 18+).

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'rate.json');
const URL = 'https://www.mortgagenewsdaily.com/mortgage-rates/mnd';

// Collapse HTML to plain text so tags/classes between the numbers don't matter.
function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ');
}

function parseRate(text) {
  const patterns = [
    /30\s*Yr\.?\s*Fixed(?:\s*Rate)?\D{0,80}?(\d\.\d{2})\s*%\D{0,30}?([+\-]\d\.\d{2})\s*%/i,
    /30\s*YR\s*Fixed\D{0,80}?(\d\.\d{2})\s*%\D{0,30}?([+\-]\d\.\d{2})\s*%/i,
    /30\s*Yr\.?\s*Fixed(?:\s*Rate)?\D{0,80}?(\d\.\d{2})\s*%/i, // rate only, no change
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return { rate: parseFloat(m[1]), change: m[2] ? m[2] + '%' : null };
  }
  return null;
}

function parseDate(text) {
  const m = text.match(/Last Updated:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)
    || text.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*30\s*Yr/i);
  if (!m) return null;
  const parts = m[1].split('/');
  const yy = parts[2].length === 4 ? parts[2].slice(2) : parts[2];
  return `${parseInt(parts[0], 10)}/${parseInt(parts[1], 10)}/${yy}`;
}

async function main() {
  const res = await fetch(URL, {
    headers: {
      // A real browser UA — MND's edge protection rejects/serves a challenge to obvious bots.
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  const html = await res.text();
  const text = stripTags(html);

  const parsed = parseRate(text);
  if (!parsed || isNaN(parsed.rate) || parsed.rate < 1 || parsed.rate > 20) {
    // Diagnostics so a failure tells us *why* (bot challenge vs. markup change).
    const looksBlocked = /just a moment|cf-browser-verification|attention required|enable javascript/i.test(text);
    const fixedIdx = text.search(/30\s*Yr/i);
    console.error(`Could not parse a sane 30YR rate from MND.`);
    console.error(`  HTTP status: ${res.status} ${res.statusText}`);
    console.error(`  HTML bytes: ${html.length}, text bytes: ${text.length}`);
    console.error(`  Looks like a bot/JS challenge page: ${looksBlocked}`);
    console.error(`  Context around "30 Yr": ${fixedIdx >= 0 ? JSON.stringify(text.slice(fixedIdx, fixedIdx + 160)) : 'NOT FOUND'}`);
    const pctIdx = text.search(/\d\.\d{2}\s*%/);
    console.error(`  First "%" context: ${pctIdx >= 0 ? JSON.stringify(text.slice(Math.max(0, pctIdx - 40), pctIdx + 20)) : 'NO PERCENT FOUND'}`);
    process.exit(1);
  }

  const date = parseDate(text) || new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });

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
  console.log(`Updated rate.json -> ${out.rate}% (${out.change ?? 'n/a'}) as of ${out.date}`);
}

main().catch((e) => { console.error('Scrape failed:', e.message); process.exit(1); });
