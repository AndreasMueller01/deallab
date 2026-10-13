// Vercel serverless function — logs a snapshot of a deal someone analysed, so a
// lead arrives as "Jane, looking at a $340k rental in 37206 at $2,800/mo" rather
// than a bare email address.
//
//   POST { trigger: 'auto'|'pdf'|'csv', sessionId, email?, deal: {...} }
//
// 'auto' fires from the client after the visitor has edited a headline input and
// stopped for ~20s (or on leaving the page with an unsent change). 'pdf'/'csv'
// fire on export, the highest-intent moment — the Apps Script also emails
// Andreas for those.
//
// The person is identified by the `deallab_lid` cookie from /api/lead, so this
// works even when localStorage (and the email it holds) has been evicted. The
// script fills in email/name from the Leads tab by leadId when they are missing.

import { forwardToSheet, readJson, readLeadId, originOk, str, num } from './_sheet.js';

const TRIGGERS = new Set(['auto', 'pdf', 'csv']);
const STRATEGIES = new Set(['buyhold', 'brrrr', 'flip', 'existing']);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }
  if (!originOk(req)) { res.status(403).json({ ok: false }); return; }

  const body = await readJson(req);
  const d = (body && typeof body.deal === 'object' && body.deal) || {};
  const trigger = TRIGGERS.has(body.trigger) ? body.trigger : '';
  const strategy = STRATEGIES.has(d.strategy) ? d.strategy : '';
  if (!trigger || !strategy) { res.status(400).json({ ok: false }); return; }

  const email = str(body.email, 200);
  const ok = await forwardToSheet('Deals', {
    timestamp: new Date().toISOString(),
    leadId: readLeadId(req),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
    trigger,
    sessionId: str(body.sessionId, 40),
    strategy,
    address: str(d.address, 200),
    zip: /^\d{5}$/.test(d.zip) ? d.zip : '',
    propertyType: d.propertyType === 'multi' ? 'multi' : 'single',
    units: num(d.units),
    price: num(d.price),
    rentMo: num(d.rentMo),
    otherIncomeMo: num(d.otherIncomeMo),
    rehab: num(d.rehab),
    arv: num(d.arv),
    downPct: num(d.downPct),
    rate: num(d.rate),
    allCash: d.allCash ? 'yes' : '',
    loanBalance: num(d.loanBalance),
    cashFlowMo: num(d.cashFlowMo),
    cashOnCash: num(d.cashOnCash),
    capRate: num(d.capRate),
    dscr: num(d.dscr),
    flipProfit: num(d.flipProfit),
    flipRoi: num(d.flipRoi),
    equity: num(d.equity),
    heatScore: num(d.heatScore),
    heatLabel: str(d.heatLabel, 40),
    advanced: d.advanced ? 'yes' : '',
  });
  res.status(200).json({ ok });
}
