"use client";

// Moved out of page.tsx unchanged (redesign phase 1).
import { useState } from "react";
import { type ChartPoint, money } from "./model";
import { Icon } from "./Icon";

// ============================================================
// PROFIT CHART
// ============================================================

export function ProfitChart({
  points,
  hasData,
}: {
  points: ChartPoint[];
  hasData: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(
    null
  );

  const width = 900;
  const height = 270;

  const left = 12;
  const right = 12;
  const top = 20;
  const bottom = 30;

  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;

  const values = points.map((point) => point.value);

  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(0, ...values);

  const spread = rawMax - rawMin;
  const padding = spread === 0 ? 10 : spread * 0.12;

  const min = rawMin - padding;
  const max = rawMax + padding;

  function getX(index: number) {
    if (points.length <= 1) {
      return left + chartWidth / 2;
    }

    return (
      left +
      (index / (points.length - 1)) * chartWidth
    );
  }

  function getY(value: number) {
    return (
      top +
      ((max - value) / (max - min)) * chartHeight
    );
  }

  const coordinates = points.map((point, index) => ({
    x: getX(index),
    y: getY(point.value),
    ...point,
  }));

  const linePath = coordinates
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`
    )
    .join(" ");

  const baseline = top + chartHeight;

  const areaPath =
    coordinates.length > 0
      ? `${linePath} L ${
          coordinates[coordinates.length - 1].x
        } ${baseline} L ${
          coordinates[0].x
        } ${baseline} Z`
      : "";

  const gridValues = Array.from(
    { length: 5 },
    (_, index) => min + ((max - min) * index) / 4
  ).reverse();

  const activePoint =
    activeIndex !== null
      ? coordinates[activeIndex]
      : null;

  return (
    <div className="relative">
      {!hasData ? (
        <div className="flex h-[270px] flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-[#101827]/50 text-center">
          <div className="mb-4 rounded-xl bg-emerald-500/10 p-4 text-emerald-400">
            <Icon name="chart" size={26} />
          </div>

          <p className="text-sm font-semibold text-slate-200">
            No completed orders in this period
          </p>

          <p className="mt-2 max-w-sm px-5 text-xs leading-5 text-slate-500">
            Add product costs to your orders to start
            tracking real profit performance.
          </p>
        </div>
      ) : (
        <>
          <div className="relative">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="h-auto w-full overflow-visible"
              role="img"
              aria-label="Cumulative net profit over the selected period"
              onMouseLeave={() => setActiveIndex(null)}
            >
              <defs>
                <linearGradient
                  id="profitAreaGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="#10b981"
                    stopOpacity="0.23"
                  />

                  <stop
                    offset="100%"
                    stopColor="#10b981"
                    stopOpacity="0"
                  />
                </linearGradient>
              </defs>

              {gridValues.map((value, index) => (
                <line
                  key={index}
                  x1={left}
                  x2={width - right}
                  y1={getY(value)}
                  y2={getY(value)}
                  stroke="#ffffff"
                  strokeOpacity="0.07"
                  strokeDasharray="4 6"
                />
              ))}

              {areaPath && (
                <path
                  d={areaPath}
                  fill="url(#profitAreaGradient)"
                />
              )}

              {linePath && (
                <path
                  d={linePath}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}

              {activePoint && (
                <>
                  <line
                    x1={activePoint.x}
                    x2={activePoint.x}
                    y1={top}
                    y2={baseline}
                    stroke="#94a3b8"
                    strokeOpacity="0.5"
                    strokeDasharray="4 5"
                  />

                  <circle
                    cx={activePoint.x}
                    cy={activePoint.y}
                    r="6"
                    fill="#10b981"
                    stroke="#151d2d"
                    strokeWidth="3"
                  />
                </>
              )}

              {coordinates.map((point, index) => (
                <circle
                  key={index}
                  cx={point.x}
                  cy={point.y}
                  r="12"
                  fill="transparent"
                  className="cursor-crosshair"
                  onMouseEnter={() => setActiveIndex(index)}
                />
              ))}
            </svg>

            {activePoint && (
              <div
                className="pointer-events-none absolute top-0 z-10 rounded-xl border border-white/10 bg-[#0b1120] px-4 py-3 shadow-2xl"
                style={{
                  left: `${
                    (activePoint.x / width) * 100
                  }%`,
                  transform:
                    activePoint.x > width * 0.75
                      ? "translateX(-100%)"
                      : activePoint.x < width * 0.25
                        ? "translateX(0%)"
                        : "translateX(-50%)",
                }}
              >
                <p className="text-xs text-slate-400">
                  {activePoint.label}
                </p>

                <p className="mt-1 text-sm font-bold text-emerald-400">
                  {money(activePoint.value)}
                </p>
              </div>
            )}
          </div>

          <div className="mt-3 flex justify-between text-[11px] text-slate-500">
            <span>{points[0]?.label}</span>

            <span>
              {points[Math.floor(points.length / 2)]?.label}
            </span>

            <span>
              {points[points.length - 1]?.label}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
