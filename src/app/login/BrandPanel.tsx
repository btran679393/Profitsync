"use client";

import { useEffect, useState, type CSSProperties } from "react";

// ------------------------------------------------------------
// Illustrative numbers for the preview card (kept consistent:
// 8,450 − 1,162 fees − 3,870 costs − 683 shipping = 2,735 profit)
// ------------------------------------------------------------
const REVENUE = 8450;
const PROFIT = 2735;
const BREAKDOWN = [
  { label: "Product costs", value: 3870, color: "bg-slate-400/70" },
  { label: "eBay fees", value: 1162, color: "bg-amber-400/80" },
  { label: "Shipping", value: 683, color: "bg-sky-400/70" },
  { label: "Profit", value: 2735, color: "bg-emerald-400" },
];

const TOASTS = [
  { icon: "sale", title: "New sale synced", detail: "Vintage Nikon 50mm lens", amount: "+$142.00", tone: "text-emerald-300" },
  { icon: "fee", title: "eBay fees calculated", detail: "Final value + ad fee", amount: "−$18.40", tone: "text-amber-300" },
  { icon: "sale", title: "New sale synced", detail: "Pokémon booster box", amount: "+$219.99", tone: "text-emerald-300" },
  { icon: "refund", title: "Refund tracked", detail: "Return shipping counted", amount: "−$12.75", tone: "text-rose-300" },
] as const;

// Smooth line through the points (Catmull-Rom → cubic Bézier).
const W = 420;
const H = 150;
const SERIES = [14, 22, 19, 31, 27, 40, 36, 49, 45, 58, 61, 74, 70, 86];
const POINTS = SERIES.map((v, i) => [
  (i / (SERIES.length - 1)) * W,
  H - 12 - (v / 100) * (H - 24),
]);

function smoothPath(points: number[][]) {
  let d = `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

const LINE = smoothPath(POINTS);
const AREA = `${LINE} L ${W} ${H} L 0 ${H} Z`;
const LAST = POINTS[POINTS.length - 1];

function useCountUp(target: number, delay = 700, duration = 1700) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now() + (reduce ? 0 : delay);
    const length = reduce ? 1 : duration;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / length));
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, delay, duration]);
  return value;
}

const money = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;

function delay(ms: number): CSSProperties {
  return { animationDelay: `${ms}ms` };
}

function ToastIcon({ kind }: { kind: (typeof TOASTS)[number]["icon"] }) {
  const styles = {
    sale: "bg-emerald-400/15 text-emerald-300",
    fee: "bg-amber-400/15 text-amber-300",
    refund: "bg-rose-400/15 text-rose-300",
  }[kind];
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${styles}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {kind === "sale" && <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></>}
        {kind === "fee" && <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>}
        {kind === "refund" && <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>}
      </svg>
    </span>
  );
}

function LiveToasts() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setIndex((i) => (i + 1) % TOASTS.length), 3600);
    return () => window.clearInterval(id);
  }, []);
  const toast = TOASTS[index];
  return (
    <div className="ps-fade-in absolute -right-4 -top-7 z-20 xl:-right-10" style={delay(1600)} aria-hidden="true">
      <div key={index} className="ps-toast flex w-64 items-center gap-3 rounded-2xl border border-white/10 bg-[#0f1d33]/90 p-3 shadow-2xl shadow-black/40 backdrop-blur-md">
        <ToastIcon kind={toast.icon} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-white">{toast.title}</p>
          <p className="truncate text-[11px] text-slate-400">{toast.detail}</p>
        </div>
        <span className={`text-xs font-bold tabular-nums ${toast.tone}`}>{toast.amount}</span>
      </div>
    </div>
  );
}

function PreviewCard() {
  const revenue = useCountUp(REVENUE, 600);
  const profit = useCountUp(PROFIT, 800);
  const margin = useCountUp(32.4, 800);

  return (
    <div className="ps-fade-up relative mt-10 max-w-[30rem]" style={delay(350)}>
      <LiveToasts />

      <div className="ps-float relative rounded-3xl border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/30 backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Profit overview</p>
            <p className="mt-0.5 text-xs text-slate-400">Last 30 days · example data</p>
          </div>
          <span className="mt-0.5 flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            Synced
          </span>
        </div>

        {/* Stats */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3.5">
            <p className="text-[11px] text-slate-400">Revenue</p>
            <p className="mt-1.5 text-xl font-bold tabular-nums text-white">{money(revenue)}</p>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.08] p-3.5">
            <p className="text-[11px] text-emerald-200/80">Net profit</p>
            <p className="mt-1.5 text-xl font-bold tabular-nums text-emerald-300">{money(profit)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3.5">
            <p className="text-[11px] text-slate-400">Margin</p>
            <p className="mt-1.5 flex items-baseline gap-1 text-xl font-bold tabular-nums text-white">
              {margin.toFixed(1)}%
              <span className="text-[11px] font-semibold text-emerald-300">▲</span>
            </p>
          </div>
        </div>

        {/* Chart */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-[#081426]/60 p-4">
          <div className="mb-2 flex items-center justify-between text-[11px]">
            <span className="font-medium text-slate-300">Cumulative profit</span>
            <span className="rounded-md bg-emerald-400/10 px-2 py-0.5 font-semibold text-emerald-300">+38% vs last month</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full overflow-visible" role="img" aria-label="Illustrative chart of profit rising over 30 days">
            <defs>
              <linearGradient id="ps-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="ps-line" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#34d399" />
              </linearGradient>
              <filter id="ps-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="white" strokeOpacity="0.06" strokeDasharray="4 6" />
            ))}

            <path d={AREA} fill="url(#ps-area)" className="ps-fade-in" style={delay(1300)} />
            <path d={LINE} pathLength={1} fill="none" stroke="url(#ps-line)" strokeWidth="3" strokeLinecap="round" filter="url(#ps-glow)" className="ps-draw" />

            <g className="ps-fade-in" style={delay(2400)}>
              <circle cx={LAST[0]} cy={LAST[1]} r="6" fill="#34d399" className="ps-ping" />
              <circle cx={LAST[0]} cy={LAST[1]} r="5" fill="#34d399" stroke="#081426" strokeWidth="2.5" />
            </g>
          </svg>
          <div className="mt-1 flex justify-between text-[10px] text-slate-500">
            <span>Week 1</span><span>Week 2</span><span>Week 3</span><span>Week 4</span>
          </div>
        </div>

        {/* Where the money goes */}
        <div className="mt-4">
          <div className="flex h-2 overflow-hidden rounded-full bg-white/5">
            {BREAKDOWN.map((b, i) => (
              <div
                key={b.label}
                className={`ps-grow-x h-full ${b.color}`}
                style={{ width: `${(b.value / REVENUE) * 100}%`, ...delay(1400 + i * 180) }}
              />
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
            {BREAKDOWN.map((b) => (
              <span key={b.label} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${b.color}`} />
                {b.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  { title: "Auto-import", text: "eBay orders sync in" },
  { title: "Every fee", text: "Fees & costs counted" },
  { title: "True profit", text: "Know what you keep" },
];

export default function BrandPanel() {
  return (
    <section className="ps-motion relative hidden overflow-hidden bg-[#071120] text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[54%] lg:flex-col lg:justify-between lg:px-14 lg:py-10 xl:px-20">
      {/* Background: grid + drifting glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at 40% 45%, black 20%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at 40% 45%, black 20%, transparent 75%)",
        }}
      />
      <div aria-hidden="true" className="ps-drift pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-blue-600/25 blur-3xl" />
      <div aria-hidden="true" className="ps-drift pointer-events-none absolute -bottom-56 -left-40 h-[560px] w-[560px] rounded-full bg-emerald-500/10 blur-3xl" style={{ animationDelay: "-9s" }} />

      {/* Logo */}
      <div className="ps-fade-up relative z-10 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-600/30 ring-1 ring-white/10">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 17l6-6 4 4 8-9" />
            <path d="M15 6h6v6" />
          </svg>
        </div>
        <span className="text-xl font-bold tracking-tight">ProfitSync</span>
      </div>

      {/* Headline + preview */}
      <div className="relative z-10 py-8">
        <div className="ps-fade-up inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-4 py-1.5 text-[11px] font-semibold tracking-[0.14em] text-blue-200" style={delay(100)}>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          BUILT FOR EBAY SELLERS
        </div>

        <h1 className="ps-fade-up mt-6 text-4xl font-bold leading-[1.08] tracking-tight xl:text-[3.4rem]" style={delay(180)}>
          Know your numbers.
          <span className="mt-1 block bg-gradient-to-r from-blue-400 via-sky-300 to-emerald-300 bg-clip-text text-transparent">
            Grow your profits.
          </span>
        </h1>

        <p className="ps-fade-up mt-5 max-w-md text-base leading-7 text-slate-300/90" style={delay(260)}>
          Sales, eBay fees, product costs and refunds in one place — so you always know what you really made.
        </p>

        <PreviewCard />
      </div>

      {/* Features */}
      <div className="ps-fade-up relative z-10 hidden max-w-xl grid-cols-3 gap-4 border-t border-white/10 pt-6 [@media(min-height:960px)]:grid" style={delay(500)}>
        {FEATURES.map((f) => (
          <div key={f.title}>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12l4 4L19 6" />
              </svg>
              {f.title}
            </p>
            <p className="mt-1 text-xs text-slate-400">{f.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
