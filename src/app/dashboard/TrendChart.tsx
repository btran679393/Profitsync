"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/ui";

export type TrendPoint = { label: string; revenue: number; profit: number };

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

const H = 240;
const PAD = { top: 16, right: 12, bottom: 28, left: 52 };

function niceMax(value: number) {
  if (value <= 0) return 10;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * power >= value / 4) ?? 10;
  return Math.ceil(value / (step * power)) * step * power;
}

// Revenue and net profit over the chosen period, both running totals.
// Hover (or tab to the chart and use the arrow keys) to read a day.
export default function TrendChart({ points }: { points: TrendPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const gradientId = useId();
  // Draw at the real width so text and lines stay crisp at any size.
  const hasPoints = points.length > 0;
  const [W, setW] = useState(720);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => setW(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(box);
    return () => observer.disconnect();
  }, [hasPoints]);

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const maxValue = niceMax(Math.max(...points.map((p) => Math.max(p.revenue, p.profit)), 1));
    const minValue = Math.min(0, ...points.map((p) => p.profit));
    const minNice = minValue < 0 ? -niceMax(-minValue) : 0;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = (v: number) => PAD.top + (1 - (v - minNice) / (maxValue - minNice)) * innerH;
    const line = (key: "revenue" | "profit") => points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
    const area = `${line("profit")} L${x(points.length - 1).toFixed(1)},${y(minNice).toFixed(1)} L${x(0).toFixed(1)},${y(minNice).toFixed(1)} Z`;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => minNice + t * (maxValue - minNice));
    // About one date per 90px, so labels never overlap.
    const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 90))));
    return { x, y, revenueLine: line("revenue"), profitLine: line("profit"), area, ticks, labelEvery, zeroY: y(0) };
  }, [points, W]);

  if (!geometry) {
    return (
      <EmptyState
        title="No profit to chart yet"
        description="Add product costs to your orders and the chart fills in."
        className="py-16"
      />
    );
  }

  function pick(clientX: number) {
    const svg = svgRef.current;
    if (!svg || !geometry) return;
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(geometry.x(i) - px) < Math.abs(geometry.x(best) - px)) best = i;
    }
    setActive(best);
  }

  const current = active === null ? null : points[active];
  const last = points[points.length - 1];

  return (
    <div className="relative" ref={boxRef}>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-accent" aria-hidden="true" /> Revenue
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-profit" aria-hidden="true" /> Net profit
        </span>
        <span className="ml-auto ps-num text-subtle">
          {current ? current.label : `Through ${last.label}`}:{" "}
          <span className="font-semibold text-accent-ink">{money((current ?? last).revenue)}</span> ·{" "}
          <span className={`font-semibold ${(current ?? last).profit < 0 ? "text-loss" : "text-profit"}`}>{money((current ?? last).profit)}</span>
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block w-full touch-none select-none"
        role="img"
        aria-label={`Running revenue and net profit. Through ${last.label}: revenue ${money(last.revenue)}, net profit ${money(last.profit)}.`}
        tabIndex={0}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerLeave={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          setActive((i) => {
            const start = i ?? points.length - 1;
            return Math.max(0, Math.min(points.length - 1, start + (e.key === "ArrowRight" ? 1 : -1)));
          });
        }}
        onBlur={() => setActive(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--ps-profit)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--ps-profit)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {geometry.ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={geometry.y(tick)} y2={geometry.y(tick)} stroke="var(--ps-line)" strokeDasharray={tick === 0 ? undefined : "3 5"} vectorEffect="non-scaling-stroke" />
            <text x={PAD.left - 8} y={geometry.y(tick) + 4} textAnchor="end" fontSize="11" fill="var(--ps-subtle)" className="ps-num">
              {money(tick)}
            </text>
          </g>
        ))}

        {points.map((p, i) =>
          (i % geometry.labelEvery === 0 && (points.length - 1 - i) >= geometry.labelEvery * 0.6) || i === points.length - 1 ? (
            <text key={p.label + i} x={geometry.x(i)} y={H - 8} textAnchor={i === points.length - 1 ? "end" : i === 0 ? "start" : "middle"} fontSize="11" fill="var(--ps-subtle)">
              {p.label}
            </text>
          ) : null
        )}

        <path d={geometry.area} fill={`url(#${gradientId})`} />
        <path d={geometry.revenueLine} fill="none" stroke="var(--ps-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.85" />
        <path d={geometry.profitLine} fill="none" stroke="var(--ps-profit)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />

        {active !== null && current && (
          <g>
            <line x1={geometry.x(active)} x2={geometry.x(active)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--ps-line-strong)" vectorEffect="non-scaling-stroke" />
            <circle cx={geometry.x(active)} cy={geometry.y(current.revenue)} r="4" fill="var(--ps-accent)" stroke="var(--ps-surface)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            <circle cx={geometry.x(active)} cy={geometry.y(current.profit)} r="4.5" fill="var(--ps-profit)" stroke="var(--ps-surface)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>

      {/* The same numbers as a table, for screen readers. */}
      <table className="sr-only">
        <caption>Running revenue and net profit by day</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Revenue</th>
            <th>Net profit</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={p.label + i}>
              <td>{p.label}</td>
              <td>{money(p.revenue)}</td>
              <td>{money(p.profit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
