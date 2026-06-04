import React, { useState, useEffect, useMemo } from 'react';
import { Flame, Home, Wrench, TrendingUp, AlertTriangle, CheckCircle2, Info, RefreshCw, DollarSign, Calculator, BarChart3, Sliders, Lock, User, Mail, Phone, ShieldCheck, Clock, ListChecks, ChevronDown, ChevronRight, Printer, ArrowRightLeft, Scale, Building2, FileSpreadsheet } from 'lucide-react';
import { openPrintReport, downloadCSV } from './report';

const JOTFORM_ID = '261466092010044';
const STORAGE_KEY = 'deallab_access_granted_v1';

// Deal Heat Index labels per strategy (cold → on-fire). The endpoints change
// to fit each strategy's decision: flip = build vs. walk, existing = hold vs. sell.
const HEAT_LABELS = {
  buyhold:  ['COLD', 'COOL', 'WARM', 'HOT', 'ON FIRE'],
  brrrr:    ['COLD', 'COOL', 'WARM', 'HOT', 'ON FIRE'],
  flip:     ['FORGET IT', 'COOL', 'WARM', 'HOT', 'FLIP IT!'],
  existing: ['LIST IT', 'COOL', 'WARM', 'HOT', 'LOVE IT'],
};

// Default full-renovation plan for a typical cosmetic-to-moderate flip, in build
// order. `parallel: true` means the phase overlaps the prior one and does NOT
// extend the schedule (it's off the critical path). Durations in weeks.
const DEFAULT_REMODEL_PHASES = [
  { id: 1, name: 'Demo & Haul-Off', weeks: 1, cost: 4000, parallel: false,
    checklist: ['Disconnect utilities at fixtures', 'Remove flooring, cabinets, damaged drywall', 'Tear out old fixtures/appliances', 'Order dumpster & haul debris', 'Protect items being kept'] },
  { id: 2, name: 'Plumbing Rough-In', weeks: 1, cost: 5000, parallel: false,
    checklist: ['Pull plumbing permit', 'Re-route/replace supply & drain lines', 'Set tub/shower pans', 'Cap stub-outs for inspection', 'Pressure-test lines'] },
  { id: 3, name: 'Electrical Rough-In', weeks: 1, cost: 4500, parallel: false,
    checklist: ['Pull electrical permit', 'Update panel/breakers as needed', 'Run new circuits, boxes, recessed cans', 'Install smoke/CO detector wiring', 'Leave open for inspection'] },
  { id: 4, name: 'Rough Inspections', weeks: 0.5, cost: 500, parallel: false,
    checklist: ['Schedule plumbing + electrical rough inspections', 'Be on-site for inspector', 'Address any correction notices', 'Get green tags before close-up'] },
  { id: 5, name: 'Drywall & Patch', weeks: 1.5, cost: 4000, parallel: false,
    checklist: ['Insulate exterior walls if open', 'Hang & tape drywall', 'Mud, sand, texture', 'Prime walls/ceilings', 'Final patch of any openings'] },
  { id: 6, name: 'Tile & Flooring', weeks: 1.5, cost: 7000, parallel: false,
    checklist: ['Level subfloor', 'Set tile in baths/kitchen + waterproof wet areas', 'Grout & seal', 'Install LVP/hardwood/carpet', 'Install transitions & baseboards'] },
  { id: 7, name: 'Paint', weeks: 1, cost: 3500, parallel: false,
    checklist: ['Caulk trim & gaps', 'Paint ceilings, walls, trim, doors', 'Paint/refresh exterior & front door', 'Touch-up after other trades'] },
  { id: 8, name: 'Cabinet & Fixture Install', weeks: 1, cost: 9000, parallel: false,
    checklist: ['Set cabinets & countertops', 'Install sinks, faucets, toilets', 'Hang light fixtures & ceiling fans', 'Install appliances', 'Hardware, mirrors, accessories'] },
  { id: 9, name: 'Final Punch List', weeks: 0.5, cost: 1500, parallel: false,
    checklist: ['Walk the house room-by-room', 'Fix dings, adjust doors/drawers', 'Test every outlet, switch, fixture', 'Confirm HVAC heats/cools', 'Final inspection / CO if required'] },
  { id: 10, name: 'Cleanup & Landscaping', weeks: 0.5, cost: 2500, parallel: true,
    checklist: ['Deep clean interior & windows', 'Pressure-wash exterior & driveway', 'Fresh mulch, trim, sod/seed bare spots', 'Stage for photos', 'Install yard sign / lockbox'] },
];

// ============ HELPERS ============
const fmt = (n, opts = {}) => {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const { pct = false, dec = 0, money = false } = opts;
  if (pct) return `${n.toFixed(dec)}%`;
  if (money) return `$${Math.round(n).toLocaleString()}`;
  return n.toFixed(dec);
};

const pmt = (rate, nper, pv) => {
  if (rate === 0) return pv / nper;
  const r = rate / 12 / 100;
  return (pv * r) / (1 - Math.pow(1 + r, -nper));
};

// Net present value of a cash-flow array (index = period, cfs[0] = today).
const npv = (rate, cfs) => cfs.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);

// Internal rate of return via Newton's method with a bisection fallback.
const irr = (cfs) => {
  const hasPos = cfs.some(c => c > 0), hasNeg = cfs.some(c => c < 0);
  if (!hasPos || !hasNeg) return null; // IRR undefined without a sign change
  let r = 0.1;
  for (let i = 0; i < 80; i++) {
    let f = 0, df = 0;
    for (let t = 0; t < cfs.length; t++) {
      f += cfs[t] / Math.pow(1 + r, t);
      df += (-t * cfs[t]) / Math.pow(1 + r, t + 1);
    }
    if (!isFinite(df) || df === 0) break;
    const nr = r - f / df;
    if (!isFinite(nr)) break;
    if (Math.abs(nr - r) < 1e-7) { r = nr; break; }
    r = nr;
  }
  if (!isFinite(r) || r <= -0.999 || r > 10) {
    // Bisection fallback on a sane bracket.
    let lo = -0.99, hi = 10, flo = npv(lo, cfs);
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2, fmid = npv(mid, cfs);
      if (Math.abs(fmid) < 1e-6) return mid;
      if ((flo < 0) === (fmid < 0)) { lo = mid; flo = fmid; } else { hi = mid; }
    }
    r = (lo + hi) / 2;
  }
  return r;
};

// ============ TOOLTIP ============
const Tip = ({ text }) => (
  <span className="group relative inline-block ml-1 align-middle">
    <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-200 cursor-help inline" />
    <span className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2.5 bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg shadow-xl pointer-events-none">
      {text}
    </span>
  </span>
);

// ============ INPUT ============
const NumInput = ({ label, value, onChange, prefix, suffix, tip, step = 1, warn }) => (
  <div>
    <label className="flex items-center text-xs font-medium text-slate-400 mb-1">
      {label}
      {tip && <Tip text={tip} />}
    </label>
    <div className={`flex items-center bg-slate-800/60 border rounded-lg overflow-hidden transition ${warn ? 'border-amber-500/60' : 'border-slate-700 focus-within:border-orange-500'}`}>
      {prefix && <span className="px-2.5 text-slate-500 text-sm">{prefix}</span>}
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(e.target.value === '' ? 0 : parseFloat(e.target.value))}
        className="w-full bg-transparent py-2 px-2 text-sm text-slate-100 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      {suffix && <span className="px-2.5 text-slate-500 text-sm">{suffix}</span>}
    </div>
  </div>
);

// ============ HEAT GAUGE ============
const HeatGauge = ({ score, label, verdict, why, labels = HEAT_LABELS.buyhold }) => {
  const angle = (score / 100) * 180 - 90;
  const cx = 150, cy = 150, r = 110;

  const segments = [
    { from: 0, to: 20, color: '#3b82f6', label: labels[0] },
    { from: 20, to: 40, color: '#10b981', label: labels[1] },
    { from: 40, to: 60, color: '#eab308', label: labels[2] },
    { from: 60, to: 80, color: '#f97316', label: labels[3] },
    { from: 80, to: 100, color: '#dc2626', label: labels[4] },
  ];

  const arc = (start, end) => {
    const a1 = (start / 100) * 180 - 180;
    const a2 = (end / 100) * 180 - 180;
    const x1 = cx + r * Math.cos((a1 * Math.PI) / 180);
    const y1 = cy + r * Math.sin((a1 * Math.PI) / 180);
    const x2 = cx + r * Math.cos((a2 * Math.PI) / 180);
    const y2 = cy + r * Math.sin((a2 * Math.PI) / 180);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };

  const needleX = cx + (r - 5) * Math.cos(((angle - 90) * Math.PI) / 180);
  const needleY = cy + (r - 5) * Math.sin(((angle - 90) * Math.PI) / 180);

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 70%, ${segments.find(s => score >= s.from && score <= s.to)?.color || '#3b82f6'}22, transparent 60%)` }} />
      <div className="relative">
        <div className="flex items-center gap-2 mb-1">
          <Flame className="w-4 h-4 text-orange-500" />
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Deal Heat Index</h3>
        </div>
        <svg viewBox="0 0 300 200" className="w-full max-w-sm mx-auto">
          {segments.map((s, i) => (
            <path key={i} d={arc(s.from, s.to)} fill="none" stroke={s.color} strokeWidth="22" opacity="0.85" />
          ))}
          {segments.map((s, i) => {
            const mid = (s.from + s.to) / 2;
            const a = (mid / 100) * 180 - 180;
            const lx = cx + (r + 16) * Math.cos((a * Math.PI) / 180);
            const ly = cy + (r + 16) * Math.sin((a * Math.PI) / 180);
            return (
              <text key={i} x={lx} y={ly} textAnchor="middle" fontSize="8" fontWeight="700" fill={s.color} opacity="0.9">
                {s.label}
              </text>
            );
          })}
          {[0, 20, 40, 60, 80, 100].map((t) => {
            const a = (t / 100) * 180 - 180;
            const x1 = cx + (r - 12) * Math.cos((a * Math.PI) / 180);
            const y1 = cy + (r - 12) * Math.sin((a * Math.PI) / 180);
            const x2 = cx + (r + 2) * Math.cos((a * Math.PI) / 180);
            const y2 = cy + (r + 2) * Math.sin((a * Math.PI) / 180);
            return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1e293b" strokeWidth="2" />;
          })}
          <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="#f1f5f9" strokeWidth="3" strokeLinecap="round" />
          <circle cx={cx} cy={cy} r="10" fill="#0f172a" stroke="#f1f5f9" strokeWidth="2" />
          <circle cx={cx} cy={cy} r="3" fill="#f1f5f9" />
          <text x={cx} y={185} textAnchor="middle" fontSize="22" fontWeight="800" fill="#f1f5f9">{label}</text>
        </svg>
        <div className="text-center mt-2">
          <div className="text-sm font-semibold text-slate-200">{verdict}</div>
          <div className="text-xs text-slate-400 mt-1 leading-relaxed px-2">{why}</div>
        </div>
      </div>
    </div>
  );
};

// ============ STAT TILE ============
const Stat = ({ label, value, sub, tip, status }) => {
  const colors = {
    good: 'text-emerald-400',
    bad: 'text-red-400',
    warn: 'text-amber-400',
    neutral: 'text-slate-100',
  };
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3.5">
      <div className="flex items-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
        {label}
        {tip && <Tip text={tip} />}
      </div>
      <div className={`text-xl font-bold ${colors[status] || colors.neutral}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
};

// ============ LEAD GATE MODAL ============
const LeadGate = ({ onSuccess }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [error, setError] = useState('');
  const submitting = status === 'submitting';

  const validate = () => {
    if (!name.trim() || name.trim().length < 2) return 'Please enter your full name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address';
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) return 'Please enter a valid phone number';
    return '';
  };

  const handleSubmit = async () => {
    const v = validate();
    if (v) { setError(v); return; }
    setError('');
    setStatus('submitting');

    // Submit to Jotform using a hidden iframe + form technique.
    // This is the only reliable way to submit to Jotform from a custom UI on a
    // different domain — fetch() gets blocked by CORS, but a native form submission
    // targeting a hidden iframe works because browsers allow cross-origin form posts.
    try {
      // Split the full name into first/last for Jotform's compound name field
      const trimmedName = name.trim();
      const nameParts = trimmedName.split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Create the hidden iframe that will receive the submission response.
      // We listen for its load event to confirm the POST actually completed,
      // rather than blindly assuming success.
      const iframeName = `jf_target_${Date.now()}`;
      const iframe = document.createElement('iframe');
      iframe.name = iframeName;
      iframe.style.display = 'none';

      let settled = false;
      let submittedAt = 0;
      const cleanup = () => {
        try { document.body.removeChild(form); } catch (e) { /* gone */ }
        try { document.body.removeChild(iframe); } catch (e) { /* gone */ }
      };
      const succeed = () => {
        if (settled) return;
        settled = true;
        clearTimeout(failTimer);
        // Persist access locally so the user isn't re-prompted on this device.
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, email, phone, ts: Date.now() }));
        } catch (e) { /* localStorage may be unavailable */ }
        setStatus('success');
        setTimeout(() => { cleanup(); onSuccess({ name, email, phone }); }, 1400);
      };
      const fail = () => {
        if (settled) return;
        settled = true;
        cleanup();
        setStatus('error');
        setError("We couldn't confirm your submission. Check your connection and try again.");
      };

      // The iframe fires a load for its initial about:blank when appended; ignore
      // anything that arrives before we actually submit (or within 250ms of it).
      iframe.onload = () => {
        if (submittedAt && Date.now() - submittedAt > 250) succeed();
      };
      // If nothing comes back in time, surface an error with a retry path.
      const failTimer = setTimeout(fail, 9000);

      document.body.appendChild(iframe);

      // Create the hidden form
      const form = document.createElement('form');
      form.action = `https://submit.jotform.com/submit/${JOTFORM_ID}`;
      form.method = 'POST';
      form.target = iframeName;
      form.style.display = 'none';
      form.acceptCharset = 'utf-8';

      // Exact field names from this Jotform form's Advanced tab.
      // Full name is a compound field with first/last sub-fields.
      const fields = {
        'q2_fullname0[first]': firstName,
        'q2_fullname0[last]': lastName,
        'q3_email1': email,
        'q4_phone2[full]': phone,
        'q4_phone2': phone,
        // Required Jotform meta fields
        formID: JOTFORM_ID,
        website: '', // honeypot — must be empty
        simple_spc: `${JOTFORM_ID}-${JOTFORM_ID}`,
      };

      Object.entries(fields).forEach(([key, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
      });

      document.body.appendChild(form);
      submittedAt = Date.now();
      form.submit();
    } catch (e) {
      setStatus('error');
      setError('Something went wrong. Please try again.');
    }
  };

  const formatPhone = (val) => {
    const d = val.replace(/\D/g, '').slice(0, 10);
    if (d.length < 4) return d;
    if (d.length < 7) return `(${d.slice(0,3)}) ${d.slice(3)}`;
    return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-red-600/10 blur-3xl" />
      </div>
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-br from-orange-500 to-red-600 p-6 text-white">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
              <Flame className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Welcome to DealLab</h2>
              <p className="text-orange-100 text-xs">Real estate underwriting that doesn't suck</p>
            </div>
          </div>
          <p className="text-sm text-orange-50 leading-relaxed">
            Get <span className="font-bold">free instant access</span> to the DealLab property analyzer used by serious real estate professionals. Just verify your info below for free access.
          </p>
        </div>

        {status === 'success' && (
          <div className="p-8 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/15 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-100">You're in!</h3>
            <p className="text-sm text-slate-400 mt-1.5">Access granted — loading your analyzer…</p>
          </div>
        )}

        {status !== 'success' && (
        <div className="p-6 space-y-4">
          <GateField
            icon={User}
            label="Full Name"
            value={name}
            onChange={setName}
            placeholder="Jane Smith"
            type="text"
          />
          <GateField
            icon={Mail}
            label="Email Address"
            value={email}
            onChange={setEmail}
            placeholder="jane@example.com"
            type="email"
          />
          <GateField
            icon={Phone}
            label="Phone Number"
            value={phone}
            onChange={(v) => setPhone(formatPhone(v))}
            placeholder="(555) 123-4567"
            type="tel"
          />

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded-lg p-2.5">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 text-white text-sm font-bold shadow-lg shadow-orange-500/30 transition disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Granting access...
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                Get Free Instant Access
              </>
            )}
          </button>

          <div className="flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed pt-1">
            <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-emerald-500" />
            <span>We respect your inbox. Your info is used only for occasional updates from us — never sold or shared. Unsubscribe anytime.</span>
          </div>
        </div>
        )}
      </div>
    </div>
  );
};

const GateField = ({ icon: Icon, label, value, onChange, placeholder, type }) => (
  <div>
    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{label}</label>
    <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg overflow-hidden focus-within:border-orange-500 transition">
      <span className="pl-3 pr-2 text-slate-500">
        <Icon className="w-4 h-4" />
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent py-2.5 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
      />
    </div>
  </div>
);

// ============ MAIN APP ============
export default function App() {
  // Access gate
  const [accessGranted, setAccessGranted] = useState(false);
  const [gateChecked, setGateChecked] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data && data.email) setAccessGranted(true);
      }
    } catch (e) { /* ignore */ }
    setGateChecked(true);
  }, []);

  const [strategy, setStrategy] = useState('buyhold');

  // Live rate (pulled from /rate.json, updated daily by a GitHub Action that scrapes MND)
  const [liveRate, setLiveRate] = useState(6.57);
  const [rateDate, setRateDate] = useState('6/2/26');
  const [rateChange, setRateChange] = useState(null);
  const [rateLoading, setRateLoading] = useState(false);

  // Property
  const [address, setAddress] = useState('');
  const [purchasePrice, setPurchasePrice] = useState(400000);
  const [closingCostsPct, setClosingCostsPct] = useState(1.5);
  const [rehab, setRehab] = useState(0);
  const [arv, setArv] = useState(480000);
  const [apprPct, setApprPct] = useState(3); // annual appreciation, compounded

  // Financing
  const [downPct, setDownPct] = useState(25);
  const [rate, setRate] = useState(6.57);
  const [useLiveRate, setUseLiveRate] = useState(true);
  const [term, setTerm] = useState(30); // amortization period (years)
  const [ioYears, setIoYears] = useState(0); // interest-only period (years)

  // Tax & depreciation assumptions
  const [deprRate, setDeprRate] = useState(3.636); // % of depreciable basis / yr (27.5-yr residential)
  const [buildingPct, setBuildingPct] = useState(80); // % of price that is depreciable improvements (excl. land)
  const [taxRate, setTaxRate] = useState(24); // marginal tax rate for depreciation shield

  // Projection / discounting
  const [discountRate, setDiscountRate] = useState(10); // for NPV
  const [noiGrowth, setNoiGrowth] = useState(2); // stabilized NOI growth %/yr

  // Income — single or multifamily
  const [propertyType, setPropertyType] = useState('single');
  const [singleRent, setSingleRent] = useState(2800);
  const [unitTypes, setUnitTypes] = useState([
    { id: 1, label: '1BR', count: 2, rent: 1400 },
    { id: 2, label: '2BR', count: 2, rent: 1800 },
  ]);
  const [otherIncome, setOtherIncome] = useState(0);
  const [vacancyPct, setVacancyPct] = useState(5);

  const monthlyRent = useMemo(() => {
    if (propertyType === 'single') return singleRent;
    return unitTypes.reduce((sum, u) => sum + (u.count || 0) * (u.rent || 0), 0);
  }, [propertyType, singleRent, unitTypes]);

  const totalUnits = useMemo(() => {
    if (propertyType === 'single') return 1;
    return unitTypes.reduce((sum, u) => sum + (u.count || 0), 0);
  }, [propertyType, unitTypes]);

  const addUnitType = () => {
    const nextId = Math.max(0, ...unitTypes.map(u => u.id)) + 1;
    setUnitTypes([...unitTypes, { id: nextId, label: `Unit ${nextId}`, count: 1, rent: 1500 }]);
  };
  const removeUnitType = (id) => setUnitTypes(unitTypes.filter(u => u.id !== id));
  const updateUnitType = (id, field, value) => {
    setUnitTypes(unitTypes.map(u => u.id === id ? { ...u, [field]: value } : u));
  };

  // Expenses
  const [propertyTax, setPropertyTax] = useState(2400);
  const [insurance, setInsurance] = useState(1200);
  const [mgmtPct, setMgmtPct] = useState(8);
  const [maintPct, setMaintPct] = useState(5);
  const [capexPct, setCapexPct] = useState(5);
  const [utilities, setUtilities] = useState(0);

  // Flip-specific
  const [holdingMonths, setHoldingMonths] = useState(6);
  const [sellingCostsPct, setSellingCostsPct] = useState(7);

  // Remodel planner (Fix & Flip)
  const [remodelPhases, setRemodelPhases] = useState(DEFAULT_REMODEL_PHASES);
  const [remodelUnits, setRemodelUnits] = useState(1);
  const [remodelOverrun, setRemodelOverrun] = useState(15); // % contingency for high end of range
  const [openPhase, setOpenPhase] = useState(null);

  const remodel = useMemo(() => {
    const totalCost = remodelPhases.reduce((s, p) => s + (Number(p.cost) || 0), 0);
    const criticalWeeks = remodelPhases.filter(p => !p.parallel).reduce((s, p) => s + (Number(p.weeks) || 0), 0);
    const lowCost = totalCost;
    const highCost = totalCost * (1 + remodelOverrun / 100);
    const perUnit = remodelUnits > 0 ? totalCost / remodelUnits : totalCost;
    return { totalCost, criticalWeeks, lowCost, highCost, perUnit };
  }, [remodelPhases, remodelUnits, remodelOverrun]);

  const updatePhase = (id, field, value) =>
    setRemodelPhases(remodelPhases.map(p => p.id === id ? { ...p, [field]: value } : p));

  // ===== Analyze Existing Property (hold vs sell) =====
  const [currentValue, setCurrentValue] = useState(480000);
  const [currentBalance, setCurrentBalance] = useState(250000);
  const [currentRate, setCurrentRate] = useState(5.5);
  const [yearsRemaining, setYearsRemaining] = useState(27);
  const [originalBasis, setOriginalBasis] = useState(380000); // original price + capital improvements
  const [accumDepr, setAccumDepr] = useState(40000); // depreciation already taken
  // 1031 + sale tax assumptions
  const [replacementCost, setReplacementCost] = useState(700000);
  const [capGainsRate, setCapGainsRate] = useState(20);
  const [recaptureRate, setRecaptureRate] = useState(25);
  const [stateTaxRate, setStateTaxRate] = useState(0);

  // Stress test
  const [stressRent, setStressRent] = useState(0);
  const [stressVacancy, setStressVacancy] = useState(0);
  const [stressRate, setStressRate] = useState(0);

  useEffect(() => {
    if (useLiveRate) setRate(liveRate);
  }, [useLiveRate, liveRate]);

  // ============ CALCULATIONS ============
  const calc = useMemo(() => {
    const effRent = monthlyRent * (1 - stressRent / 100);
    const effVacancy = vacancyPct + stressVacancy;
    const effRate = rate + stressRate;

    const grossAnnualRent = effRent * 12 + otherIncome * 12;
    const vacancyLoss = grossAnnualRent * (effVacancy / 100);
    const effectiveGrossIncome = grossAnnualRent - vacancyLoss;

    const mgmt = effectiveGrossIncome * (mgmtPct / 100);
    const maint = effRent * 12 * (maintPct / 100);
    const capex = effRent * 12 * (capexPct / 100);
    const operatingExpenses = propertyTax + insurance + utilities * 12 + mgmt + maint + capex;

    const noi = effectiveGrossIncome - operatingExpenses;

    const downPayment = purchasePrice * (downPct / 100);
    const closingCosts = purchasePrice * (closingCostsPct / 100);
    const loanAmount = purchasePrice - downPayment;

    // Interest-only aware payment. During the IO period the payment is interest
    // only; afterward the balance amortizes over the remaining term.
    const ioMonths = Math.round(ioYears * 12);
    const fullTermMonths = term * 12;
    const amortMonths = Math.max(1, fullTermMonths - ioMonths);
    const ioPayment = loanAmount > 0 ? loanAmount * (effRate / 12 / 100) : 0;
    const amortPayment = loanAmount > 0 ? pmt(effRate, amortMonths, loanAmount) : 0;
    // "Current" payment shown to the user: IO payment if in an IO period, else amortizing.
    const monthlyPI = ioMonths > 0 ? ioPayment : amortPayment;
    const annualDebtService = monthlyPI * 12;

    const annualCashFlow = noi - annualDebtService;
    const monthlyCashFlow = annualCashFlow / 12;

    const totalCashIn = downPayment + closingCosts + rehab;

    const capRate = (noi / purchasePrice) * 100;
    const cashOnCash = totalCashIn > 0 ? (annualCashFlow / totalCashIn) * 100 : 0;
    const dscr = annualDebtService > 0 ? noi / annualDebtService : null;
    const grm = grossAnnualRent > 0 ? purchasePrice / grossAnnualRent : 0;

    // --- Appreciation projections (compounded annually) ---
    const apprRate = apprPct / 100;
    const projValue1 = purchasePrice * Math.pow(1 + apprRate, 1);
    const projValue5 = purchasePrice * Math.pow(1 + apprRate, 5);

    // Proper principal paydown via month-by-month amortization (IO-aware).
    const mRate = effRate / 12 / 100;
    const amortBalAfter = (months) => {
      if (loanAmount <= 0) return 0;
      let bal = loanAmount;
      for (let i = 0; i < months; i++) {
        const interest = bal * mRate;
        if (i < ioMonths) continue; // interest-only: no principal reduction
        const principal = amortPayment - interest;
        bal -= principal;
      }
      return Math.max(0, bal);
    };
    const balAfter1 = amortBalAfter(12);
    const balAfter5 = amortBalAfter(60);
    const yr1Principal = loanAmount - balAfter1;
    const yr1Appreciation = projValue1 - purchasePrice;

    // --- Depreciation & tax shield ---
    const annualDepreciation = purchasePrice * (buildingPct / 100) * (deprRate / 100);
    const deprTaxShield = annualDepreciation * (taxRate / 100);

    const totalRoi = totalCashIn > 0 ? ((annualCashFlow + yr1Principal + yr1Appreciation) / totalCashIn) * 100 : 0;

    // Equity projections (value − loan balance)
    const equityNow = purchasePrice - loanAmount;
    const equity1 = projValue1 - balAfter1;
    const equity5 = projValue5 - balAfter5;

    // --- Additional metrics ---
    const debtYield = loanAmount > 0 ? (noi / loanAmount) * 100 : null;
    // Forward (Yr-2) cap rate on cost basis: NOI grown at the stabilized rate over original price.
    const capRateYr2 = purchasePrice > 0 ? (noi * Math.pow(1 + noiGrowth / 100, 2) / purchasePrice) * 100 : 0;

    // Return on equity (initial cash) including the depreciation tax shield.
    const initialEquityReturn = totalCashIn > 0
      ? ((annualCashFlow + yr1Principal + yr1Appreciation + deprTaxShield) / totalCashIn) * 100 : 0;
    // Cumulative 5-year return on the initial equity invested.
    const cumCashFlow5 = annualCashFlow * 5;
    const cumPrincipal5 = loanAmount - balAfter5;
    const cumAppreciation5 = projValue5 - purchasePrice;
    const cumDeprShield5 = deprTaxShield * 5;
    const totalEquityReturn5 = totalCashIn > 0
      ? ((cumCashFlow5 + cumPrincipal5 + cumAppreciation5 + cumDeprShield5) / totalCashIn) * 100 : 0;

    // --- 5-year IRR / NPV on a stabilized-NOI projection with a Year-5 sale ---
    const holdYears = 5;
    const saleNet5 = projValue5 * (1 - sellingCostsPct / 100) - balAfter5;
    const cashFlows = [-totalCashIn];
    for (let y = 1; y <= holdYears; y++) {
      const noiY = noi * Math.pow(1 + noiGrowth / 100, y - 1);
      let cf = noiY - annualDebtService;
      if (y === holdYears) cf += saleNet5;
      cashFlows.push(cf);
    }
    const projIRR = irr(cashFlows);
    const projNPV = npv(discountRate / 100, cashFlows);

    const mao = arv * 0.7 - rehab;
    const sellingCosts = arv * (sellingCostsPct / 100);
    const holdingCosts = (propertyTax / 12 + insurance / 12 + utilities + monthlyPI) * holdingMonths;
    const flipProfit = arv - purchasePrice - rehab - closingCosts - sellingCosts - holdingCosts;
    const flipRoi = totalCashIn > 0 ? (flipProfit / (totalCashIn + holdingCosts)) * 100 : 0;

    const refiLoanAmount = arv * 0.75;
    const cashOut = refiLoanAmount - loanAmount;
    const cashLeftIn = totalCashIn - cashOut;
    const refiPI = pmt(effRate, term * 12, refiLoanAmount);
    const refiCashFlow = (noi - refiPI * 12);
    const brrrCoC = cashLeftIn > 0 ? (refiCashFlow / cashLeftIn) * 100 : (refiCashFlow > 0 ? 999 : 0);

    return {
      grossAnnualRent, vacancyLoss, effectiveGrossIncome, operatingExpenses, noi,
      downPayment, closingCosts, loanAmount, monthlyPI, annualDebtService,
      annualCashFlow, monthlyCashFlow, totalCashIn,
      capRate, cashOnCash, dscr, grm, totalRoi,
      mao, flipProfit, flipRoi, holdingCosts, sellingCosts,
      refiLoanAmount, cashOut, cashLeftIn, refiPI, refiCashFlow, brrrCoC,
      mgmt, maint, capex,
      projValue1, projValue5, balAfter1, balAfter5, yr1Principal, yr1Appreciation,
      equityNow, equity1, equity5,
      ioMonths, ioPayment, amortPayment,
      annualDepreciation, deprTaxShield, debtYield, capRateYr2,
      initialEquityReturn, totalEquityReturn5, projIRR, projNPV, saleNet5, cashFlows,
    };
  }, [purchasePrice, closingCostsPct, rehab, arv, downPct, rate, term, ioYears, monthlyRent, otherIncome,
      vacancyPct, propertyTax, insurance, mgmtPct, maintPct, capexPct, utilities, apprPct,
      deprRate, buildingPct, taxRate, discountRate, noiGrowth,
      holdingMonths, sellingCostsPct, stressRent, stressVacancy, stressRate]);

  // ============ EXISTING-PROPERTY CALC (hold vs sell + 1031) ============
  const existingCalc = useMemo(() => {
    const grossAnnualRent = monthlyRent * 12 + otherIncome * 12;
    const vacancyLoss = grossAnnualRent * (vacancyPct / 100);
    const egi = grossAnnualRent - vacancyLoss;
    const mgmt = egi * (mgmtPct / 100);
    const maint = monthlyRent * 12 * (maintPct / 100);
    const capex = monthlyRent * 12 * (capexPct / 100);
    const opex = propertyTax + insurance + utilities * 12 + mgmt + maint + capex;
    const noi = egi - opex;

    const mRate = currentRate / 12 / 100;
    const ioMonths = Math.round(ioYears * 12);
    const amortMonths = Math.max(1, yearsRemaining * 12 - ioMonths);
    const ioPayment = currentBalance > 0 ? currentBalance * mRate : 0;
    const amortPayment = currentBalance > 0 ? pmt(currentRate, amortMonths, currentBalance) : 0;
    const monthlyPayment = ioMonths > 0 ? ioPayment : amortPayment;
    const annualDebtService = monthlyPayment * 12;
    const cashFlow = noi - annualDebtService;

    const equity = currentValue - currentBalance;
    const capRate = currentValue > 0 ? (noi / currentValue) * 100 : 0;
    const dscr = annualDebtService > 0 ? noi / annualDebtService : null;
    const debtYield = currentBalance > 0 ? (noi / currentBalance) * 100 : null;

    // Principal paid over the next 12 months (interest-only aware).
    let bal = currentBalance, principalYr1 = 0;
    for (let i = 0; i < 12 && currentBalance > 0; i++) {
      const interest = bal * mRate;
      if (i < ioMonths) continue;
      const principal = amortPayment - interest;
      bal -= principal; principalYr1 += principal;
    }
    principalYr1 = Math.max(0, principalYr1);

    const apprGain = currentValue * (apprPct / 100);
    const annualDepreciation = originalBasis * (buildingPct / 100) * (deprRate / 100);
    const deprTaxShield = annualDepreciation * (taxRate / 100);

    const totalReturnHold = cashFlow + principalYr1 + apprGain + deprTaxShield;
    const roe = equity > 0 ? (totalReturnHold / equity) * 100 : 0;        // return on equity if held
    const cashOnEquity = equity > 0 ? (cashFlow / equity) * 100 : 0;

    // ----- SELL scenario with taxes -----
    const sellingCosts = currentValue * (sellingCostsPct / 100);
    const amountRealized = currentValue - sellingCosts;
    const adjustedBasis = originalBasis - accumDepr;
    const totalGain = amountRealized - adjustedBasis;
    const recaptureTax = Math.max(0, accumDepr) * (recaptureRate / 100);    // depreciation recapture
    const capGainPortion = Math.max(0, totalGain - Math.max(0, accumDepr));
    const capGainsTax = capGainPortion * ((capGainsRate + stateTaxRate) / 100);
    const totalTaxIfSell = recaptureTax + capGainsTax;
    const netSaleProceeds = amountRealized - currentBalance - totalTaxIfSell;

    // Redeploy net proceeds at the required return — the opportunity cost of holding.
    const redeployReturn = netSaleProceeds * (discountRate / 100);

    // 1031 exchange: defer all tax, roll full equity into the replacement.
    const equity1031 = amountRealized - currentBalance;                     // tax-deferred equity available
    const newLoan1031 = Math.max(0, replacementCost - equity1031);
    const ltv1031 = replacementCost > 0 ? (newLoan1031 / replacementCost) * 100 : 0;
    const taxesDeferred = totalTaxIfSell;

    return {
      noi, cashFlow, monthlyPayment, annualDebtService, equity, capRate, dscr, debtYield,
      principalYr1, apprGain, annualDepreciation, deprTaxShield, totalReturnHold, roe, cashOnEquity,
      sellingCosts, adjustedBasis, totalGain, recaptureTax, capGainsTax, totalTaxIfSell, netSaleProceeds,
      redeployReturn, equity1031, newLoan1031, ltv1031, taxesDeferred,
    };
  }, [monthlyRent, otherIncome, vacancyPct, mgmtPct, maintPct, capexPct, propertyTax, insurance, utilities,
      currentValue, currentBalance, currentRate, yearsRemaining, ioYears, apprPct, originalBasis, accumDepr,
      buildingPct, deprRate, taxRate, sellingCostsPct, capGainsRate, recaptureRate, stateTaxRate,
      discountRate, replacementCost]);

  // ============ HEAT SCORE ============
  const heat = useMemo(() => {
    const L = HEAT_LABELS[strategy] || HEAT_LABELS.buyhold;

    if (strategy === 'existing') {
      const roe = existingCalc.roe;
      const cf = existingCalc.cashFlow / 12;
      let score;
      if (cf < 0 && roe < 5) score = Math.max(8, 22 + cf / 200);
      else if (roe < 4) score = 28;
      else if (roe < 7) score = 46;
      else if (roe < 10) score = 62;
      else if (roe < 15) score = 78;
      else score = 90;
      score = Math.max(0, Math.min(100, score));
      const label = L[Math.min(4, Math.floor(score / 20))];
      const proceeds = fmt(existingCalc.netSaleProceeds, { money: true });
      let verdict, why;
      if (score < 20) { verdict = 'Sell or 1031'; why = `Return on equity is only ${fmt(roe, { pct: true, dec: 1 })}. Your equity is working too hard for too little — selling frees ~${proceeds} to redeploy.`; }
      else if (score < 40) { verdict = 'Lean sell'; why = `${fmt(roe, { pct: true, dec: 1 })} ROE is below your ${discountRate}% hurdle. Consider a 1031 into a higher-yielding property.`; }
      else if (score < 60) { verdict = 'Toss-up'; why = `${fmt(roe, { pct: true, dec: 1 })} ROE is middling. Hold for stability, or sell/1031 if you can redeploy at a higher return.`; }
      else if (score < 80) { verdict = 'Hold'; why = `${fmt(roe, { pct: true, dec: 1 })} ROE with ${fmt(existingCalc.cashOnEquity, { pct: true, dec: 1 })} cash-on-equity. The equity is earning its keep — keep it.`; }
      else { verdict = 'Love it — keep it'; why = `Excellent ${fmt(roe, { pct: true, dec: 1 })} ROE. This one's a keeper; don't sell a winner.`; }
      return { score, label, verdict, why };
    }

    if (strategy === 'flip') {
      const profit = calc.flipProfit;
      const roi = calc.flipRoi;
      let score = 0;
      if (profit < 0) score = 5;
      else if (roi < 10) score = 25;
      else if (roi < 20) score = 50;
      else if (roi < 35) score = 72;
      else score = 90;

      let label, verdict, why;
      if (score < 20) { label = L[0]; verdict = 'Walk away'; why = `Projected loss of ${fmt(Math.abs(profit), { money: true })}. The numbers don't work.`; }
      else if (score < 40) { label = L[1]; verdict = 'Weak flip'; why = `${fmt(roi, { pct: true, dec: 1 })} ROI is too thin for the risk of a flip. Push the price down.`; }
      else if (score < 60) { label = L[2]; verdict = 'Marginal'; why = `${fmt(roi, { pct: true, dec: 1 })} ROI is okay but leaves little margin for surprises. Pad your rehab budget.`; }
      else if (score < 80) { label = L[3]; verdict = 'Solid flip'; why = `${fmt(profit, { money: true })} projected profit at ${fmt(roi, { pct: true, dec: 1 })} ROI. Verify ARV with strong comps.`; }
      else { label = L[4]; verdict = 'Move fast'; why = `Excellent margin: ${fmt(profit, { money: true })} profit, ${fmt(roi, { pct: true, dec: 1 })} ROI. Confirm comps and lock it up.`; }
      return { score, label, verdict, why };
    }

    const coc = strategy === 'brrrr' ? calc.brrrCoC : calc.cashOnCash;
    const dscr = calc.dscr;
    const cf = calc.monthlyCashFlow;

    let score;
    if (cf < 0 || (dscr !== null && dscr < 1.0)) {
      score = Math.max(5, 15 + cf / 100);
    } else if (coc < 4) {
      score = 20 + (coc / 4) * 20;
    } else if (coc < 6) {
      score = 40 + ((coc - 4) / 2) * 20;
    } else if (coc < 10) {
      score = 60 + ((coc - 6) / 4) * 20;
    } else {
      score = Math.min(95, 80 + (coc - 10) * 1.5);
    }
    if (dscr !== null && dscr < 1.25 && score > 70) score = 70;
    if (dscr !== null && dscr < 1.1 && score > 55) score = 55;

    score = Math.max(0, Math.min(100, score));

    let label, verdict, why;
    if (score < 20) { label = L[0]; verdict = 'Walk away'; why = `Negative cash flow of ${fmt(Math.abs(cf), { money: true })}/mo. This deal bleeds money — don't buy it to feed it.`; }
    else if (score < 40) { label = L[1]; verdict = 'Weak deal'; why = `${fmt(coc, { pct: true, dec: 1 })} cash-on-cash is below the 6% floor. Negotiate the price down or find a better property.`; }
    else if (score < 60) { label = L[2]; verdict = 'Marginal'; why = `${fmt(coc, { pct: true, dec: 1 })} cash-on-cash is in the 4–6% gray zone. Acceptable if you believe in appreciation, but stress-test it.`; }
    else if (score < 80) { label = L[3]; verdict = 'Solid deal'; why = `${fmt(coc, { pct: true, dec: 1 })} cash-on-cash with DSCR of ${fmt(dscr, { dec: 2 })}. This pencils — verify your rent and expense assumptions.`; }
    else { label = L[4]; verdict = 'Pounce'; why = `${fmt(coc, { pct: true, dec: 1 })} cash-on-cash and DSCR of ${fmt(dscr, { dec: 2 })}. Excellent numbers — lock it up before someone else does.`; }
    return { score, label, verdict, why };
  }, [calc, existingCalc, strategy, discountRate]);

  // ============ SANITY CHECKS ============
  const warnings = useMemo(() => {
    const list = [];
    if (vacancyPct < 5) list.push({ field: 'vacancy', msg: 'Vacancy under 5% is optimistic. Most markets see 5–10%. Check local rental market data.' });
    if (vacancyPct > 15) list.push({ field: 'vacancy', msg: 'Vacancy over 15% is unusually high. Verify this is realistic for the area.' });
    if (maintPct < 5) list.push({ field: 'maint', msg: 'Maintenance under 5% of rent is unrealistic on most properties. Old homes need more.' });
    if (capexPct < 5) list.push({ field: 'capex', msg: 'CapEx reserves under 5% will hurt you when the roof or HVAC dies. Use 7–10% as a baseline.' });
    if (mgmtPct < 6 && monthlyRent > 0) list.push({ field: 'mgmt', msg: 'Even if you self-manage, account for 8% — your time has value, and you may not always self-manage.' });
    if (calc.cashOnCash > 0 && calc.cashOnCash < 6 && strategy === 'buyhold') {
      list.push({ field: 'rent', msg: `Cash-on-cash of ${fmt(calc.cashOnCash, { pct: true, dec: 1 })} is below the 6% baseline. Either rent is too low or price is too high — verify both with local comps.` });
    }
    if (calc.dscr !== null && calc.dscr < 1.25 && calc.dscr > 0) {
      list.push({ field: 'dscr', msg: `DSCR of ${fmt(calc.dscr, { dec: 2 })} is below 1.25 — most DSCR lenders won't fund this, and you have no cushion for surprises.` });
    }
    return list;
  }, [vacancyPct, maintPct, capexPct, mgmtPct, monthlyRent, calc, strategy]);

  const fetchLiveRate = async () => {
    setRateLoading(true);
    try {
      // Cache-bust so we always get the freshest committed value.
      const res = await fetch(`/rate.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('rate fetch failed');
      const data = await res.json();
      if (typeof data.rate === 'number' && !isNaN(data.rate)) {
        setLiveRate(data.rate);
        if (data.date) setRateDate(data.date);
        if (data.change !== undefined && data.change !== null) setRateChange(data.change);
      }
    } catch (e) {
      // Keep last-known/fallback rate on failure — non-fatal.
    } finally {
      setRateLoading(false);
    }
  };

  // Pull the live rate on first load.
  useEffect(() => { fetchLiveRate(); }, []);

  const refreshRate = () => { fetchLiveRate(); };

  // ============ EXPORT PAYLOAD ============
  const buildPayload = () => {
    const m = (n) => fmt(n, { money: true });
    const pct = (n, d = 1) => fmt(n, { pct: true, dec: d });
    const STRAT = { buyhold: 'Buy & Hold', brrrr: 'BRRRR', flip: 'Fix & Flip', existing: 'Analyze Existing Property' };
    const base = {
      strategy,
      strategyLabel: STRAT[strategy] || 'Deal',
      address: address.trim(),
      dateStr: new Date().toLocaleDateString('en-US'),
      liveRate: String(rate),
      heat: { score: heat.score, label: heat.label, verdict: heat.verdict, why: heat.why },
      sections: [],
      charts: [],
      gantt: null,
      remodelChecklists: null,
    };

    if (strategy === 'flip') {
      base.sections = [
        { title: 'Property & Purchase', rows: [
          ['Purchase Price', m(purchasePrice)], ['Closing Costs', pct(closingCostsPct)],
          ['Rehab Budget', m(rehab)], ['ARV', m(arv)] ] },
        { title: 'Financing', rows: [
          ['Down Payment', pct(downPct)], ['Interest Rate', pct(rate, 2)],
          ['Loan Amount', m(calc.loanAmount)], ['Monthly P&I', m(calc.monthlyPI)] ] },
        { title: 'Flip Returns', rows: [
          ['Projected Profit', m(calc.flipProfit)], ['ROI', pct(calc.flipRoi)],
          ['MAO (70% rule)', m(calc.mao)], ['Holding Costs', m(calc.holdingCosts)],
          ['Selling Costs', m(calc.sellingCosts)], ['Holding Period', `${holdingMonths} mo`] ] },
        { title: 'Remodel Plan', rows: [
          ['Timeline (critical path)', `${remodel.criticalWeeks.toFixed(1)} wks`],
          ['Cost Range', `${m(remodel.lowCost)} – ${m(remodel.highCost)}`],
          ['Total Cost', m(remodel.totalCost)], ['Per Unit', m(remodel.perUnit)] ] },
      ];
      base.charts = [{ title: 'Flip Economics', bars: [
        { label: 'ARV', value: arv, display: m(arv), color: '#10b981' },
        { label: 'Purchase', value: purchasePrice, display: m(purchasePrice), color: '#64748b' },
        { label: 'Rehab', value: rehab, display: m(rehab), color: '#f97316' },
        { label: 'Profit', value: calc.flipProfit, display: m(calc.flipProfit), color: '#dc2626' },
      ] }];
      // Gantt + checklists from remodel phases
      let cursor = 0;
      base.gantt = remodelPhases.map(p => {
        const w = Number(p.weeks) || 0;
        if (p.parallel) { const start = Math.max(0, cursor - w); return { name: p.name, weeks: w, start, end: start + w, parallel: true }; }
        const seg = { name: p.name, weeks: w, start: cursor, end: cursor + w, parallel: false };
        cursor += w; return seg;
      });
      base.remodelChecklists = remodelPhases.map(p => ({ name: p.name, items: p.checklist }));
      return base;
    }

    if (strategy === 'existing') {
      base.sections = [
        { title: 'Existing Property', rows: [
          ['Current Value', m(currentValue)], ['Loan Balance', m(currentBalance)],
          ['Your Rate', pct(currentRate, 3)], ['Years Remaining', `${yearsRemaining} yrs`],
          ['Current Equity', m(existingCalc.equity)], ['Original Basis', m(originalBasis)],
          ['Depreciation Taken', m(accumDepr)] ] },
        { title: 'Performance', rows: [
          ['Monthly Cash Flow', m(existingCalc.cashFlow / 12)], ['NOI (annual)', m(existingCalc.noi)],
          ['Cap Rate', pct(existingCalc.capRate, 2)], ['Debt Yield', pct(existingCalc.debtYield)],
          ['DSCR', fmt(existingCalc.dscr, { dec: 2 })],
          ['Return on Equity', pct(existingCalc.roe)], ['Cash-on-Equity', pct(existingCalc.cashOnEquity)] ] },
        { title: 'Hold vs. Sell', rows: [
          ['Keep: annual return', m(existingCalc.totalReturnHold)],
          ['Selling costs', m(existingCalc.sellingCosts)],
          ['Depreciation recapture tax', m(existingCalc.recaptureTax)],
          ['Capital gains tax', m(existingCalc.capGainsTax)],
          ['Net proceeds if sold', m(existingCalc.netSaleProceeds)],
          ['Redeploy @ ' + discountRate + '%', m(existingCalc.redeployReturn) + '/yr'] ] },
        { title: '1031 Exchange', rows: [
          ['Replacement Price', m(replacementCost)], ['Tax Deferred', m(existingCalc.taxesDeferred)],
          ['Equity to Reinvest', m(existingCalc.equity1031)], ['New Loan Needed', m(existingCalc.newLoan1031)],
          ['New LTV', pct(existingCalc.ltv1031, 0)] ] },
      ];
      base.charts = [{ title: 'Hold vs. Sell (annual $)', bars: [
        { label: 'Keep — total return', value: existingCalc.totalReturnHold, display: m(existingCalc.totalReturnHold), color: '#10b981' },
        { label: `Sell & redeploy @ ${discountRate}%`, value: existingCalc.redeployReturn, display: m(existingCalc.redeployReturn), color: '#f97316' },
      ] }];
      return base;
    }

    // buyhold + brrrr
    const rentalRows = [
      { title: 'Property & Purchase', rows: [
        ['Purchase Price', m(purchasePrice)], ['Closing Costs', pct(closingCostsPct)],
        ...(strategy === 'brrrr' ? [['Rehab Budget', m(rehab)], ['ARV', m(arv)]] : []),
        ['Appreciation/yr', pct(apprPct)] ] },
      { title: 'Financing', rows: [
        ['Down Payment', pct(downPct)], ['Interest Rate', pct(rate, 2)],
        ['Amortization', `${term} yrs`], ['Interest-Only', `${ioYears} yrs`],
        ['Loan Amount', m(calc.loanAmount)], ['Monthly P&I', m(calc.monthlyPI)],
        ['Total Cash In', m(calc.totalCashIn)] ] },
      { title: 'Income & Expenses', rows: [
        ['Monthly Rent', m(monthlyRent)], ['Vacancy', pct(vacancyPct)],
        ['Operating Expenses', m(calc.operatingExpenses)], ['NOI (annual)', m(calc.noi)] ] },
      { title: 'Key Metrics', rows: [
        ['Cash-on-Cash', pct(calc.cashOnCash)], ['Cap Rate', pct(calc.capRate, 2)],
        ['DSCR', fmt(calc.dscr, { dec: 2 })], ['Debt Yield', pct(calc.debtYield)],
        ['Monthly Cash Flow', m(calc.monthlyCashFlow)], ['Total ROI Yr 1', pct(calc.totalRoi)],
        ['ROE Yr 1', pct(calc.initialEquityReturn)], ['5-yr Total Return', pct(calc.totalEquityReturn5, 0)] ] },
      { title: 'Tax & Projection', rows: [
        ['Annual Depreciation', m(calc.annualDepreciation)], ['Depr. Tax Shield', m(calc.deprTaxShield)],
        ['Value Yr 1 / Yr 5', `${m(calc.projValue1)} / ${m(calc.projValue5)}`],
        ['Equity Yr 1 / Yr 5', `${m(calc.equity1)} / ${m(calc.equity5)}`],
        ['5-yr IRR', calc.projIRR === null ? '—' : pct(calc.projIRR * 100)],
        ['NPV @ ' + discountRate + '%', m(calc.projNPV)] ] },
    ];
    if (strategy === 'brrrr') {
      rentalRows.push({ title: 'BRRRR — Post-Refi', rows: [
        ['Refi Loan (75% ARV)', m(calc.refiLoanAmount)], ['Cash-Out', m(calc.cashOut)],
        ['Cash Left In', m(calc.cashLeftIn)], ['Post-Refi CoC', calc.cashLeftIn <= 0 ? '∞' : pct(calc.brrrCoC)],
        ['Equity in Deal', m(arv - calc.refiLoanAmount)] ] });
    }
    base.sections = rentalRows;
    base.charts = [{ title: 'Annual Cash Flow Waterfall', bars: [
      { label: 'Gross Rent', value: calc.grossAnnualRent, display: m(calc.grossAnnualRent), color: '#10b981' },
      { label: 'Operating Exp.', value: calc.operatingExpenses, display: m(calc.operatingExpenses), color: '#eab308' },
      { label: 'Debt Service', value: calc.annualDebtService, display: m(calc.annualDebtService), color: '#f97316' },
      { label: 'Cash Flow', value: calc.annualCashFlow, display: m(calc.annualCashFlow), color: '#dc2626' },
    ] }];
    return base;
  };

  const exportPDF = () => openPrintReport(buildPayload());
  const exportCSV = () => downloadCSV(buildPayload());

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100" style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system' }}>
      {gateChecked && !accessGranted && (
        <LeadGate onSuccess={() => setAccessGranted(true)} />
      )}

      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">DealLab</h1>
              <p className="text-[10px] text-slate-500 -mt-0.5">Real estate underwriting that doesn't suck</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-400">30-yr fixed:</span>
              <span className="font-bold text-emerald-400">{liveRate}%</span>
              {rateChange !== null && rateChange !== '' && (
                <span className={`text-[11px] font-semibold ${String(rateChange).trim().startsWith('-') ? 'text-emerald-400' : String(rateChange).trim().startsWith('+') ? 'text-red-400' : 'text-slate-500'}`}>
                  {rateChange}
                </span>
              )}
              <span className="text-slate-600">· {rateDate}</span>
              <button onClick={refreshRate} className="ml-1 text-slate-500 hover:text-slate-300">
                <RefreshCw className={`w-3 h-3 ${rateLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-5">
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              { id: 'buyhold', label: 'Buy & Hold', icon: Home },
              { id: 'brrrr', label: 'BRRRR', icon: RefreshCw },
              { id: 'flip', label: 'Fix & Flip', icon: Wrench },
              { id: 'existing', label: 'Analyze Existing', icon: Building2 },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setStrategy(id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition whitespace-nowrap ${
                  strategy === id
                    ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg shadow-orange-500/20'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={exportPDF} title="Export a branded PDF (via your browser's print dialog)"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-orange-500 transition whitespace-nowrap">
              <Printer className="w-4 h-4" /> PDF
            </button>
            <button onClick={exportCSV} title="Export this analysis as a CSV"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-orange-500 transition whitespace-nowrap">
              <FileSpreadsheet className="w-4 h-4" /> CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            {strategy === 'existing' && (
              <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-300 mb-4">
                  <Building2 className="w-4 h-4 text-orange-500" /> Your Existing Property
                </h2>
                <div className="mb-3">
                  <label className="flex items-center text-xs font-medium text-slate-400 mb-1">
                    Property Address <span className="ml-1 text-slate-600">(optional)</span>
                  </label>
                  <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
                    placeholder="123 Main St, Nashville, TN 37201"
                    className="w-full bg-slate-800/60 border border-slate-700 focus:border-orange-500 rounded-lg py-2 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 transition" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <NumInput label="Current Value" value={currentValue} onChange={setCurrentValue} prefix="$"
                    tip="Today's market value — what it would sell for now. Use recent comps or a broker's CMA, not what you paid." />
                  <NumInput label="Loan Balance" value={currentBalance} onChange={setCurrentBalance} prefix="$"
                    tip="Your current outstanding mortgage balance (payoff). 0 if owned free and clear." />
                  <NumInput label="Your Rate" value={currentRate} onChange={setCurrentRate} suffix="%" step={0.125}
                    tip="The interest rate on your existing loan — not today's market rate." />
                  <NumInput label="Years Remaining" value={yearsRemaining} onChange={setYearsRemaining} suffix="yrs"
                    tip="Years left on your amortization. Drives your current payment and principal paydown." />
                  <NumInput label="Interest-Only" value={ioYears} onChange={setIoYears} suffix="yrs" step={0.5}
                    tip="Remaining interest-only period, if any. 0 for a normal amortizing loan." />
                  <NumInput label="Appreciation / yr" value={apprPct} onChange={setApprPct} suffix="%" step={0.5}
                    tip="Expected annual appreciation, compounded. Feeds the return-on-equity calculation." />
                  <NumInput label="Original Basis" value={originalBasis} onChange={setOriginalBasis} prefix="$"
                    tip="Original purchase price plus capital improvements. Used to compute your taxable gain if you sell." />
                  <NumInput label="Deprec. Taken" value={accumDepr} onChange={setAccumDepr} prefix="$"
                    tip="Total depreciation you've already deducted. It is 'recaptured' and taxed (typically up to 25%) when you sell." />
                </div>
              </section>
            )}

            {strategy !== 'existing' && (<>
            <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-300 mb-4">
                <Home className="w-4 h-4 text-orange-500" /> Property & Purchase
              </h2>
              <div className="mb-3">
                <label className="flex items-center text-xs font-medium text-slate-400 mb-1">
                  Property Address <span className="ml-1 text-slate-600">(optional)</span>
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main St, Nashville, TN 37201"
                  className="w-full bg-slate-800/60 border border-slate-700 focus:border-orange-500 rounded-lg py-2 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 transition"
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <NumInput label="Purchase Price" value={purchasePrice} onChange={setPurchasePrice} prefix="$"
                  tip="The negotiated purchase price. For off-market deals, this is what you'd pay. For MLS, the list price or your offer." />
                <NumInput label="Closing Costs" value={closingCostsPct} onChange={setClosingCostsPct} suffix="%"
                  tip="Typically 1–3% of purchase price. Includes title, lender fees, transfer taxes, etc." />
                {strategy !== 'flip' && (
                  <NumInput label="Appreciation / yr" value={apprPct} onChange={setApprPct} suffix="%" step={0.5}
                    tip="Annual home-price appreciation, compounded. 3%/yr is a conservative long-run default. Drives the 1- and 5-year value & equity projections." />
                )}
                {(strategy === 'brrrr' || strategy === 'flip') && (
                  <NumInput label="Rehab Budget" value={rehab} onChange={setRehab} prefix="$"
                    tip="Total renovation cost. Always pad by 10–20% — rehabs go over budget more often than not." />
                )}
                {(strategy === 'brrrr' || strategy === 'flip') && (
                  <NumInput label="ARV" value={arv} onChange={setArv} prefix="$"
                    tip="After Repair Value. Pull 3–5 recent comps within 0.5 miles, similar sq ft, sold in last 3 months. Don't trust Zillow alone." />
                )}
              </div>
            </section>

            <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-300 mb-4">
                <DollarSign className="w-4 h-4 text-orange-500" /> Financing
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <NumInput label="Down Payment" value={downPct} onChange={setDownPct} suffix="%"
                  tip="Investment property minimums: 20–25% conventional, 15% with PMI. DSCR loans usually want 20–25%." />
                <NumInput label="Interest Rate" value={rate} onChange={(v) => { setRate(v); setUseLiveRate(false); }} suffix="%"
                  tip="Live 30-yr rate auto-loaded from Mortgage News Daily. Override with your actual lender quote — investment property rates are typically 0.5–1% higher than owner-occupied." />
                <NumInput label="Amortization" value={term} onChange={setTerm} suffix="yrs"
                  tip="Amortization period. 30-year is standard for rentals; 15-year builds equity faster but kills cash flow." />
                <NumInput label="Interest-Only" value={ioYears} onChange={setIoYears} suffix="yrs" step={0.5}
                  tip="Interest-only period at the start of the loan. During IO the payment is interest only (lower payment, higher cash flow, but no principal paydown). Common on DSCR and commercial loans. 0 = fully amortizing from day one." />
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                    <input type="checkbox" checked={useLiveRate} onChange={(e) => setUseLiveRate(e.target.checked)}
                      className="w-4 h-4 accent-orange-500" />
                    Use live rate ({liveRate}%)
                  </label>
                </div>
              </div>
            </section>
            </>)}

            {strategy !== 'flip' && (
              <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-300">
                    <TrendingUp className="w-4 h-4 text-orange-500" /> Rental Income
                  </h2>
                  <div className="flex gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
                    <button
                      onClick={() => setPropertyType('single')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                        propertyType === 'single' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Single Unit
                    </button>
                    <button
                      onClick={() => setPropertyType('multi')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                        propertyType === 'multi' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Multifamily
                    </button>
                  </div>
                </div>

                {propertyType === 'single' ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <NumInput label="Monthly Rent" value={singleRent} onChange={setSingleRent} prefix="$"
                      tip="GET THIS RIGHT. Don't use Zillow estimates alone. Call 2–3 local property managers, check Rentometer, look at active rentals on Zillow/Apartments.com in 0.5 mile radius. Garbage in = garbage out." />
                    <NumInput label="Other Income (mo)" value={otherIncome} onChange={setOtherIncome} prefix="$"
                      tip="Laundry, parking, pet fees, storage. Usually negligible on SFRs." />
                    <NumInput label="Vacancy" value={vacancyPct} onChange={setVacancyPct} suffix="%"
                      warn={warnings.some(w => w.field === 'vacancy')}
                      tip="Most markets see 5–10% vacancy. Don't go below 5% — even great tenants eventually move out, and turnover takes weeks." />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-xs text-slate-500 mb-2">
                      Add a row for each unit type. For example, a 4-plex with two 1BRs and two 2BRs gets two rows.
                    </div>
                    <div className="space-y-2">
                      <div className="hidden md:grid grid-cols-12 gap-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        <div className="col-span-3">Unit Type</div>
                        <div className="col-span-2"># of Units</div>
                        <div className="col-span-3">Rent / Unit</div>
                        <div className="col-span-3 text-right">Subtotal</div>
                        <div className="col-span-1"></div>
                      </div>
                      {unitTypes.map((u) => (
                        <div key={u.id} className="grid grid-cols-12 gap-2 items-center bg-slate-950/40 border border-slate-800 rounded-lg p-2">
                          <input
                            type="text"
                            value={u.label}
                            onChange={(e) => updateUnitType(u.id, 'label', e.target.value)}
                            placeholder="1BR / Studio / etc."
                            className="col-span-3 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-orange-500"
                          />
                          <input
                            type="number"
                            value={u.count}
                            min="0"
                            onChange={(e) => updateUnitType(u.id, 'count', parseInt(e.target.value) || 0)}
                            className="col-span-2 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-orange-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <div className="col-span-3 flex items-center bg-slate-900 border border-slate-800 rounded overflow-hidden focus-within:border-orange-500">
                            <span className="px-2 text-slate-500 text-sm">$</span>
                            <input
                              type="number"
                              value={u.rent}
                              onChange={(e) => updateUnitType(u.id, 'rent', parseFloat(e.target.value) || 0)}
                              className="w-full bg-transparent py-1.5 text-sm text-slate-100 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                          <div className="col-span-3 text-right text-sm font-semibold text-orange-400">
                            ${((u.count || 0) * (u.rent || 0)).toLocaleString()}/mo
                          </div>
                          <button
                            onClick={() => removeUnitType(u.id)}
                            disabled={unitTypes.length === 1}
                            className="col-span-1 text-slate-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed text-lg leading-none"
                            title="Remove unit type"
                          >×</button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={addUnitType}
                      className="w-full py-2 border border-dashed border-slate-700 hover:border-orange-500 hover:bg-orange-500/5 rounded-lg text-xs text-slate-400 hover:text-orange-400 transition"
                    >
                      + Add unit type
                    </button>

                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-800">
                      <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-2.5">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Total Units</div>
                        <div className="text-lg font-bold text-slate-100 mt-0.5">{totalUnits}</div>
                      </div>
                      <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-2.5">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Gross Rent / mo</div>
                        <div className="text-lg font-bold text-orange-400 mt-0.5">${monthlyRent.toLocaleString()}</div>
                      </div>
                      <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-2.5">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Avg / Unit</div>
                        <div className="text-lg font-bold text-slate-100 mt-0.5">
                          ${totalUnits > 0 ? Math.round(monthlyRent / totalUnits).toLocaleString() : 0}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <NumInput label="Other Income (mo)" value={otherIncome} onChange={setOtherIncome} prefix="$"
                        tip="Laundry, parking, pet fees, storage, vending. Multifamily often has meaningful 'other' income — don't skip this." />
                      <NumInput label="Vacancy" value={vacancyPct} onChange={setVacancyPct} suffix="%"
                        warn={warnings.some(w => w.field === 'vacancy')}
                        tip="Multifamily often runs 5–8% in healthy markets. C-class properties or distressed neighborhoods can run 10%+." />
                    </div>
                  </div>
                )}
              </section>
            )}

            {strategy !== 'flip' && (
              <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-300 mb-4">
                  <Calculator className="w-4 h-4 text-orange-500" /> Operating Expenses
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <NumInput label="Property Tax (yr)" value={propertyTax} onChange={setPropertyTax} prefix="$"
                    tip="Get this from the county assessor or current listing — don't estimate. Reassessments can spike taxes 20–50% after purchase in some states." />
                  <NumInput label="Insurance (yr)" value={insurance} onChange={setInsurance} prefix="$"
                    tip="Landlord policies cost more than homeowner. Get an actual quote — premiums have spiked 20–40% in recent years, especially in FL, TX, CA." />
                  <NumInput label="Utilities (mo)" value={utilities} onChange={setUtilities} prefix="$"
                    tip="Only what owner pays — usually water/sewer/trash on multifamily, $0 on SFR." />
                  <NumInput label="Property Mgmt" value={mgmtPct} onChange={setMgmtPct} suffix="%"
                    warn={warnings.some(w => w.field === 'mgmt')}
                    tip="Typically 8–10% of collected rent + 50–100% of first month's rent for placement. Even if self-managing, model 8% — your time has value." />
                  <NumInput label="Maintenance" value={maintPct} onChange={setMaintPct} suffix="%"
                    warn={warnings.some(w => w.field === 'maint')}
                    tip="Routine repairs (% of rent). 5–8% for newer homes, 10%+ for older. Includes the leaky faucet, the broken disposal, etc." />
                  <NumInput label="CapEx Reserve" value={capexPct} onChange={setCapexPct} suffix="%"
                    warn={warnings.some(w => w.field === 'capex')}
                    tip="Big-ticket items (roof, HVAC, water heater). These WILL happen — fund the reserve now. 5–10% of rent is standard." />
                </div>
              </section>
            )}

            {strategy !== 'flip' && (
              <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-300 mb-4">
                  <Calculator className="w-4 h-4 text-orange-500" /> Tax, Depreciation &amp; Projection
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <NumInput label="Depreciation Rate" value={deprRate} onChange={setDeprRate} suffix="%" step={0.001}
                    tip="Annual depreciation of the building (improvements). Residential rental = 3.636%/yr (27.5-yr straight line). Commercial = 2.564% (39-yr). This is a non-cash deduction that shelters income." />
                  <NumInput label="Building / Basis" value={buildingPct} onChange={setBuildingPct} suffix="%"
                    tip="Share of purchase price that is depreciable improvements (excludes land, which isn't depreciable). 75–85% is typical; use your county assessor's land/improvement split." />
                  <NumInput label="Marginal Tax Rate" value={taxRate} onChange={setTaxRate} suffix="%"
                    tip="Your marginal federal+state income tax rate. Used to value the depreciation tax shield. 22–32% is common for most investors." />
                  <NumInput label="NOI Growth / yr" value={noiGrowth} onChange={setNoiGrowth} suffix="%" step={0.5}
                    tip="Assumed stabilized growth in net operating income per year. Drives the forward cap rate and the 5-year IRR/NPV projection. 2% is conservative." />
                </div>
              </section>
            )}

            {strategy === 'flip' && (
              <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-300 mb-4">
                  <Wrench className="w-4 h-4 text-orange-500" /> Flip Details
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <NumInput label="Holding Period" value={holdingMonths} onChange={setHoldingMonths} suffix="mo"
                    tip="From close to close. Most flips take 4–8 months. Pad your estimate — permits and listings always take longer than expected." />
                  <NumInput label="Selling Costs" value={sellingCostsPct} onChange={setSellingCostsPct} suffix="%"
                    tip="Agent commissions (5–6%) + closing costs (1–2%). Total 6–8% of ARV." />
                  <NumInput label="Property Tax (yr)" value={propertyTax} onChange={setPropertyTax} prefix="$" />
                  <NumInput label="Insurance (yr)" value={insurance} onChange={setInsurance} prefix="$" />
                  <NumInput label="Utilities (mo)" value={utilities} onChange={setUtilities} prefix="$" />
                </div>
              </section>
            )}

            {strategy === 'flip' && (
              <RemodelPlanner
                phases={remodelPhases}
                updatePhase={updatePhase}
                remodel={remodel}
                units={remodelUnits}
                setUnits={setRemodelUnits}
                overrun={remodelOverrun}
                setOverrun={setRemodelOverrun}
                openPhase={openPhase}
                setOpenPhase={setOpenPhase}
                onUseAsRehab={() => setRehab(Math.round(remodel.totalCost))}
              />
            )}

            {strategy !== 'existing' && (
            <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-300 mb-1">
                <Sliders className="w-4 h-4 text-orange-500" /> Stress Test
              </h2>
              <p className="text-xs text-slate-500 mb-4">What if things go wrong? Drag the sliders to see how fragile the deal really is.</p>
              <div className="space-y-4">
                <StressSlider label="Rent drops by" value={stressRent} onChange={setStressRent} max={25} suffix="%" />
                <StressSlider label="Vacancy increases by" value={stressVacancy} onChange={setStressVacancy} max={20} suffix=" pts" />
                <StressSlider label="Refi rate higher by" value={stressRate} onChange={setStressRate} max={4} suffix=" pts" step={0.25} />
                {(stressRent > 0 || stressVacancy > 0 || stressRate > 0) && (
                  <button onClick={() => { setStressRent(0); setStressVacancy(0); setStressRate(0); }}
                    className="text-xs text-orange-400 hover:text-orange-300">Reset stress test</button>
                )}
              </div>

              {strategy !== 'flip' && (
                <div className="mt-5 pt-4 border-t border-slate-800">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                      <BarChart3 className="w-3.5 h-3.5 text-orange-500" /> 5-Year IRR &amp; NPV
                      <Tip text="A stabilized-NOI projection: 5 years of cash flow (NOI growing at your assumed rate, minus debt service) plus a Year-5 sale at the appreciated value net of selling costs. IRR and NPV update live as you move the stress sliders above — that's your sensitivity analysis." />
                    </h3>
                    <div className="w-28">
                      <NumInput label="Discount Rate" value={discountRate} onChange={setDiscountRate} suffix="%" step={0.5}
                        tip="Your required rate of return, used to discount the projected cash flows for NPV. A positive NPV means the deal beats your hurdle rate." />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Stat label="Projected IRR (5yr)" value={calc.projIRR === null ? '—' : fmt(calc.projIRR * 100, { pct: true, dec: 1 })}
                      status={calc.projIRR === null ? 'neutral' : calc.projIRR >= 0.15 ? 'good' : calc.projIRR >= 0.08 ? 'neutral' : 'bad'}
                      tip="Annualized return that sets the NPV of all projected cash flows (including the Year-5 sale) to zero. 12–15%+ is a common target for rentals." />
                    <Stat label={`NPV @ ${discountRate}%`} value={fmt(calc.projNPV, { money: true })}
                      status={calc.projNPV >= 0 ? 'good' : 'bad'}
                      tip="Present value of the projected cash flows (incl. sale) minus your cash invested, discounted at your required return. Positive = the deal clears your hurdle." />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                    Based on a 5-year hold, {noiGrowth}% stabilized NOI growth, {apprPct}% appreciation, and a sale at Year&nbsp;5 net of {sellingCostsPct}% selling costs. Move the sliders above to stress-test these returns.
                  </p>
                </div>
              )}
            </section>
            )}

            {strategy === 'existing' && (
              <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-300 mb-1">
                  <Scale className="w-4 h-4 text-orange-500" /> Hold vs. Sell
                </h2>
                <p className="text-xs text-slate-500 mb-4">If you sold today and paid the taxes, how hard would the freed-up equity have to work to beat simply holding?</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                  <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Keep: Annual Return</div>
                    <div className="text-lg font-bold text-emerald-400 mt-1">{fmt(existingCalc.totalReturnHold, { money: true })}</div>
                    <div className="text-[10px] text-slate-500">{fmt(existingCalc.roe, { pct: true, dec: 1 })} on equity</div>
                  </div>
                  <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Sell: Net Proceeds</div>
                    <div className="text-lg font-bold text-slate-100 mt-1">{fmt(existingCalc.netSaleProceeds, { money: true })}</div>
                    <div className="text-[10px] text-slate-500">after costs &amp; tax</div>
                  </div>
                  <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Redeploy @ {discountRate}%</div>
                    <div className="text-lg font-bold text-slate-100 mt-1">{fmt(existingCalc.redeployReturn, { money: true })}/yr</div>
                    <div className={`text-[10px] ${existingCalc.redeployReturn > existingCalc.totalReturnHold ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {existingCalc.redeployReturn > existingCalc.totalReturnHold ? 'beats holding' : 'holding wins'}
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5 text-xs bg-slate-950/30 border border-slate-800 rounded-lg p-3">
                  <Row label="Sale price (current value)" value={fmt(currentValue, { money: true })} />
                  <Row label="− Selling costs" value={fmt(existingCalc.sellingCosts, { money: true })} />
                  <Row label="− Loan payoff" value={fmt(currentBalance, { money: true })} />
                  <Row label="− Depreciation recapture tax" value={fmt(existingCalc.recaptureTax, { money: true })} />
                  <Row label="− Capital gains tax" value={fmt(existingCalc.capGainsTax, { money: true })} />
                  <div className="border-t border-slate-800 pt-1.5 mt-1.5">
                    <Row label="Net proceeds if sold" value={fmt(existingCalc.netSaleProceeds, { money: true })} bold />
                  </div>
                </div>
              </section>
            )}

            {strategy === 'existing' && (
              <section className="bg-gradient-to-br from-orange-950/30 to-red-950/10 border border-orange-800/40 rounded-2xl p-5">
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-orange-300 mb-1">
                  <ArrowRightLeft className="w-4 h-4" /> 1031 Exchange Scenario
                </h2>
                <p className="text-xs text-slate-500 mb-4">Defer 100% of the tax by rolling your equity into a like-kind replacement property. Enter the replacement price to size the new loan.</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <NumInput label="Replacement Price" value={replacementCost} onChange={setReplacementCost} prefix="$"
                    tip="Purchase price of the replacement property. To fully defer tax, it should be ≥ your sale price and you must reinvest all equity." />
                  <NumInput label="Cap Gains Rate" value={capGainsRate} onChange={setCapGainsRate} suffix="%"
                    tip="Federal long-term capital gains rate — 15% or 20% for most investors." />
                  <NumInput label="Recapture Rate" value={recaptureRate} onChange={setRecaptureRate} suffix="%"
                    tip="Depreciation recapture is taxed at up to 25%." />
                  <NumInput label="State Tax" value={stateTaxRate} onChange={setStateTaxRate} suffix="%"
                    tip="Your state capital-gains rate, if any. Tennessee has no income tax — use 0." />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                  <Stat label="Tax Deferred" value={fmt(existingCalc.taxesDeferred, { money: true })} status="good"
                    tip="Total federal + state tax you avoid paying now by exchanging instead of selling outright." />
                  <Stat label="Equity to Reinvest" value={fmt(existingCalc.equity1031, { money: true })}
                    tip="Sale price minus selling costs minus loan payoff — the full equity that rolls into the replacement, untaxed." />
                  <Stat label="New Loan Needed" value={fmt(existingCalc.newLoan1031, { money: true })}
                    tip="Replacement price minus your reinvested equity." />
                  <Stat label="New LTV" value={fmt(existingCalc.ltv1031, { pct: true, dec: 0 })}
                    status={existingCalc.ltv1031 <= 75 ? 'good' : 'warn'}
                    tip="Loan-to-value on the replacement. ≤75% is comfortably financeable." />
                </div>
                <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">
                  1031 rules are strict: 45 days to identify, 180 days to close, like-kind investment property, equal-or-greater value &amp; debt, and a qualified intermediary must hold the funds. This is an estimate — confirm with a CPA and QI.
                </p>
              </section>
            )}

            {warnings.length > 0 && (
              <section className="bg-amber-950/30 border border-amber-800/50 rounded-2xl p-5">
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-400 mb-3">
                  <AlertTriangle className="w-4 h-4" /> Input Sanity Check ({warnings.length})
                </h2>
                <ul className="space-y-2">
                  {warnings.map((w, i) => (
                    <li key={i} className="flex gap-2 text-xs text-amber-200/90 leading-relaxed">
                      <span className="text-amber-500 mt-0.5">•</span>
                      <span>{w.msg}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {warnings.length === 0 && (
              <section className="bg-emerald-950/30 border border-emerald-800/50 rounded-2xl p-4">
                <div className="flex items-start gap-2 text-sm text-emerald-300 leading-relaxed">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Inputs look reasonable. Garbage in = garbage out — verify rents and expenses with actual local data.{' '}
                    <span className="text-emerald-200/90">ProTip: call a{' '}
                      <a href="https://www.nashvilleinvestoragent.com/ready-to-buy" target="_blank" rel="noopener noreferrer"
                        className="text-orange-400 hover:text-orange-300 underline font-semibold">great local Broker</a>{' '}
                      to help you verify what market rents actually are.
                    </span>
                  </span>
                </div>
              </section>
            )}
          </div>

          <div className="space-y-5">
            <HeatGauge score={heat.score} label={heat.label} verdict={heat.verdict} why={heat.why}
              labels={HEAT_LABELS[strategy] || HEAT_LABELS.buyhold} />

            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                <BarChart3 className="w-3.5 h-3.5 text-orange-500" /> Key Metrics
              </h3>
              {strategy === 'existing' ? (
                <div className="grid grid-cols-2 gap-2.5">
                  <Stat label="Return on Equity" value={fmt(existingCalc.roe, { pct: true, dec: 1 })}
                    status={existingCalc.roe >= 10 ? 'good' : existingCalc.roe >= 6 ? 'neutral' : 'warn'}
                    tip="Total annual return (cash flow + principal + appreciation + tax shield) ÷ your current equity. The key hold-vs-sell number: low ROE means lazy equity." />
                  <Stat label="Cash-on-Equity" value={fmt(existingCalc.cashOnEquity, { pct: true, dec: 1 })}
                    status={existingCalc.cashOnEquity >= 6 ? 'good' : existingCalc.cashOnEquity >= 3 ? 'neutral' : 'warn'}
                    tip="Just the cash flow ÷ current equity — the cash yield your trapped equity is actually earning." />
                  <Stat label="Monthly Cash Flow" value={fmt(existingCalc.cashFlow / 12, { money: true })}
                    status={existingCalc.cashFlow / 12 >= 200 ? 'good' : existingCalc.cashFlow >= 0 ? 'neutral' : 'bad'}
                    tip="Cash in your pocket each month after all expenses, reserves, and your current mortgage." />
                  <Stat label="Current Equity" value={fmt(existingCalc.equity, { money: true })}
                    tip="Current value minus loan balance — the capital tied up in this property today." />
                  <Stat label="Cap Rate" value={fmt(existingCalc.capRate, { pct: true, dec: 2 })}
                    status={existingCalc.capRate >= 6 ? 'good' : existingCalc.capRate >= 4.5 ? 'neutral' : 'warn'}
                    tip="NOI ÷ current value. The unlevered yield at today's price." />
                  <Stat label="Debt Yield" value={fmt(existingCalc.debtYield, { pct: true, dec: 1 })}
                    status={existingCalc.debtYield >= 10 ? 'good' : existingCalc.debtYield >= 8 ? 'neutral' : 'warn'}
                    tip="NOI ÷ current loan balance — a clean leverage/risk gauge." />
                  <Stat label="DSCR" value={fmt(existingCalc.dscr, { dec: 2 })}
                    status={existingCalc.dscr >= 1.25 ? 'good' : existingCalc.dscr >= 1.0 ? 'warn' : 'bad'}
                    tip="NOI ÷ debt service on your current loan. Below 1.0 means it can't cover its mortgage." />
                  <Stat label="NOI (annual)" value={fmt(existingCalc.noi, { money: true })}
                    tip="Net operating income — gross income minus operating expenses, before debt service." />
                </div>
              ) : strategy !== 'flip' ? (
                <div className="grid grid-cols-2 gap-2.5">
                  <Stat label="Cash-on-Cash" value={fmt(calc.cashOnCash, { pct: true, dec: 1 })}
                    status={calc.cashOnCash >= 8 ? 'good' : calc.cashOnCash >= 6 ? 'neutral' : calc.cashOnCash >= 4 ? 'warn' : 'bad'}
                    tip="Annual cash flow divided by total cash invested. Our baseline floor is 6%. Below 4% is weak, above 10% is excellent." />
                  <Stat label="Cap Rate" value={fmt(calc.capRate, { pct: true, dec: 2 })}
                    status={calc.capRate >= 7 ? 'good' : calc.capRate >= 5 ? 'neutral' : 'warn'}
                    tip="NOI ÷ purchase price. Used to compare properties independent of financing. Typical range 4–10% depending on market." />
                  <Stat label="DSCR" value={fmt(calc.dscr, { dec: 2 })}
                    status={calc.dscr >= 1.25 ? 'good' : calc.dscr >= 1.0 ? 'warn' : 'bad'}
                    tip="NOI ÷ debt service. Lenders typically want 1.25+. Below 1.0 means the property can't cover its mortgage." />
                  <Stat label="Monthly Cash Flow" value={fmt(calc.monthlyCashFlow, { money: true })}
                    status={calc.monthlyCashFlow >= 200 ? 'good' : calc.monthlyCashFlow >= 0 ? 'neutral' : 'bad'}
                    tip="What hits your bank account each month after ALL expenses including reserves." />
                  <Stat label="NOI (annual)" value={fmt(calc.noi, { money: true })}
                    tip="Net Operating Income. Gross income minus operating expenses, before debt service." />
                  <Stat label="Total ROI Yr 1" value={fmt(calc.totalRoi, { pct: true, dec: 1 })}
                    sub={`incl. paydown + ${apprPct}% apprec.`}
                    tip="Cash flow + principal paydown + appreciation, divided by cash invested. Captures real wealth-building." />
                  <Stat label="Debt Yield" value={fmt(calc.debtYield, { pct: true, dec: 1 })}
                    status={calc.debtYield >= 10 ? 'good' : calc.debtYield >= 8 ? 'neutral' : 'warn'}
                    tip="NOI ÷ loan amount. A lender's purest risk measure — independent of rate or amortization. Most want 9–10%+. Below 8% is aggressive leverage." />
                  <Stat label="Cap Rate (Yr 2)" value={fmt(calc.capRateYr2, { pct: true, dec: 2 })}
                    sub="yield on cost"
                    tip="Forward cap rate: NOI grown at your stabilized growth rate for 2 years, divided by your purchase price. Shows the income-yield trend on your original basis." />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  <Stat label="Projected Profit" value={fmt(calc.flipProfit, { money: true })}
                    status={calc.flipProfit >= 30000 ? 'good' : calc.flipProfit >= 15000 ? 'warn' : 'bad'}
                    tip="ARV minus purchase, rehab, closing, holding, and selling costs." />
                  <Stat label="ROI" value={fmt(calc.flipRoi, { pct: true, dec: 1 })}
                    status={calc.flipRoi >= 25 ? 'good' : calc.flipRoi >= 15 ? 'warn' : 'bad'}
                    tip="Profit divided by total cash in. Most flippers target 20%+ to justify the risk." />
                  <Stat label="MAO (70% Rule)" value={fmt(calc.mao, { money: true })}
                    tip="Maximum Allowable Offer = (ARV × 70%) − Rehab. The classic rule of thumb for flips. Adjust to 75% in hot markets, 65% in slow ones." />
                  <Stat label="Holding Costs" value={fmt(calc.holdingCosts, { money: true })}
                    tip="Carrying costs (mortgage, tax, insurance, utilities) during the rehab/sale period." />
                </div>
              )}
            </div>

            {strategy !== 'flip' && strategy !== 'existing' && (
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4">
                <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  <Calculator className="w-3.5 h-3.5 text-orange-500" /> Returns &amp; Tax
                </h3>
                <div className="grid grid-cols-2 gap-2.5">
                  <Stat label="ROE — Year 1" value={fmt(calc.initialEquityReturn, { pct: true, dec: 1 })}
                    status={calc.initialEquityReturn >= 12 ? 'good' : calc.initialEquityReturn >= 7 ? 'neutral' : 'warn'}
                    tip="Initial return on equity: Year-1 cash flow + principal paydown + appreciation + depreciation tax shield, divided by your cash invested." />
                  <Stat label="Total Return — 5yr" value={fmt(calc.totalEquityReturn5, { pct: true, dec: 0 })}
                    sub="cumulative on equity"
                    tip="Cumulative 5-year return on initial equity: total cash flow + principal paid down + appreciation + tax shield over 5 years, divided by cash invested." />
                  <Stat label="Annual Depreciation" value={fmt(calc.annualDepreciation, { money: true })}
                    tip="Non-cash deduction = depreciable basis (building %) × purchase price × depreciation rate. Shelters rental income from tax." />
                  <Stat label="Depr. Tax Shield" value={fmt(calc.deprTaxShield, { money: true })}
                    status="good"
                    tip="Annual tax saved from depreciation = annual depreciation × your marginal tax rate. Real money back in your pocket." />
                </div>
              </div>
            )}

            {strategy === 'brrrr' && (
              <div className="bg-gradient-to-br from-orange-950/40 to-red-950/20 border border-orange-800/40 rounded-2xl p-4">
                <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-orange-300 mb-3">
                  <RefreshCw className="w-3.5 h-3.5" /> Post-Refi (75% LTV on ARV)
                </h3>
                <div className="grid grid-cols-2 gap-2.5">
                  <Stat label="Refi Loan" value={fmt(calc.refiLoanAmount, { money: true })} />
                  <Stat label="Cash-Out" value={fmt(calc.cashOut, { money: true })}
                    status={calc.cashOut >= calc.totalCashIn ? 'good' : 'neutral'}
                    tip="Pulled out at refi. If this exceeds your total cash in, it's an 'infinite return' BRRRR — the holy grail." />
                  <Stat label="Cash Left In" value={fmt(calc.cashLeftIn, { money: true })}
                    status={calc.cashLeftIn <= 0 ? 'good' : calc.cashLeftIn < 20000 ? 'neutral' : 'warn'} />
                  <Stat label="Post-Refi CoC" value={calc.cashLeftIn <= 0 ? '∞' : fmt(calc.brrrCoC, { pct: true, dec: 1 })}
                    status="good"
                    tip="Cash-on-cash after refinancing. If you pull all your cash out, return is effectively infinite." />
                  <Stat label="Equity in Deal" value={fmt(arv - calc.refiLoanAmount, { money: true })}
                    status={(arv - calc.refiLoanAmount) >= arv * 0.2 ? 'good' : 'warn'}
                    tip="Your equity after the refinance = ARV − refi loan balance. At 75% LTV you keep ~25% of ARV as equity even after pulling cash out." />
                  <Stat label="Equity %" value={fmt(arv > 0 ? ((arv - calc.refiLoanAmount) / arv) * 100 : 0, { pct: true, dec: 0 })}
                    sub="of ARV"
                    tip="Equity as a share of after-repair value. Lenders cap cash-out refis at ~75% LTV, leaving you ~25% equity." />
                </div>
              </div>
            )}

            {strategy !== 'existing' && (
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Cash to Close</h3>
              <div className="space-y-1.5 text-xs">
                <Row label="Down Payment" value={fmt(calc.downPayment, { money: true })} />
                <Row label="Closing Costs" value={fmt(calc.closingCosts, { money: true })} />
                {rehab > 0 && <Row label="Rehab" value={fmt(rehab, { money: true })} />}
                <div className="border-t border-slate-800 pt-1.5 mt-1.5">
                  <Row label="Total Cash In" value={fmt(calc.totalCashIn, { money: true })} bold />
                </div>
                <div className="pt-2">
                  <Row label="Loan Amount" value={fmt(calc.loanAmount, { money: true })} />
                  <Row label="Monthly P&I" value={fmt(calc.monthlyPI, { money: true })} />
                </div>
              </div>
            </div>
            )}

            {strategy !== 'flip' && strategy !== 'existing' && (
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4">
                <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  <TrendingUp className="w-3.5 h-3.5 text-orange-500" /> Appreciation & Equity ({apprPct}%/yr)
                </h3>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Today</div>
                    <div className="text-sm font-bold text-slate-100 mt-1">{fmt(purchasePrice, { money: true })}</div>
                    <div className="text-[11px] text-emerald-400 mt-0.5">{fmt(calc.equityNow, { money: true })} eq.</div>
                  </div>
                  <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Year 1</div>
                    <div className="text-sm font-bold text-slate-100 mt-1">{fmt(calc.projValue1, { money: true })}</div>
                    <div className="text-[11px] text-emerald-400 mt-0.5">{fmt(calc.equity1, { money: true })} eq.</div>
                  </div>
                  <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Year 5</div>
                    <div className="text-sm font-bold text-slate-100 mt-1">{fmt(calc.projValue5, { money: true })}</div>
                    <div className="text-[11px] text-emerald-400 mt-0.5">{fmt(calc.equity5, { money: true })} eq.</div>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                  Projected market value &amp; your equity (value − loan balance), assuming {apprPct}% compounded appreciation and scheduled principal paydown.
                </p>
              </div>
            )}
          </div>
        </div>

        <footer className="mt-8 pt-5 border-t border-slate-800 text-center text-xs text-slate-600">
          DealLab is a tool, not a crystal ball. Real estate involves risk — verify every number with local professionals before buying.
          Live rate from <a href="https://www.mortgagenewsdaily.com/mortgage-rates/mnd" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400">Mortgage News Daily</a>.
        </footer>
      </main>
    </div>
  );
}

const Row = ({ label, value, bold }) => (
  <div className={`flex justify-between ${bold ? 'text-slate-100 font-semibold' : 'text-slate-400'}`}>
    <span>{label}</span>
    <span className={bold ? 'text-orange-400' : 'text-slate-200'}>{value}</span>
  </div>
);

// ============ REMODEL PLANNER (Fix & Flip) ============
const RemodelPlanner = ({ phases, updatePhase, remodel, units, setUnits, overrun, setOverrun, openPhase, setOpenPhase, onUseAsRehab }) => {
  // Build a simple sequential timeline. Parallel phases overlap the prior phase.
  let cursor = 0;
  const timeline = phases.map((p) => {
    const w = Number(p.weeks) || 0;
    if (p.parallel) {
      // Overlap: start near the end of the prior phase, don't advance the critical cursor.
      const start = Math.max(0, cursor - w);
      return { ...p, start, end: start + w };
    }
    const seg = { ...p, start: cursor, end: cursor + w };
    cursor += w;
    return seg;
  });
  const totalWeeks = remodel.criticalWeeks;
  const scale = totalWeeks > 0 ? 100 / totalWeeks : 0;

  return (
    <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-300">
          <Wrench className="w-4 h-4 text-orange-500" /> Remodel Planner
        </h2>
        <button onClick={onUseAsRehab}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-orange-500/15 text-orange-300 hover:bg-orange-500/25 transition">
          Use total as Rehab Budget →
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-4">Recommended build sequence for a full renovation. Edit any duration or cost and everything recalculates. Tap a phase for its subcontractor checklist.</p>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
        <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center"><Clock className="w-3 h-3 mr-1" />Timeline</div>
          <div className="text-lg font-bold text-slate-100 mt-1">{totalWeeks.toFixed(1)} wks</div>
          <div className="text-[10px] text-slate-500">critical path</div>
        </div>
        <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Cost Range</div>
          <div className="text-sm font-bold text-orange-400 mt-1">${Math.round(remodel.lowCost).toLocaleString()}–{Math.round(remodel.highCost).toLocaleString()}</div>
          <div className="text-[10px] text-slate-500">+{overrun}% contingency</div>
        </div>
        <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Per Unit</div>
          <div className="text-lg font-bold text-slate-100 mt-1">${Math.round(remodel.perUnit).toLocaleString()}</div>
          <div className="text-[10px] text-slate-500">{units} unit{units === 1 ? '' : 's'}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumInput label="# Units" value={units} onChange={setUnits} step={1} />
          <NumInput label="Overrun" value={overrun} onChange={setOverrun} suffix="%" step={5} />
        </div>
      </div>

      {/* Gantt-style timeline */}
      <div className="mb-4 space-y-1.5">
        {timeline.map((p) => (
          <div key={p.id} className="flex items-center gap-2">
            <div className="w-28 md:w-36 text-[11px] text-slate-400 truncate flex items-center gap-1">
              {!p.parallel && <span className="w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" title="On critical path" />}
              {p.parallel && <span className="w-1.5 h-1.5 rounded-full bg-slate-600 flex-shrink-0" title="Parallel / off critical path" />}
              {p.name}
            </div>
            <div className="flex-1 h-4 bg-slate-950/60 rounded relative overflow-hidden">
              <div
                className={`absolute top-0 h-full rounded ${p.parallel ? 'bg-slate-600/70' : 'bg-gradient-to-r from-orange-500 to-red-600'}`}
                style={{ left: `${p.start * scale}%`, width: `${Math.max(2, (p.end - p.start) * scale)}%` }}
                title={`${p.name}: weeks ${p.start.toFixed(1)}–${p.end.toFixed(1)}`}
              />
            </div>
            <div className="w-10 text-right text-[11px] text-slate-500">{(Number(p.weeks) || 0)}w</div>
          </div>
        ))}
        <div className="flex items-center gap-3 text-[10px] text-slate-500 pt-1">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" /> critical path</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-600" /> parallel (overlaps)</span>
        </div>
      </div>

      {/* Editable phase rows + checklists */}
      <div className="space-y-2">
        <div className="hidden md:grid grid-cols-12 gap-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          <div className="col-span-5">Phase</div>
          <div className="col-span-2">Weeks</div>
          <div className="col-span-4">Cost</div>
          <div className="col-span-1"></div>
        </div>
        {phases.map((p) => (
          <div key={p.id} className="bg-slate-950/40 border border-slate-800 rounded-lg">
            <div className="grid grid-cols-12 gap-2 items-center p-2">
              <button
                onClick={() => setOpenPhase(openPhase === p.id ? null : p.id)}
                className="col-span-5 flex items-center gap-1.5 text-left text-sm text-slate-200 hover:text-orange-300 transition"
              >
                {openPhase === p.id ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />}
                <span className="truncate">{p.name}</span>
              </button>
              <input
                type="number" min="0" step="0.5" value={p.weeks}
                onChange={(e) => updatePhase(p.id, 'weeks', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                className="col-span-2 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-orange-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <div className="col-span-4 flex items-center bg-slate-900 border border-slate-800 rounded overflow-hidden focus-within:border-orange-500">
                <span className="px-2 text-slate-500 text-sm">$</span>
                <input
                  type="number" min="0" step="100" value={p.cost}
                  onChange={(e) => updatePhase(p.id, 'cost', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                  className="w-full bg-transparent py-1.5 text-sm text-slate-100 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <div className="col-span-1 text-right text-[10px] text-slate-500">{p.parallel ? '∥' : '→'}</div>
            </div>
            {openPhase === p.id && (
              <div className="px-3 pb-3 pt-1 border-t border-slate-800/60">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5 mt-1">
                  <ListChecks className="w-3 h-3" /> Subcontractor checklist
                </div>
                <ul className="space-y-1">
                  {p.checklist.map((item, i) => (
                    <li key={i} className="flex gap-2 text-xs text-slate-300 leading-relaxed">
                      <span className="text-orange-500 mt-0.5">☐</span><span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

const StressSlider = ({ label, value, onChange, max, suffix, step = 1 }) => (
  <div>
    <div className="flex justify-between text-xs mb-1.5">
      <span className="text-slate-400">{label}</span>
      <span className="text-orange-400 font-semibold">{value}{suffix}</span>
    </div>
    <input
      type="range"
      min="0"
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full accent-orange-500"
    />
  </div>
);