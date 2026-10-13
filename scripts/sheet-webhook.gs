/**
 * DealLab -> Google Sheet webhook (Google Apps Script, bound to the sheet).
 *
 * The Vercel functions api/lead.js and api/deal.js POST rows here:
 *   { secret, tab: 'Leads' | 'Deals', row: { ...columns } }
 *
 * SETUP (one time, ~5 minutes):
 *   1. In the sheet: Extensions > Apps Script. Replace Code.gs with this file.
 *   2. Set SECRET below to a long random string (same value goes in Vercel as
 *      SHEET_WEBHOOK_SECRET). Save.
 *   3. Run `setup` once from the editor toolbar and approve the permissions
 *      (it needs the sheet, permission to email you, and a 15-minute timer that
 *      queues leads for KW Command).
 *   4. Deploy > New deployment > type "Web app". Execute as: Me.
 *      Who has access: Anyone. Deploy, copy the /exec URL.
 *   5. In Vercel > deallab > Settings > Environment Variables (Production), add
 *      SHEET_WEBHOOK_URL = the /exec URL and SHEET_WEBHOOK_SECRET = the secret.
 *      Redeploy.
 *
 * "Anyone" access is required for a server-to-server POST; the SECRET is what
 * keeps strangers from writing to the sheet. If you edit this script later,
 * use Deploy > Manage deployments > Edit > Version: New version, so the /exec
 * URL stays the same.
 */

const SECRET = 'PASTE-THE-SAME-SECRET-YOU-PUT-IN-VERCEL';

// Who gets the export alert. Blank = the Google account that owns this script.
const NOTIFY_EMAIL = '';

// Fixed column order, so formulas on the "Lead Activity" tab stay valid.
// Unknown keys sent later are appended as new columns rather than dropped.
const HEADERS = {
  Leads: ['timestamp', 'leadId', 'name', 'email', 'phone', 'source', 'referrer', 'commandQueued'],
  Deals: ['timestamp', 'leadId', 'name', 'email', 'trigger', 'strategy', 'address', 'zip',
    'price', 'rentMo', 'units', 'propertyType', 'rehab', 'arv', 'downPct', 'rate', 'allCash',
    'loanBalance', 'otherIncomeMo', 'cashFlowMo', 'cashOnCash', 'capRate', 'dscr',
    'flipProfit', 'flipRoi', 'equity', 'heatScore', 'heatLabel', 'advanced', 'sessionId',
    // Filled by the 'DealLab lead processor' scheduled task, never by this script.
    'commandStatus'],
  // The 'DealLab lead processor' scheduled task reads this tab and creates the KW
  // Command contact (Command has no API). One row per lead, ever: a second row
  // would mean a duplicate contact and a second welcome email.
  'To Command': ['queuedAt', 'leadId', 'firstName', 'lastName', 'email', 'phone', 'source', 'notes',
    // Filled by the 'DealLab lead processor' scheduled task, never by this script.
    'commandStatus', 'processedAt'],
};

// How long a new lead waits before going to Command, so the contact arrives with
// the properties they analysed instead of a bare name. Backfilled leads (captured
// before 2026-10-13, very likely already in Command via Jotform) are not sent.
const COMMAND_DELAY_MIN = 30;

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return reply_(false, 'bad json'); }
  // Tolerate stray quotes/whitespace from copy-pasting the secret into Vercel.
  const got = String((body && body.secret) || '').trim().replace(/^['"]+|['"]+$/g, '');
  if (got !== SECRET) return reply_(false, 'forbidden');
  const tab = body.tab;
  if (!HEADERS[tab] || typeof body.row !== 'object') return reply_(false, 'bad tab');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const row = Object.assign({}, body.row);
    // A backfill re-sends someone already captured. If the browser blocks the
    // lead-id cookie it would re-send on every visit, so skip known emails.
    if (tab === 'Leads' && row.source === 'backfill' && emailKnown_(row.email)) return reply_(true);
    if (tab === 'Deals') fillFromLead_(row);
    appendRow_(tab, row);
    if (tab === 'Deals' && (row.trigger === 'pdf' || row.trigger === 'csv')) notifyExport_(row);
  } finally {
    lock.releaseLock();
  }
  return reply_(true);
}

// Fill name/email on a deal row from the Leads tab via leadId. This is what
// makes rows from Safari visitors (whose localStorage was evicted) still
// carry a name.
function fillFromLead_(row) {
  if (!row.leadId || (row.email && row.name)) return;
  const sh = sheet_('Leads');
  const last = sh.getLastRow();
  if (last < 2) return;
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const iId = hdr.indexOf('leadId'), iName = hdr.indexOf('name'), iEmail = hdr.indexOf('email');
  const data = sh.getRange(2, 1, last - 1, hdr.length).getValues();
  for (let r = data.length - 1; r >= 0; r--) {          // newest first
    if (data[r][iId] === row.leadId) {
      if (!row.name) row.name = data[r][iName];
      if (!row.email) row.email = data[r][iEmail];
      return;
    }
  }
}

function emailKnown_(email) {
  if (!email) return false;
  const sh = sheet_('Leads');
  const last = sh.getLastRow();
  if (last < 2) return false;
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const col = hdr.indexOf('email') + 1;
  const want = String(email).toLowerCase();
  return sh.getRange(2, col, last - 1, 1).getValues().some((r) => String(r[0]).toLowerCase() === want);
}

function appendRow_(tab, row) {
  const sh = sheet_(tab);
  let hdr = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].filter(String);
  const extra = Object.keys(row).filter((k) => hdr.indexOf(k) === -1);
  if (extra.length) {
    sh.getRange(1, hdr.length + 1, 1, extra.length).setValues([extra]).setFontWeight('bold');
    hdr = hdr.concat(extra);
  }
  const values = hdr.map((k) => cell_(row[k]));
  sh.getRange(sh.getLastRow() + 1, 1, 1, values.length).setValues([values]);
}

// Neutralise formula injection: a visitor could type "=IMPORTXML(...)" as an
// address. Prefixing an apostrophe stores it as plain text.
function cell_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function notifyExport_(row) {
  const to = NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
  if (!to) return;
  const money = (n) => (n === '' || n === undefined) ? '' : (Number(n) < 0 ? '-$' : '$') + String(Math.abs(Math.round(Number(n)))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const strat = { buyhold: 'Buy & Hold', brrrr: 'BRRRR', flip: 'Fix & Flip', existing: 'Existing property' }[row.strategy] || row.strategy;
  const who = row.name || row.email || 'An anonymous visitor';
  const where = row.address || (row.zip ? 'ZIP ' + row.zip : 'no address given');
  const lines = [
    who + ' exported a ' + row.trigger.toUpperCase() + ' report from DealLab.',
    '',
    'Strategy: ' + strat,
    'Property: ' + where,
    'Price / value: ' + money(row.price),
    row.rentMo !== '' ? 'Rent: ' + money(row.rentMo) + '/mo' : null,
    row.arv !== '' ? 'ARV: ' + money(row.arv) : null,
    row.cashFlowMo !== '' ? 'Cash flow: ' + money(row.cashFlowMo) + '/mo' : null,
    row.cashOnCash !== '' ? 'Cash-on-cash: ' + Number(row.cashOnCash).toFixed(1) + '%' : null,
    row.flipProfit !== '' ? 'Flip profit: ' + money(row.flipProfit) : null,
    'Deal Heat: ' + row.heatScore + ' (' + row.heatLabel + ')',
    '',
    row.email ? 'Email: ' + row.email : 'No email on file for this device.',
    'Sheet: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl(),
  ].filter((l) => l !== null);
  MailApp.sendEmail({
    to: to,
    subject: 'DealLab export: ' + who + ' — ' + where,
    body: lines.join('\n'),
    replyTo: row.email || undefined,
  });
}

/** Time-driven (every 15 min, installed by setup). Queues matured leads for Command. */
function queueForCommand() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const leads = sheet_('Leads');
    const last = leads.getLastRow();
    if (last < 2) return;
    const hdr = leads.getRange(1, 1, 1, leads.getLastColumn()).getValues()[0];
    const col = (k) => hdr.indexOf(k);
    if (col('commandQueued') === -1) return;
    const data = leads.getRange(2, 1, last - 1, hdr.length).getValues();
    const cutoff = Date.now() - COMMAND_DELAY_MIN * 60000;
    const deals = dealsByLead_();
    data.forEach((r, i) => {
      if (r[col('commandQueued')] || r[col('source')] !== 'gate') return;
      const ts = new Date(r[col('timestamp')]).getTime();
      if (!(ts <= cutoff)) return;
      const name = String(r[col('name')] || '').trim().split(/\s+/);
      appendRow_('To Command', {
        queuedAt: new Date().toISOString(),
        leadId: r[col('leadId')],
        firstName: name[0] || '',
        lastName: name.slice(1).join(' '),
        email: r[col('email')],
        phone: r[col('phone')],
        source: 'DealLab analyzer',
        notes: dealNotes_(deals[r[col('leadId')]] || []),
      });
      leads.getRange(i + 2, col('commandQueued') + 1).setValue(new Date().toISOString());
    });
  } finally {
    lock.releaseLock();
  }
}

function dealsByLead_() {
  const sh = sheet_('Deals');
  const last = sh.getLastRow();
  const out = {};
  if (last < 2) return out;
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.getRange(2, 1, last - 1, hdr.length).getValues().forEach((r) => {
    const o = {};
    hdr.forEach((k, j) => { o[k] = r[j]; });
    if (o.leadId) (out[o.leadId] = out[o.leadId] || []).push(o);
  });
  return out;
}

// "DealLab: 2 properties analysed (1 exported). Buy & Hold — 500 Test St, 37206 —
// $340,000, rent $2,800/mo, CoC 4.1%, Deal Heat 41 COOL [exported PDF]; ..."
function dealNotes_(rows) {
  if (!rows.length) return 'DealLab: signed up, no property analysed in the first ' + COMMAND_DELAY_MIN + ' minutes. See the DealLab sheet for later activity.';
  const money = (n) => (n === '' || n === undefined || n === null) ? '' : (Number(n) < 0 ? '-$' : '$') + String(Math.abs(Math.round(Number(n)))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const strat = { buyhold: 'Buy & Hold', brrrr: 'BRRRR', flip: 'Fix & Flip', existing: 'Existing property' };
  const byKey = {};
  rows.forEach((d) => {
    const k = [d.strategy, String(d.address).toLowerCase(), d.price].join('|');
    const prev = byKey[k];
    byKey[k] = Object.assign({}, prev || {}, d, { exported: (prev && prev.exported) || (d.trigger !== 'auto' ? d.trigger : '') });
  });
  const uniq = Object.values(byKey);
  const exports = uniq.filter((d) => d.exported).length;
  const parts = uniq.slice(-5).reverse().map((d) => [
    strat[d.strategy] || d.strategy,
    d.address || (d.zip ? 'ZIP ' + d.zip : 'no address'),
    money(d.price),
    d.rentMo !== '' ? 'rent ' + money(d.rentMo) + '/mo' : '',
    d.arv !== '' ? 'ARV ' + money(d.arv) : '',
    d.cashOnCash !== '' ? 'CoC ' + Number(d.cashOnCash).toFixed(1) + '%' : '',
    d.flipProfit !== '' ? 'profit ' + money(d.flipProfit) : '',
    'Deal Heat ' + d.heatScore + ' ' + d.heatLabel,
    d.exported ? '[exported ' + String(d.exported).toUpperCase() + ']' : '',
  ].filter(String).join(', '));
  return 'DealLab: ' + uniq.length + ' propert' + (uniq.length === 1 ? 'y' : 'ies') + ' analysed' +
    (exports ? ' (' + exports + ' exported)' : '') + '. ' + parts.join(' | ');
}

/** Appends any HEADERS missing from row 1 (sheets created before a column was added). */
function ensureHeaders_(tab) {
  const sh = sheet_(tab);
  const have = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].filter(String);
  const missing = HEADERS[tab].filter((k) => have.indexOf(k) === -1);
  if (!missing.length) return;
  const need = have.length + missing.length - sh.getMaxColumns();
  if (need > 0) sh.insertColumnsAfter(sh.getMaxColumns(), need);
  sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
}

function sheet_(tab) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(tab);
  if (!sh) {
    sh = ss.insertSheet(tab);
    sh.getRange(1, 1, 1, HEADERS[tab].length).setValues([HEADERS[tab]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function reply_(ok, error) {
  return ContentService.createTextOutput(JSON.stringify(ok ? { ok: true } : { ok: false, error: error }))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor. Creates the tabs, the summary tab, and triggers the permission prompt. */
function setup() {
  sheet_('Leads');
  sheet_('Deals');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let act = ss.getSheetByName('Lead Activity');
  if (!act) act = ss.insertSheet('Lead Activity');
  // One row per person: how many properties they ran, the most recent one, and
  // whether they ever exported. Deals columns: B leadId, C name, D email, E trigger,
  // G address, H zip, I price, A timestamp.
  act.getRange('A1').setFormula(
    '=QUERY(Deals!A:I, "select D, C, count(A), max(A), max(H), max(I) ' +
    'where D is not null group by D, C order by max(A) desc ' +
    'label D \'Email\', C \'Name\', count(A) \'Analyses\', max(A) \'Last seen\', ' +
    'max(H) \'A ZIP\', max(I) \'Top price\'", 1)');
  act.setFrozenRows(1);
  sheet_('To Command');
  ['Leads', 'Deals', 'To Command'].forEach(ensureHeaders_);
  if (!ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === 'queueForCommand')) {
    ScriptApp.newTrigger('queueForCommand').timeBased().everyMinutes(15).create();
  }
  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  if (NOTIFY_EMAIL || Session.getEffectiveUser().getEmail()) MailApp.getRemainingDailyQuota();
}
