// Branded export utilities for DealLab — print-to-PDF (no dependencies) + CSV.
// A payload is assembled in App.jsx and rendered here into a self-contained,
// print-optimized HTML document or a CSV file.

const SITE_URL = 'https://www.NashvilleInvestorAgent.com';
const SITE_LABEL = 'NashvilleInvestorAgent.com';

// DealLab flame mark (orange→red), matching the app header.
const flameSVG = (size = 34) => `
<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="dl-flame" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fb923c"/><stop offset="1" stop-color="#dc2626"/>
  </linearGradient></defs>
  <path fill="url(#dl-flame)" d="M12 2c0 3-4 4.5-4 8a4 4 0 0 0 1.4 3.05C8.5 12.4 8.7 10.8 10 9.8c-.2 1.6.3 2.5 1.2 3.4 1 1 1.6 1.9 1.6 3.1A2.8 2.8 0 0 1 12 19c2.9 0 5-2.2 5-5.2 0-2.1-1-3.6-2-5-1.1-1.5-2-3-1-6.8-1 .7-3 2-3 4.2 0 .8.2 1.5.5 2.1-.9-.6-1.5-1.7-1.5-3.1 0-1.6.9-2.8 2-3.2z"/>
</svg>`;

const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const sectionHTML = (title, rows) => `
  <div class="section">
    <h2>${escapeHTML(title)}</h2>
    <table>${rows.map(([l, v]) => `
      <tr><td class="lbl">${escapeHTML(l)}</td><td class="val">${escapeHTML(v)}</td></tr>`).join('')}
    </table>
  </div>`;

const chartHTML = ({ title, bars }) => {
  const max = Math.max(1, ...bars.map(b => Math.abs(b.value)));
  return `
  <div class="section">
    <h2>${escapeHTML(title)}</h2>
    <div class="chart">
      ${bars.map(b => `
        <div class="bar-row">
          <div class="bar-lbl">${escapeHTML(b.label)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.max(1, (Math.abs(b.value) / max) * 100)}%;background:${b.color || '#f97316'}"></div></div>
          <div class="bar-val">${escapeHTML(b.display)}</div>
        </div>`).join('')}
    </div>
  </div>`;
};

const ganttHTML = (phases) => {
  const total = phases.filter(p => !p.parallel).reduce((s, p) => s + (Number(p.weeks) || 0), 0) || 1;
  return `
  <div class="section">
    <h2>Renovation Timeline (Gantt)</h2>
    <div class="gantt">
      ${phases.map(p => {
        const left = (p.start / total) * 100;
        const width = Math.max(2, ((p.end - p.start) / total) * 100);
        return `<div class="gantt-row">
          <div class="gantt-lbl">${p.parallel ? '∥ ' : ''}${escapeHTML(p.name)}</div>
          <div class="gantt-track"><div class="gantt-fill ${p.parallel ? 'par' : ''}" style="left:${left}%;width:${width}%"></div></div>
          <div class="gantt-wk">${Number(p.weeks) || 0}w</div>
        </div>`;
      }).join('')}
    </div>
    <div class="gantt-legend"><span><i class="dot crit"></i> critical path</span> &nbsp; <span><i class="dot par"></i> parallel (overlaps)</span></div>
  </div>`;
};

const checklistsHTML = (lists) => `
  <div class="section page-break">
    <h2>Subcontractor Checklists</h2>
    ${lists.map(l => `
      <div class="cl">
        <h3>${escapeHTML(l.name)}</h3>
        <ul>${l.items.map(i => `<li>&#9744; ${escapeHTML(i)}</li>`).join('')}</ul>
      </div>`).join('')}
  </div>`;

export const buildReportHTML = (p) => {
  const heatColor = p.heat.score >= 80 ? '#dc2626' : p.heat.score >= 60 ? '#f97316'
    : p.heat.score >= 40 ? '#eab308' : p.heat.score >= 20 ? '#10b981' : '#3b82f6';
  return `<!doctype html><html><head><meta charset="utf-8">
<title>DealLab Report — ${escapeHTML(p.strategyLabel)}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, system-ui, Segoe UI, Roboto, sans-serif; color: #0f172a; margin: 0; padding: 32px 36px; position: relative; }
  .watermark { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0.05; z-index: 0; pointer-events: none; transform: rotate(-18deg); }
  .watermark div { font-size: 64px; font-weight: 800; color: #dc2626; letter-spacing: 2px; }
  .content { position: relative; z-index: 1; }
  header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #f97316; padding-bottom: 14px; margin-bottom: 8px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand h1 { font-size: 22px; margin: 0; letter-spacing: -0.5px; }
  .brand p { margin: 0; font-size: 11px; color: #64748b; }
  .brand a { color: #ea580c; text-decoration: none; font-weight: 600; font-size: 11px; }
  .meta { text-align: right; font-size: 11px; color: #64748b; }
  .meta .strat { font-size: 15px; font-weight: 700; color: #0f172a; }
  .verdict { display: flex; align-items: center; gap: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; margin: 16px 0; }
  .score { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 20px; flex: 0 0 auto; }
  .verdict .label { font-size: 17px; font-weight: 800; }
  .verdict .why { font-size: 12px; color: #475569; margin-top: 2px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .section { margin-bottom: 14px; break-inside: avoid; }
  .section h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #ea580c; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 3px 0; font-size: 12.5px; vertical-align: top; }
  td.lbl { color: #475569; }
  td.val { text-align: right; font-weight: 600; }
  .chart .bar-row { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
  .bar-lbl { width: 130px; font-size: 11px; color: #475569; }
  .bar-track { flex: 1; height: 12px; background: #f1f5f9; border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; }
  .bar-val { width: 90px; text-align: right; font-size: 11px; font-weight: 600; }
  .gantt-row { display: flex; align-items: center; gap: 8px; margin: 3px 0; }
  .gantt-lbl { width: 150px; font-size: 11px; color: #475569; }
  .gantt-track { flex: 1; height: 12px; background: #f1f5f9; border-radius: 4px; position: relative; }
  .gantt-fill { position: absolute; top: 0; height: 100%; border-radius: 4px; background: linear-gradient(90deg,#f97316,#dc2626); }
  .gantt-fill.par { background: #94a3b8; }
  .gantt-wk { width: 34px; text-align: right; font-size: 11px; color: #64748b; }
  .gantt-legend { font-size: 10px; color: #64748b; margin-top: 6px; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; vertical-align: middle; }
  .dot.crit { background: #f97316; } .dot.par { background: #94a3b8; }
  .cl { break-inside: avoid; margin-bottom: 10px; }
  .cl h3 { font-size: 13px; margin: 8px 0 4px; color: #0f172a; }
  .cl ul { margin: 0; padding-left: 4px; list-style: none; }
  .cl li { font-size: 12px; color: #334155; padding: 1px 0; }
  .page-break { break-before: page; }
  footer { margin-top: 22px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 10px; color: #94a3b8; text-align: center; }
  footer a { color: #ea580c; text-decoration: none; font-weight: 600; }
  @media print { body { padding: 18px 22px; } @page { margin: 12mm; } }
</style></head>
<body>
  <div class="watermark"><div>${SITE_LABEL}</div></div>
  <div class="content">
    <header>
      <div class="brand">
        ${flameSVG(34)}
        <div>
          <h1>DealLab</h1>
          <p>Real estate underwriting that doesn't suck · <a href="${SITE_URL}">${SITE_LABEL}</a></p>
        </div>
      </div>
      <div class="meta">
        <div class="strat">${escapeHTML(p.strategyLabel)}</div>
        ${p.address ? `<div>${escapeHTML(p.address)}</div>` : ''}
        <div>${escapeHTML(p.dateStr)} · 30-yr: ${escapeHTML(p.liveRate)}%</div>
      </div>
    </header>

    <div class="verdict">
      <div class="score" style="background:${heatColor}">${Math.round(p.heat.score)}</div>
      <div>
        <div class="label">${escapeHTML(p.heat.label)} — ${escapeHTML(p.heat.verdict)}</div>
        <div class="why">${escapeHTML(p.heat.why)}</div>
      </div>
    </div>

    <div class="grid">
      ${p.sections.map(s => sectionHTML(s.title, s.rows)).join('')}
    </div>

    ${(p.charts || []).map(chartHTML).join('')}
    ${p.gantt ? ganttHTML(p.gantt) : ''}
    ${p.remodelChecklists ? checklistsHTML(p.remodelChecklists) : ''}

    <footer>
      Generated by DealLab · <a href="${SITE_URL}">${SITE_LABEL}</a> · DealLab is a tool, not a crystal ball — verify every number with local professionals before transacting.
    </footer>
  </div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 350); };</script>
</body></html>`;
};

export const openPrintReport = (payload) => {
  const html = buildReportHTML(payload);
  const w = window.open('', '_blank');
  if (!w) { alert('Please allow pop-ups to export the PDF report.'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
};

export const downloadCSV = (payload) => {
  const lines = [['Section', 'Item', 'Value']];
  lines.push(['Report', 'Strategy', payload.strategyLabel]);
  if (payload.address) lines.push(['Report', 'Address', payload.address]);
  lines.push(['Report', 'Date', payload.dateStr]);
  lines.push(['Report', '30-yr rate', payload.liveRate + '%']);
  lines.push(['Deal Heat', 'Score', String(Math.round(payload.heat.score))]);
  lines.push(['Deal Heat', 'Verdict', payload.heat.label + ' — ' + payload.heat.verdict]);
  payload.sections.forEach(s => s.rows.forEach(([l, v]) => lines.push([s.title, l, v])));
  if (payload.gantt) payload.gantt.forEach(p => lines.push(['Remodel Timeline', p.name, (Number(p.weeks) || 0) + ' wks']));

  const csv = lines.map(row => row.map(cell => {
    const s = String(cell ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DealLab_${payload.strategy}_${payload.dateStr.replace(/\//g, '-')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
