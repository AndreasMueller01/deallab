import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Flame, Home, Wrench, TrendingUp, AlertTriangle, CheckCircle2, Info, RefreshCw, DollarSign, Calculator, BarChart3, Sliders, Lock, User, Mail, Phone, ShieldCheck } from 'lucide-react';

const JOTFORM_ID = '261466092010044';
const STORAGE_KEY = 'deallab_access_granted_v1';

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
const HeatGauge = ({ score, label, verdict, why }) => {
  const angle = (score / 100) * 180 - 90;
  const cx = 150, cy = 150, r = 110;

  const segments = [
    { from: 0, to: 20, color: '#3b82f6', label: 'COLD' },
    { from: 20, to: 40, color: '#10b981', label: 'COOL' },
    { from: 40, to: 60, color: '#eab308', label: 'WARM' },
    { from: 60, to: 80, color: '#f97316', label: 'HOT' },
    { from: 80, to: 100, color: '#dc2626', label: 'ON FIRE' },
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Track when the lead gate first mounted — used for Jotform's `timeToSubmit`
  // anti-bot heuristic (must be > 0 for the notification renderer to populate
  // field values; otherwise the submission is silently treated as low-trust).
  const mountTimeRef = useRef(Date.now());

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
    setSubmitting(true);

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

      // Create the hidden iframe that will receive the submission response
      const iframeName = `jf_target_${Date.now()}`;
      const iframe = document.createElement('iframe');
      iframe.name = iframeName;
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      // Create the hidden form
      const form = document.createElement('form');
      form.action = `https://submit.jotform.com/submit/${JOTFORM_ID}`;
      form.method = 'POST';
      form.target = iframeName;
      form.style.display = 'none';
      form.acceptCharset = 'utf-8';

      // Field names must use Jotform's CANONICAL double-prefix form
      // (`q{qid}_{uniqueName}[sublabel]`). Posting with the single-prefix form
      // still stores data in the submissions table, but Jotform's notification
      // renderer can't read it back — emails arrive with blank values.
      // See: the hosted form at form.jotform.com/{formID} posts these exact keys.
      const buildDate = mountTimeRef.current;
      const submitTs = Date.now();
      const timeToSubmitSeconds = Math.max(1, Math.round((submitTs - mountTimeRef.current) / 1000));
      const randToken = Math.random().toString(36).slice(2, 9); // 7-char a-z0-9
      const formOpenId = String(submitTs) + String(Math.floor(Math.random() * 1e7)).padStart(7, '0').slice(0, 4);
      const fields = {
        // Data fields (canonical double-prefix)
        'q2_q2_fullname0[first]': firstName,
        'q2_q2_fullname0[last]': lastName,
        'q3_q3_email1': email,
        'q4_q4_phone2[full]': phone,
        // Honeypot — must be empty
        website: '',
        // Core meta
        formID: JOTFORM_ID,
        simple_spc: `${JOTFORM_ID}-${JOTFORM_ID}`,
        // Trust-signal hidden fields — required for Jotform's notification
        // renderer to populate field values. The hosted form posts all of these.
        submitSource: 'mounted',
        buildDate: String(buildDate),
        submitDate: 'undefined',
        eventObserver: '1',
        timeToSubmit: String(timeToSubmitSeconds),
        uploadServerUrl: 'https://upload.jotform.com/upload',
        formOpenId_V5: formOpenId,
        event_id: `${submitTs}_${JOTFORM_ID}_${randToken}`,
        jsExecutionTracker: `build-date-${buildDate}=>init`,
      };

      Object.entries(fields).forEach(([key, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();

      // Clean up after a short delay (give the browser time to post)
      setTimeout(() => {
        try {
          document.body.removeChild(form);
          document.body.removeChild(iframe);
        } catch (e) { /* already removed */ }
      }, 3000);

      // Persist access locally so user isn't re-prompted on this device.
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          name, email, phone, ts: Date.now()
        }));
      } catch (e) { /* localStorage may be unavailable */ }

      // Small delay so the user sees the loading state briefly
      setTimeout(() => {
        setSubmitting(false);
        onSuccess({ name, email, phone });
      }, 800);
    } catch (e) {
      setSubmitting(false);
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

  // Live rate
  const [liveRate, setLiveRate] = useState(6.57);
  const [rateDate, setRateDate] = useState('5/13/26');
  const [rateLoading, setRateLoading] = useState(false);

  // Property
  const [purchasePrice, setPurchasePrice] = useState(400000);
  const [closingCostsPct, setClosingCostsPct] = useState(1);
  const [rehab, setRehab] = useState(0);
  const [arv, setArv] = useState(480000);

  // Financing
  const [downPct, setDownPct] = useState(25);
  const [rate, setRate] = useState(6.57);
  const [useLiveRate, setUseLiveRate] = useState(true);
  const [term, setTerm] = useState(30);

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
  const [hoa, setHoa] = useState(0);
  const [mgmtPct, setMgmtPct] = useState(8);
  const [maintPct, setMaintPct] = useState(8);
  const [capexPct, setCapexPct] = useState(7);
  const [utilities, setUtilities] = useState(0);

  // Flip-specific
  const [holdingMonths, setHoldingMonths] = useState(6);
  const [sellingCostsPct, setSellingCostsPct] = useState(7);

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
    const operatingExpenses = propertyTax + insurance + hoa * 12 + utilities * 12 + mgmt + maint + capex;

    const noi = effectiveGrossIncome - operatingExpenses;

    const downPayment = purchasePrice * (downPct / 100);
    const closingCosts = purchasePrice * (closingCostsPct / 100);
    const loanAmount = purchasePrice - downPayment;
    const monthlyPI = loanAmount > 0 ? pmt(effRate, term * 12, loanAmount) : 0;
    const annualDebtService = monthlyPI * 12;

    const annualCashFlow = noi - annualDebtService;
    const monthlyCashFlow = annualCashFlow / 12;

    const totalCashIn = downPayment + closingCosts + rehab;

    const capRate = (noi / purchasePrice) * 100;
    const cashOnCash = totalCashIn > 0 ? (annualCashFlow / totalCashIn) * 100 : 0;
    const dscr = annualDebtService > 0 ? noi / annualDebtService : null;
    const grm = grossAnnualRent > 0 ? purchasePrice / grossAnnualRent : 0;

    const yr1Principal = annualDebtService - loanAmount * (effRate / 100);
    const yr1Appreciation = purchasePrice * 0.03;
    const totalRoi = totalCashIn > 0 ? ((annualCashFlow + yr1Principal + yr1Appreciation) / totalCashIn) * 100 : 0;

    const mao = arv * 0.7 - rehab;
    const sellingCosts = arv * (sellingCostsPct / 100);
    const holdingCosts = (propertyTax / 12 + insurance / 12 + hoa + utilities + monthlyPI) * holdingMonths;
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
    };
  }, [purchasePrice, closingCostsPct, rehab, arv, downPct, rate, term, monthlyRent, otherIncome,
      vacancyPct, propertyTax, insurance, hoa, mgmtPct, maintPct, capexPct, utilities,
      holdingMonths, sellingCostsPct, stressRent, stressVacancy, stressRate]);

  // ============ HEAT SCORE ============
  const heat = useMemo(() => {
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
      if (score < 20) { label = 'COLD'; verdict = 'Walk away'; why = `Projected loss of ${fmt(Math.abs(profit), { money: true })}. The numbers don't work.`; }
      else if (score < 40) { label = 'COOL'; verdict = 'Weak flip'; why = `${fmt(roi, { pct: true, dec: 1 })} ROI is too thin for the risk of a flip. Push the price down.`; }
      else if (score < 60) { label = 'WARM'; verdict = 'Marginal'; why = `${fmt(roi, { pct: true, dec: 1 })} ROI is okay but leaves little margin for surprises. Pad your rehab budget.`; }
      else if (score < 80) { label = 'HOT'; verdict = 'Solid flip'; why = `${fmt(profit, { money: true })} projected profit at ${fmt(roi, { pct: true, dec: 1 })} ROI. Verify ARV with strong comps.`; }
      else { label = 'ON FIRE'; verdict = 'Move fast'; why = `Excellent margin: ${fmt(profit, { money: true })} profit, ${fmt(roi, { pct: true, dec: 1 })} ROI. Confirm comps and lock it up.`; }
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
    if (score < 20) { label = 'COLD'; verdict = 'Walk away'; why = `Negative cash flow of ${fmt(Math.abs(cf), { money: true })}/mo. This deal bleeds money — don't buy it to feed it.`; }
    else if (score < 40) { label = 'COOL'; verdict = 'Weak deal'; why = `${fmt(coc, { pct: true, dec: 1 })} cash-on-cash is below the 6% floor. Negotiate the price down or find a better property.`; }
    else if (score < 60) { label = 'WARM'; verdict = 'Marginal'; why = `${fmt(coc, { pct: true, dec: 1 })} cash-on-cash is in the 4–6% gray zone. Acceptable if you believe in appreciation, but stress-test it.`; }
    else if (score < 80) { label = 'HOT'; verdict = 'Solid deal'; why = `${fmt(coc, { pct: true, dec: 1 })} cash-on-cash with DSCR of ${fmt(dscr, { dec: 2 })}. This pencils — verify your rent and expense assumptions.`; }
    else { label = 'ON FIRE'; verdict = 'Pounce'; why = `${fmt(coc, { pct: true, dec: 1 })} cash-on-cash and DSCR of ${fmt(dscr, { dec: 2 })}. Excellent numbers — lock it up before someone else does.`; }
    return { score, label, verdict, why };
  }, [calc, strategy]);

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

  const refreshRate = () => {
    setRateLoading(true);
    setTimeout(() => {
      setLiveRate(6.57);
      setRateDate('5/13/26');
      setRateLoading(false);
    }, 800);
  };

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
              <span className="text-slate-600">· {rateDate}</span>
              <button onClick={refreshRate} className="ml-1 text-slate-500 hover:text-slate-300">
                <RefreshCw className={`w-3 h-3 ${rateLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-5">
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {[
            { id: 'buyhold', label: 'Buy & Hold', icon: Home },
            { id: 'brrrr', label: 'BRRRR', icon: RefreshCw },
            { id: 'flip', label: 'Fix & Flip', icon: Wrench },
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-300 mb-4">
                <Home className="w-4 h-4 text-orange-500" /> Property & Purchase
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <NumInput label="Purchase Price" value={purchasePrice} onChange={setPurchasePrice} prefix="$"
                  tip="The negotiated purchase price. For off-market deals, this is what you'd pay. For MLS, the list price or your offer." />
                <NumInput label="Closing Costs" value={closingCostsPct} onChange={setClosingCostsPct} suffix="%"
                  tip="Typically 2–4% of purchase price. Includes title, lender fees, transfer taxes, etc." />
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
                <NumInput label="Term" value={term} onChange={setTerm} suffix="yrs"
                  tip="30-year fixed is standard for rentals. 15-year builds equity faster but kills cash flow." />
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                    <input type="checkbox" checked={useLiveRate} onChange={(e) => setUseLiveRate(e.target.checked)}
                      className="w-4 h-4 accent-orange-500" />
                    Use live rate ({liveRate}%)
                  </label>
                </div>
              </div>
            </section>

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
                  <NumInput label="HOA (mo)" value={hoa} onChange={setHoa} prefix="$"
                    tip="Some HOAs restrict rentals — verify before buying. Special assessments can wreck cash flow." />
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
            </section>

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
                <div className="flex items-center gap-2 text-sm text-emerald-300">
                  <CheckCircle2 className="w-4 h-4" />
                  Inputs look reasonable. Garbage in = garbage out — verify rents and expenses with actual local data.
                </div>
              </section>
            )}
          </div>

          <div className="space-y-5">
            <HeatGauge score={heat.score} label={heat.label} verdict={heat.verdict} why={heat.why} />

            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                <BarChart3 className="w-3.5 h-3.5 text-orange-500" /> Key Metrics
              </h3>
              {strategy !== 'flip' ? (
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
                    sub="incl. paydown + 3% apprec."
                    tip="Cash flow + principal paydown + assumed 3% appreciation, divided by cash invested. Captures real wealth-building." />
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
                </div>
              </div>
            )}

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