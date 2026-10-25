"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ============================================================
// TYPES
// ============================================================

type Order = {
  id: number;
  ebayOrderId: string | null;
  item: string;
  imageUrl: string | null;
  salePrice: number;
  ebayFees: number;
  productCost: string;
  savedProductCost: string;
  refundAmount: number;
  refundedAt: string | null;
  status: string;
  orderDate: string | null;
};

type ApiOrder = {
  id: number;
  ebayOrderId: string | null;
  item: string;
  imageUrl?: string | null;
  salePrice: string | number;
  ebayFees: string | number;
  productCost: string | number | null;
  refundAmount?: string | number | null;
  refundedAt?: string | null;
  status: string;
  orderDate?: string | null;
};

type SyncResponse = {
  success?: boolean;
  found?: number;
  imported?: number;
  skipped?: number;
  feesUpdated?: number;
  imagesImported?: number;
  imagesUpdated?: number;
  refundedImported?: number;
  refundsUpdated?: number;
  error?: string;
  message?: string;
};

type OrderFilter = "all" | "completed" | "pending" | "refunded";

type DateRange = "7d" | "30d" | "90d" | "all";

type ChartPoint = {
  label: string;
  value: number;
};

type IconName =
  | "dashboard"
  | "orders"
  | "chart"
  | "wallet"
  | "dollar"
  | "search"
  | "refresh"
  | "logout"
  | "check"
  | "clock"
  | "menu"
  | "close"
  | "arrow"
  | "box"
  | "calendar"
  | "alert"
  | "chevron"
  | "filter"
  | "save"
  | "info"
  | "trending"
  | "external";

// ============================================================
// UTILITIES
// ============================================================

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function compactMoney(value: number) {
  const absolute = Math.abs(value);

  if (absolute >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}m`;
  }

  if (absolute >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }

  return money(value);
}

function isValidCost(value: string) {
  const trimmed = value.trim();

  return (
    trimmed !== "" &&
    /^\d+(\.\d{1,2})?$/.test(trimmed) &&
    Number.isFinite(Number(trimmed)) &&
    Number(trimmed) >= 0
  );
}

function formatOrders(data: ApiOrder[]): Order[] {
  return data.map((order) => {
    const cost =
      order.productCost === null ||
      order.productCost === undefined
        ? ""
        : String(order.productCost);

    return {
      id: order.id,
      ebayOrderId: order.ebayOrderId,
      item: order.item,
      imageUrl: order.imageUrl ?? null,
      salePrice: Number(order.salePrice),
      ebayFees: Number(order.ebayFees),
      productCost: cost,
      savedProductCost: cost,
      refundAmount: Math.max(0, Number(order.refundAmount ?? 0) || 0),
      refundedAt: order.refundedAt ?? null,
      status: order.status,
      orderDate: order.orderDate ?? null,
    };
  });
}

function isFullyRefunded(order: Order) {
  return order.status === "REFUNDED" ||
    (order.refundAmount > 0 && order.refundAmount >= order.salePrice - 0.01);
}

function isPartiallyRefunded(order: Order) {
  return !isFullyRefunded(order) &&
    (order.status === "PARTIALLY_REFUNDED" || order.refundAmount > 0);
}

function requiresProductCost(order: Order) {
  return !isFullyRefunded(order);
}

function hasRecordedCost(order: Order) {
  return isValidCost(order.savedProductCost);
}

function getOrderProfit(order: Order) {
  // A fully refunded order is removed from profit reporting.
  // Its retained seller fees or other sunk costs may still need
  // separate accounting outside this dashboard.
  if (isFullyRefunded(order)) return null;
  if (!hasRecordedCost(order)) return null;
  return order.salePrice - order.refundAmount -
    order.ebayFees - Number(order.savedProductCost);
}

function getDateRangeStart(
  range: DateRange,
  now: Date
): Date | null {
  if (range === "all") return null;

  const days =
    range === "7d" ? 7 : range === "30d" ? 30 : 90;

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  return start;
}

function isOrderInDateRange(
  order: Order,
  range: DateRange,
  now: Date
) {
  if (range === "all") return true;

  if (!order.orderDate) return false;

  const date = new Date(order.orderDate);

  if (Number.isNaN(date.getTime())) return false;

  const start = getDateRangeStart(range, now);

  if (!start) return true;

  return date >= start && date <= now;
}

function dateRangeLabel(range: DateRange) {
  switch (range) {
    case "7d":
      return "Last 7 Days";
    case "30d":
      return "Last 30 Days";
    case "90d":
      return "Last 90 Days";
    default:
      return "All Time";
  }
}

function formatOrderDate(value: string | null) {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
}

// ============================================================
// ICONS
// ============================================================

function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const paths: Record<IconName, React.ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),

    orders: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),

    chart: (
      <>
        <path d="M3 3v18h18" />
        <path d="m7 15 4-4 3 3 6-7" />
      </>
    ),

    wallet: (
      <>
        <rect x="3" y="5" width="18" height="15" rx="2" />
        <path d="M3 9h18" />
        <path d="M16 15h2" />
      </>
    ),

    dollar: (
      <>
        <path d="M12 2v20" />
        <path d="M17 5H9a4 4 0 0 0 0 8h6a4 4 0 0 1 0 8H6" />
      </>
    ),

    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),

    refresh: (
      <>
        <path d="M20 11a8 8 0 0 0-14-5L4 8" />
        <path d="M4 4v4h4" />
        <path d="M4 13a8 8 0 0 0 14 5l2-2" />
        <path d="M16 16h4v4" />
      </>
    ),

    logout: (
      <>
        <path d="M10 17l5-5-5-5" />
        <path d="M15 12H3" />
        <path d="M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6" />
      </>
    ),

    check: <path d="m5 12 4 4L19 6" />,

    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),

    menu: <path d="M4 7h16M4 12h16M4 17h16" />,

    close: <path d="M5 5l14 14M19 5 5 19" />,

    arrow: (
      <>
        <path d="m7 17 10-10M8 7h9v9" />
      </>
    ),

    box: (
      <>
        <path d="m12 2 9 5v10l-9 5-9-5V7z" />
        <path d="m3 7 9 5 9-5M12 12v10" />
      </>
    ),

    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4M17 3v4M3 10h18" />
      </>
    ),

    alert: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6M12 17h.01" />
      </>
    ),

    chevron: <path d="m9 18 6-6-6-6" />,

    filter: (
      <>
        <path d="M4 7h16M7 12h10M10 17h4" />
      </>
    ),

    save: (
      <>
        <path d="M5 3h12l4 4v14H3V3z" />
        <path d="M7 3v6h10V3M7 21v-9h10v9" />
      </>
    ),

    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7h.01" />
      </>
    ),

    trending: (
      <>
        <path d="m3 17 6-6 4 4 8-8" />
        <path d="M15 7h6v6" />
      </>
    ),

    external: (
      <>
        <path d="M13 5h6v6" />
        <path d="m19 5-9 9" />
        <path d="M19 13v6H5V5h6" />
      </>
    ),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

// ============================================================
// LISTING IMAGE
// ============================================================

function ListingImage({
  imageUrl,
  item,
  size = "normal",
}: {
  imageUrl: string | null;
  item: string;
  size?: "normal" | "large";
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  const dimensions =
    size === "large" ? "h-20 w-20" : "h-12 w-12";

  if (!imageUrl || failed) {
    return (
      <div
        className={`flex ${dimensions} shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-800 text-slate-500`}
        aria-label="No listing image available"
      >
        <Icon
          name="box"
          size={size === "large" ? 28 : 21}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex ${dimensions} shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white`}
    >
      <img
        src={imageUrl}
        alt={item}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-full w-full object-contain"
      />
    </div>
  );
}

// ============================================================
// METRIC CARD
// ============================================================

function MetricCard({
  title,
  value,
  description,
  icon,
  accent = "blue",
  featured = false,
}: {
  title: string;
  value: string;
  description: string;
  icon: IconName;
  accent?: "blue" | "green" | "amber" | "purple";
  featured?: boolean;
}) {
  const accents = {
    blue: "bg-blue-500/10 text-blue-400",
    green: "bg-emerald-500/10 text-emerald-400",
    amber: "bg-amber-500/10 text-amber-400",
    purple: "bg-violet-500/10 text-violet-400",
  };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-5 transition hover:border-white/20 ${
        featured
          ? "border-emerald-500/20 bg-gradient-to-br from-[#152b2b] to-[#151d2d]"
          : "border-white/[0.07] bg-[#151d2d]"
      }`}
    >
      {featured && (
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-500/[0.06] blur-2xl" />
      )}

      <div className="relative mb-6 flex items-start justify-between">
        <span className="text-sm font-medium text-slate-400">
          {title}
        </span>

        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${accents[accent]}`}
        >
          <Icon name={icon} size={19} />
        </div>
      </div>

      <div
        className={`relative text-2xl font-bold tracking-tight sm:text-3xl ${
          featured ? "text-emerald-400" : "text-white"
        }`}
      >
        {value}
      </div>

      <p className="relative mt-2 text-xs leading-5 text-slate-500">
        {description}
      </p>
    </div>
  );
}

// ============================================================
// PROFIT CHART
// ============================================================

function ProfitChart({
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

// ============================================================
// ORDER DETAILS PANEL
// ============================================================

function OrderDetailsPanel({
  order,
  saving,
  syncing,
  loggingOut,
  onClose,
  onChangeCost,
  onSaveCost,
}: {
  order: Order;
  saving: boolean;
  syncing: boolean;
  loggingOut: boolean;
  onClose: () => void;
  onChangeCost: (id: number, value: string) => void;
  onSaveCost: (id: number, value: string) => Promise<void>;
}) {
  const refunded = isFullyRefunded(order);
  const partialRefund = isPartiallyRefunded(order);
  const hasSavedCost = isValidCost(
    order.savedProductCost
  );

  const validDraft = isValidCost(order.productCost);

  const calculatedProfit = !refunded && validDraft
    ? order.salePrice - order.refundAmount -
      order.ebayFees - Number(order.productCost)
    : null;

  const profitMargin =
    calculatedProfit !== null && order.salePrice > 0
      ? (calculatedProfit / order.salePrice) * 100
      : null;

  const hasChanges =
    validDraft &&
    (order.savedProductCost === "" ||
      Number(order.savedProductCost) !==
        Number(order.productCost));

  const disabled = saving || syncing || loggingOut || refunded;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close order details"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-white/10 bg-[#101827] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-white">
              Order Details
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Review financial details
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close order details"
            className="rounded-lg border border-white/10 p-2 text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            <Icon name="close" size={19} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="flex items-start gap-4">
            <ListingImage
              imageUrl={order.imageUrl}
              item={order.item}
              size="large"
            />

            <div className="min-w-0">
              <h3 className="text-sm font-semibold leading-6 text-white">
                {order.item}
              </h3>

              <p className="mt-2 break-all text-xs text-slate-500">
                {order.ebayOrderId
                  ? `Order #${order.ebayOrderId}`
                  : "Order ID unavailable"}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {formatOrderDate(order.orderDate)}
              </p>
            </div>
          </div>

          <div className="mt-7">
            {refunded ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-400">
                Refunded — No Product Cost Needed
              </span>
            ) : partialRefund ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-400">
                Partially Refunded
              </span>
            ) : hasSavedCost ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400">
                <Icon name="check" size={14} />
                Product Cost Recorded
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400">
                <Icon name="alert" size={14} />
                Product Cost Needed
              </span>
            )}
          </div>

          <div className="mt-8 rounded-2xl border border-white/[0.07] bg-[#151d2d] p-5">
            <h4 className="mb-6 text-sm font-semibold text-white">
              Financial Breakdown
            </h4>

            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">
                  Sale Price
                </span>

                <span className="text-sm font-semibold text-white">
                  {money(order.salePrice)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">
                  eBay Fees
                </span>

                <span className="text-sm font-semibold text-red-400">
                  −{money(order.ebayFees)}
                </span>
              </div>

              {order.refundAmount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Refund Issued</span>
                  <span className="text-sm font-semibold text-orange-400">−{money(order.refundAmount)}</span>
                </div>
              )}
              {!refunded && <div className="border-t border-white/[0.07] pt-5">
                <label
                  htmlFor="detail-product-cost"
                  className="mb-3 block text-sm font-semibold text-slate-300"
                >
                  Product Cost ($)
                </label>

                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                    $
                  </span>

                  <input
                    id="detail-product-cost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={order.productCost}
                    placeholder="Enter product cost"
                    disabled={disabled}
                    onChange={(event) =>
                      onChangeCost(
                        order.id,
                        event.target.value
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();

                        if (hasChanges) {
                          void onSaveCost(
                            order.id,
                            order.productCost
                          );
                        }
                      }
                    }}
                    className="w-full rounded-xl border border-white/10 bg-[#0b1120] py-3 pl-9 pr-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500 disabled:opacity-50"
                  />
                </div>

                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Enter what you paid for this product.
                  ProfitSync calculates your profit
                  automatically.
                </p>
              </div>}
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.05] p-5">
            <p className="text-sm text-slate-400">
              Calculated Net Profit
            </p>

            <p
              className={`mt-3 text-3xl font-bold ${
                calculatedProfit === null
                  ? "text-slate-500"
                  : calculatedProfit >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
              }`}
            >
              {refunded ? "Excluded (Refunded)" : calculatedProfit === null
                ? "Pending"
                : money(calculatedProfit)}
            </p>

            <p className="mt-2 text-xs text-slate-500">
              {refunded ? "Fully refunded orders are excluded from profit totals." : profitMargin === null
                ? "Add a product cost to calculate margin."
                : `Profit Margin: ${profitMargin.toFixed(1)}%`}
            </p>
          </div>

          <div className="mt-5 flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
            <Icon
              name="info"
              size={18}
              className="mt-0.5 shrink-0 text-blue-400"
            />

            <p className="text-xs leading-5 text-slate-400">
              Profit estimates subtract refunds, recorded eBay fees,
              and product costs. Fully refunded sales are excluded.
              Shipping expenses and nonrefundable fees may still affect actual profit.
            </p>
          </div>
        </div>

        <div className="border-t border-white/10 bg-[#101827] p-6">
          <button
            type="button"
            disabled={!hasChanges || disabled}
            onClick={() =>
              onSaveCost(order.id, order.productCost)
            }
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="save" size={17} />

            {saving
              ? "Saving..."
              : refunded ? "No Cost Needed (Refunded)"
              : hasChanges
                ? "Save Product Cost"
                : "No Unsaved Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN DASHBOARD
// ============================================================

export default function Home() {
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(
    null
  );

  const savingRef = useRef(false);

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncError, setSyncError] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] =
    useState<OrderFilter>("all");

  const [dateRange, setDateRange] =
    useState<DateRange>("30d");

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [selectedOrderId, setSelectedOrderId] =
    useState<number | null>(null);

  const [now, setNow] = useState<Date | null>(null);

  // ----------------------------------------------------------
  // INITIAL DATE
  // ----------------------------------------------------------

  useEffect(() => {
    setNow(new Date());
  }, []);

  // ----------------------------------------------------------
  // LOGOUT
  // ----------------------------------------------------------

  async function logout() {
    if (loggingOut) return;

    try {
      setLoggingOut(true);
      setLogoutError("");

      const supabase = createClient();

      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      setOrders([]);
      setSyncMessage("");
      setLoadError("");

      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error("Logout failed:", error);

      setLogoutError(
        "Unable to log out. Please try again."
      );

      setLoggingOut(false);
    }
  }

  // ----------------------------------------------------------
  // LOAD ORDERS
  // ----------------------------------------------------------

  const loadOrders = useCallback(async () => {
    const response = await fetch("/api/orders", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Failed to load orders.");
    }

    const data: ApiOrder[] = await response.json();

    setOrders(formatOrders(data));
    setLoadError("");
  }, []);

  useEffect(() => {
    async function initialLoad() {
      try {
        await loadOrders();
      } catch (error) {
        console.error("Loading failed:", error);

        setLoadError(
          "Unable to load orders from the database."
        );
      } finally {
        setLoading(false);
      }
    }

    void initialLoad();
  }, [loadOrders]);

  // ----------------------------------------------------------
  // EDIT PRODUCT COST
  // ----------------------------------------------------------

  function updateProductCost(id: number, value: string) {
    setOrders((currentOrders) =>
      currentOrders.map((order) =>
        order.id === id
          ? { ...order, productCost: value }
          : order
      )
    );
  }

  // ----------------------------------------------------------
  // SAVE PRODUCT COST
  // ----------------------------------------------------------

  async function saveProductCost(
    id: number,
    value: string
  ) {
    if (savingRef.current) return;

    const currentOrder = orders.find(
      (order) => order.id === id
    );

    if (!currentOrder || isFullyRefunded(currentOrder)) return;

    if (!isValidCost(value)) {
      setOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === id
            ? {
                ...order,
                productCost: order.savedProductCost,
              }
            : order
        )
      );

      return;
    }

    const productCost = Number(value);

    if (
      currentOrder.savedProductCost !== "" &&
      Number(currentOrder.savedProductCost) === productCost
    ) {
      return;
    }

    savingRef.current = true;

    try {
      setSavingId(id);
      setLoadError("");

      const response = await fetch(
        `/api/orders/${id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ productCost }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to save product cost.");
      }

      const formattedCost = productCost.toFixed(2);

      setOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === id
            ? {
                ...order,
                productCost: formattedCost,
                savedProductCost: formattedCost,
                status: isPartiallyRefunded(order) ? "PARTIALLY_REFUNDED" : "COMPLETED",
              }
            : order
        )
      );
    } catch (error) {
      console.error("Saving failed:", error);

      setLoadError(
        "Failed to save product cost. Please try again."
      );

      setOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === id
            ? {
                ...order,
                productCost: order.savedProductCost,
              }
            : order
        )
      );
    } finally {
      savingRef.current = false;
      setSavingId(null);
    }
  }

  // ----------------------------------------------------------
  // SYNC EBAY
  // ----------------------------------------------------------

  async function syncEbayOrders() {
    if (syncing || savingRef.current || loggingOut) {
      return;
    }

    try {
      setSyncing(true);
      setSyncMessage("");
      setSyncError(false);

      const response = await fetch("/api/ebay/sync", {
        method: "POST",
        cache: "no-store",
      });

      const data: SyncResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message ||
            data.error ||
            "Failed to sync eBay orders."
        );
      }

      await loadOrders();

      const found = data.found ?? 0;
      const imported = data.imported ?? 0;
      const skipped = data.skipped ?? 0;

      setSyncMessage(
        `Sync complete! Found ${found} eBay orders. ` +
          `Imported ${imported} new orders. ` +
          `Skipped ${skipped} existing or invalid orders.` +
          (data.feesUpdated !== undefined
            ? ` Updated fees on ${data.feesUpdated} orders.`
            : "") +
          (data.imagesImported !== undefined
            ? ` Added ${data.imagesImported} listing images.`
            : "") +
          (data.imagesUpdated !== undefined
            ? ` Updated ${data.imagesUpdated} listing images.`
            : "") +
          (data.refundedImported !== undefined
            ? ` Imported ${data.refundedImported} refunded orders.`
            : "") +
          (data.refundsUpdated !== undefined
            ? ` Updated refunds on ${data.refundsUpdated} existing orders.`
            : "")
      );
    } catch (error) {
      console.error("Sync failed:", error);

      setSyncError(true);

      setSyncMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong syncing orders."
      );
    } finally {
      setSyncing(false);
    }
  }

  // ----------------------------------------------------------
  // SELECTED DATE RANGE
  // ----------------------------------------------------------

  const periodOrders = useMemo(() => {
    if (!now) return [];

    return orders.filter((order) =>
      isOrderInDateRange(order, dateRange, now)
    );
  }, [orders, dateRange, now]);

  // ----------------------------------------------------------
  // FINANCIAL TOTALS
  // ----------------------------------------------------------

  const totals = useMemo(() => {
    const activeOrders = periodOrders.filter((order) => !isFullyRefunded(order));
    const refundedCount = periodOrders.length - activeOrders.length;
    const totalRevenue = activeOrders.reduce(
      (sum, order) => sum + Math.max(0, order.salePrice - order.refundAmount), 0
    );
    const totalFees = activeOrders.reduce((sum, order) => sum + order.ebayFees, 0);
    const completedOrders = activeOrders.filter(hasRecordedCost);
    const totalProductCosts = completedOrders.reduce(
      (sum, order) => sum + Number(order.savedProductCost), 0
    );
    const netProfit = completedOrders.reduce(
      (sum, order) => sum + (getOrderProfit(order) ?? 0), 0
    );
    const completedRevenue = completedOrders.reduce(
      (sum, order) => sum + Math.max(0, order.salePrice - order.refundAmount), 0
    );
    const profitMargin = completedRevenue > 0
      ? (netProfit / completedRevenue) * 100 : 0;
    const pendingOrders = activeOrders.length - completedOrders.length;
    return {
      totalRevenue, totalFees, totalProductCosts, netProfit, profitMargin,
      completedCount: completedOrders.length, pendingOrders,
      orderCount: activeOrders.length, refundedCount,
    };
  }, [periodOrders]);

  // ----------------------------------------------------------
  // FILTERED ORDERS
  // ----------------------------------------------------------

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();

    return periodOrders.filter((order) => {
      const matchesSearch =
        order.item.toLowerCase().includes(query) ||
        (order.ebayOrderId ?? "")
          .toLowerCase()
          .includes(query);

      const refunded = isFullyRefunded(order);
      const completed = !refunded && hasRecordedCost(order);

      const matchesFilter =
        filter === "all" ||
        (filter === "completed" && completed) ||
        (filter === "pending" && !completed && !refunded) ||
        (filter === "refunded" && refunded);

      return matchesSearch && matchesFilter;
    });
  }, [periodOrders, search, filter]);

  // ----------------------------------------------------------
  // COMPLETION PERCENTAGE
  // ----------------------------------------------------------

  const completionPercentage =
    totals.orderCount > 0
      ? (totals.completedCount / totals.orderCount) * 100
      : 0;

  // ----------------------------------------------------------
  // REAL PROFIT CHART
  // ----------------------------------------------------------

  const chartData = useMemo(() => {
    if (!now) {
      return {
        points: [] as ChartPoint[],
        hasData: false,
      };
    }

    const completedOrders = periodOrders.filter(
      (order) =>
        !isFullyRefunded(order) &&
        isValidCost(order.savedProductCost) &&
        order.orderDate &&
        !Number.isNaN(
          new Date(order.orderDate).getTime()
        )
    );

    if (completedOrders.length === 0) {
      return {
        points: [] as ChartPoint[],
        hasData: false,
      };
    }

    const profitByDay = new Map<string, number>();

    for (const order of completedOrders) {
      const profit = getOrderProfit(order);

      if (profit === null || !order.orderDate) {
        continue;
      }

      const date = new Date(order.orderDate);
      const key = localDateKey(date);

      profitByDay.set(
        key,
        (profitByDay.get(key) ?? 0) + profit
      );
    }

    const sortedDates = Array.from(
      profitByDay.keys()
    ).sort();

    if (sortedDates.length === 0) {
      return {
        points: [] as ChartPoint[],
        hasData: false,
      };
    }

    let startDate: Date;

    if (dateRange === "all") {
      const first = completedOrders
        .map((order) => new Date(order.orderDate!))
        .sort(
          (a, b) => a.getTime() - b.getTime()
        )[0];

      startDate = startOfLocalDay(first);
    } else {
      startDate =
        getDateRangeStart(dateRange, now) ??
        startOfLocalDay(now);
    }

    const endDate = startOfLocalDay(now);

    const days: Date[] = [];

    for (
      let current = new Date(startDate);
      current <= endDate;
      current.setDate(current.getDate() + 1)
    ) {
      days.push(new Date(current));
    }

    if (days.length === 0) {
      return {
        points: [] as ChartPoint[],
        hasData: false,
      };
    }

    // Keep the chart readable for longer date ranges.
    const maxPoints = 45;
    const bucketSize = Math.max(
      1,
      Math.ceil(days.length / maxPoints)
    );

    const points: ChartPoint[] = [];

    let cumulativeProfit = 0;

    for (
      let index = 0;
      index < days.length;
      index += bucketSize
    ) {
      const bucket = days.slice(
        index,
        index + bucketSize
      );

      for (const day of bucket) {
        cumulativeProfit +=
          profitByDay.get(localDateKey(day)) ?? 0;
      }

      const lastDay = bucket[bucket.length - 1];

      points.push({
        label: lastDay.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        value: Math.round(cumulativeProfit * 100) / 100,
      });
    }

    return {
      points,
      hasData: true,
    };
  }, [periodOrders, dateRange, now]);

  // ----------------------------------------------------------
  // SELECTED ORDER
  // ----------------------------------------------------------

  const selectedOrder =
    selectedOrderId === null
      ? null
      : orders.find(
          (order) => order.id === selectedOrderId
        ) ?? null;

  // ----------------------------------------------------------
  // NAVIGATION HELPERS
  // ----------------------------------------------------------

  function goToOrders(
    selectedFilter: OrderFilter = "all"
  ) {
    setFilter(selectedFilter);
    setSearch("");
    setSidebarOpen(false);

    document
      .getElementById("orders")
      ?.scrollIntoView({
        behavior: "smooth",
      });
  }

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-100">
      {/* =====================================================
          MOBILE HEADER
      ===================================================== */}

      <div className="flex items-center justify-between border-b border-white/10 bg-[#101827] px-5 py-4 lg:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Icon name="chart" />
          </div>

          <span className="text-lg font-bold">
            ProfitSync
          </span>
        </div>

        <button
          type="button"
          onClick={() =>
            setSidebarOpen(!sidebarOpen)
          }
          aria-label="Toggle navigation"
          className="relative z-50 rounded-lg border border-white/10 p-2 text-slate-300"
        >
          <Icon
            name={sidebarOpen ? "close" : "menu"}
          />
        </button>
      </div>

      {/* =====================================================
          MOBILE SIDEBAR BACKDROP
      ===================================================== */}

      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
        />
      )}

      {/* =====================================================
          SIDEBAR
      ===================================================== */}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/[0.07] bg-[#101827] transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen
            ? "translate-x-0"
            : "-translate-x-full"
        }`}
      >
        {/* Logo */}

        <div className="flex h-20 items-center gap-3 border-b border-white/[0.07] px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
            <Icon name="chart" size={22} />
          </div>

          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              ProfitSync
            </h1>

            <p className="text-[11px] tracking-widest text-slate-500">
              SELLER ANALYTICS
            </p>
          </div>
        </div>

        {/* Navigation */}

        <div className="flex-1 px-4 py-7">
          <p className="mb-4 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Workspace
          </p>

          <nav className="space-y-2">
            <a
              href="#dashboard"
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-600/15 px-4 py-3 text-sm font-semibold text-blue-400"
            >
              <Icon name="dashboard" size={19} />
              Dashboard
            </a>

            <button
              type="button"
              onClick={() => goToOrders()}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
            >
              <Icon name="orders" size={19} />
              Orders
            </button>

            <a
              href="#performance"
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
            >
              <Icon name="chart" size={19} />
              Performance
            </a>
          </nav>

          {/* Integration */}

          <div className="mt-10 rounded-2xl border border-blue-500/15 bg-blue-500/[0.06] p-4">
            <div className="mb-3 flex items-center gap-2 text-blue-400">
              <Icon name="check" size={16} />

              <span className="text-xs font-semibold">
                eBay Integration
              </span>
            </div>

            <p className="text-xs leading-5 text-slate-400">
              Synchronize your connected seller
              account and manage your imported
              orders.
            </p>

            <button
              type="button"
              onClick={() => goToOrders()}
              className="mt-4 text-xs font-semibold text-blue-400 hover:text-blue-300"
            >
              View Orders →
            </button>
          </div>
        </div>

        {/* Logout */}

        <div className="border-t border-white/[0.07] p-4">
          <button
            type="button"
            onClick={logout}
            disabled={
              loggingOut ||
              syncing ||
              savingId !== null
            }
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-400 transition hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="logout" size={18} />

            {loggingOut
              ? "Logging out..."
              : "Log out"}
          </button>

          <div className="mt-3 px-4 text-[11px] text-slate-600">
            ProfitSync Dashboard
          </div>
        </div>
      </aside>

      {/* =====================================================
          MAIN CONTENT
      ===================================================== */}

      <main
        id="dashboard"
        className="min-h-screen lg:ml-64"
      >
        <div className="mx-auto max-w-[1600px] px-5 py-7 sm:px-8 lg:px-10">
          {/* =================================================
              TOP HEADER
          ================================================= */}

          <header className="mb-9 flex flex-col gap-5 border-b border-white/[0.07] pb-7 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                <span>Workspace</span>
                <span>/</span>
                <span className="text-blue-400">
                  Dashboard
                </span>
              </div>

              <h2 className="text-3xl font-bold tracking-tight text-white">
                Dashboard Overview
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                Understand your sales, expenses,
                and profitability.
              </p>
            </div>

            <button
              type="button"
              onClick={syncEbayOrders}
              disabled={
                syncing ||
                loading ||
                loggingOut ||
                savingId !== null
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/15 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon
                name="refresh"
                size={17}
                className={
                  syncing ? "animate-spin" : ""
                }
              />

              {syncing
                ? "Syncing Orders..."
                : "Sync eBay Orders"}
            </button>
          </header>

          {/* =================================================
              NOTIFICATIONS
          ================================================= */}

          {logoutError && (
            <div
              role="alert"
              className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-400"
            >
              {logoutError}
            </div>
          )}

          {syncMessage && (
            <div
              role={syncError ? "alert" : "status"}
              className={`mb-6 rounded-xl border px-5 py-4 text-sm ${
                syncError
                  ? "border-red-500/20 bg-red-500/10 text-red-400"
                  : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
              }`}
            >
              {syncMessage}
            </div>
          )}

          {loadError && (
            <div
              role="alert"
              className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-400"
            >
              {loadError}
            </div>
          )}

          {/* =================================================
              OVERVIEW HEADER + DATE FILTER
          ================================================= */}

          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">
                Financial Overview
              </h3>

              <p className="mt-1 text-xs text-slate-500">
                Your store at a glance
              </p>
            </div>

            <div className="relative flex items-center gap-2">
              <Icon
                name="calendar"
                size={16}
                className="absolute left-3 text-slate-400"
              />

              <select
                value={dateRange}
                onChange={(event) =>
                  setDateRange(
                    event.target.value as DateRange
                  )
                }
                aria-label="Select date range"
                className="min-w-44 appearance-none rounded-xl border border-white/10 bg-[#151d2d] py-2.5 pl-10 pr-10 text-sm text-slate-200 outline-none transition focus:border-blue-500"
              >
                <option value="7d">
                  Last 7 Days
                </option>

                <option value="30d">
                  Last 30 Days
                </option>

                <option value="90d">
                  Last 90 Days
                </option>

                <option value="all">
                  All Time
                </option>
              </select>

              <Icon
                name="chevron"
                size={15}
                className="pointer-events-none absolute right-3 rotate-90 text-slate-500"
              />
            </div>
          </div>

          {/* =================================================
              FINANCIAL METRIC CARDS
          ================================================= */}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Total Revenue"
              value={money(totals.totalRevenue)}
              description={`${totals.orderCount} active orders; ${totals.refundedCount} refunded excluded`}
              icon="wallet"
              accent="blue"
            />

            <MetricCard
              title="eBay Fees"
              value={money(totals.totalFees)}
              description="Fees on non-fully-refunded orders"
              icon="dollar"
              accent="amber"
            />

            <MetricCard
              title="Product Costs"
              value={money(totals.totalProductCosts)}
              description={`${totals.completedCount} orders with saved costs`}
              icon="box"
              accent="purple"
            />

            <MetricCard
              title="Net Profit"
              value={money(totals.netProfit)}
              description={`Calculated from ${totals.completedCount} completed orders`}
              icon="trending"
              accent="green"
              featured
            />
          </div>

          {/* =================================================
              PROFIT PERFORMANCE
          ================================================= */}

          <section
            id="performance"
            className="mt-6 grid gap-5 xl:grid-cols-3"
          >
            {/* Chart */}

            <div className="rounded-2xl border border-white/[0.07] bg-[#151d2d] p-6 xl:col-span-2">
              <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Profit Performance
                  </h3>

                  <p className="mt-1 text-xs text-slate-500">
                    Cumulative net profit over time
                  </p>
                </div>

                <div className="flex items-center gap-2 rounded-full border border-emerald-500/15 bg-emerald-500/[0.07] px-3 py-1.5 text-xs font-medium text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Actual Order Data
                </div>
              </div>

              <div className="mb-6 flex flex-wrap items-end gap-5">
                <div>
                  <p className="text-xs text-slate-500">
                    Calculated Net Profit
                  </p>

                  <p
                    className={`mt-2 text-3xl font-bold ${
                      totals.netProfit >= 0
                        ? "text-white"
                        : "text-red-400"
                    }`}
                  >
                    {money(totals.netProfit)}
                  </p>
                </div>

                <div className="mb-1 rounded-lg bg-white/[0.05] px-3 py-2 text-xs text-slate-400">
                  {dateRangeLabel(dateRange)}
                </div>
              </div>

              <ProfitChart
                points={chartData.points}
                hasData={chartData.hasData}
              />

              <div className="mt-6 flex items-start gap-2 border-t border-white/[0.07] pt-5">
                <Icon
                  name="info"
                  size={15}
                  className="mt-0.5 shrink-0 text-slate-500"
                />

                <p className="text-xs leading-5 text-slate-500">
                  Chart shows cumulative estimated
                  profit from orders with saved
                  product costs. Other unrecorded
                  expenses may affect actual profit.
                </p>
              </div>
            </div>

            {/* Right-side summary */}

            <div className="flex flex-col gap-5">
              {/* Profit margin */}

              <div className="rounded-2xl border border-white/[0.07] bg-[#151d2d] p-6">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">
                    Profit Margin
                  </h3>

                  <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-400">
                    <Icon name="trending" size={19} />
                  </div>
                </div>

                <p
                  className={`text-4xl font-bold tracking-tight ${
                    totals.profitMargin >= 0
                      ? "text-white"
                      : "text-red-400"
                  }`}
                >
                  {totals.profitMargin.toFixed(1)}%
                </p>

                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Percentage of revenue kept as
                  profit on completed orders.
                </p>
              </div>

              {/* Order completion */}

              <div className="flex-1 rounded-2xl border border-white/[0.07] bg-[#151d2d] p-6">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">
                    Order Completion
                  </h3>

                  <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-400">
                    <Icon name="check" size={19} />
                  </div>
                </div>

                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-bold text-white">
                      {completionPercentage.toFixed(0)}%
                    </p>

                    <p className="mt-2 text-xs text-slate-500">
                      Costs recorded
                    </p>
                  </div>

                  <span className="text-xs text-slate-400">
                    {totals.completedCount}/
                    {totals.orderCount}
                  </span>
                </div>

                <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-300"
                    style={{
                      width: `${completionPercentage}%`,
                    }}
                  />
                </div>

                <div className="mt-6 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      Completed
                    </span>

                    <span className="font-semibold text-white">
                      {totals.completedCount}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-amber-400" />
                      Cost Needed
                    </span>

                    <span className="font-semibold text-white">
                      {totals.pendingOrders}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* =================================================
              NEEDS ATTENTION
          ================================================= */}

          <section className="mt-6">
            <div className="rounded-2xl border border-white/[0.07] bg-[#151d2d] p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Needs Attention
                  </h3>

                  <p className="mt-1 text-xs text-slate-500">
                    Tasks that help improve your
                    financial accuracy
                  </p>
                </div>

                {totals.pendingOrders > 0 ? (
                  <span className="rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-400">
                    {totals.pendingOrders} Orders
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400">
                    All Clear
                  </span>
                )}
              </div>

              {totals.pendingOrders > 0 ? (
                <button
                  type="button"
                  onClick={() => goToOrders("pending")}
                  className="flex w-full items-center justify-between gap-4 rounded-xl border border-amber-500/10 bg-amber-500/[0.035] p-4 text-left transition hover:border-amber-500/25 hover:bg-amber-500/[0.06]"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                      <Icon name="alert" size={21} />
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-white">
                        {totals.pendingOrders}{" "}
                        {totals.pendingOrders === 1
                          ? "order is"
                          : "orders are"}{" "}
                        missing product costs
                      </p>

                      <p className="mt-1 text-xs text-slate-400">
                        Add costs to calculate
                        accurate estimated profit.
                      </p>
                    </div>
                  </div>

                  <Icon
                    name="chevron"
                    size={19}
                    className="shrink-0 text-slate-400"
                  />
                </button>
              ) : (
                <div className="flex items-center gap-4 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.035] p-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                    <Icon name="check" size={21} />
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-white">
                      You're all caught up
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      Every order in this period has
                      a saved product cost.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* =================================================
              ORDER MANAGEMENT
          ================================================= */}

          <section
            id="orders"
            className="mt-7 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#151d2d]"
          >
            {/* Table header */}

            <div className="border-b border-white/[0.07] px-6 py-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Order Management
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    Review your orders and manage
                    product costs.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  {/* Search */}

                  <div className="relative">
                    <Icon
                      name="search"
                      size={18}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                    />

                    <input
                      type="search"
                      value={search}
                      onChange={(event) =>
                        setSearch(event.target.value)
                      }
                      placeholder="Search orders..."
                      aria-label="Search orders"
                      className="w-full rounded-xl border border-white/10 bg-[#0b1120] py-2.5 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-500 sm:w-64"
                    />
                  </div>

                  {/* Status filter */}

                  <div className="relative">
                    <select
                      value={filter}
                      onChange={(event) =>
                        setFilter(
                          event.target.value as OrderFilter
                        )
                      }
                      aria-label="Filter orders by status"
                      className="w-full appearance-none rounded-xl border border-white/10 bg-[#0b1120] py-2.5 pl-4 pr-10 text-sm text-slate-300 outline-none focus:border-blue-500"
                    >
                      <option value="all">
                        All Orders
                      </option>

                      <option value="completed">
                        Completed
                      </option>

                      <option value="pending">
                        Cost Needed
                      </option>
                      <option value="refunded">Refunded</option>
                    </select>

                    <Icon
                      name="chevron"
                      size={15}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-slate-500"
                    />
                  </div>
                </div>
              </div>

              {/* Summary badges */}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span className="rounded-lg bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-slate-400">
                  {filteredOrders.length} orders shown
                </span>

                <span className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400">
                  {totals.completedCount} completed
                </span>

                <span className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400">
                  {totals.pendingOrders} need costs
                </span>
                <span className="rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-400">
                  {totals.refundedCount} refunded
                </span>
              </div>
            </div>

            {/* =================================================
                ORDERS TABLE
            ================================================= */}

            {loading ? (
              <div className="py-20 text-center text-sm text-slate-400">
                Loading your eBay orders...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1200px] table-fixed">
                  <colgroup>
                    <col className="w-[36%]" />
                    <col className="w-[11%]" />
                    <col className="w-[11%]" />
                    <col className="w-[15%]" />
                    <col className="w-[11%]" />
                    <col className="w-[12%]" />
                    <col className="w-[4%]" />
                  </colgroup>

                  <thead className="bg-[#111827]">
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-6 py-4">
                        Product
                      </th>

                      <th className="px-3 py-4">
                        Sale Price
                      </th>

                      <th className="px-3 py-4">
                        eBay Fees
                      </th>

                      <th className="px-3 py-4">
                        Product Cost
                      </th>

                      <th className="px-3 py-4">
                        Profit
                      </th>

                      <th className="px-3 py-4">
                        Status
                      </th>

                      <th className="px-3 py-4">
                        <span className="sr-only">
                          Details
                        </span>
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-white/[0.06]">
                    {filteredOrders.map((order) => {
                      const refunded = isFullyRefunded(order);
                      const partialRefund = isPartiallyRefunded(order);
                      const hasSavedCost = isValidCost(
                        order.savedProductCost
                      );

                      const hasValidDraft = isValidCost(
                        order.productCost
                      );

                      const profit =
                        order.salePrice - order.refundAmount -
                        order.ebayFees - Number(order.productCost);

                      const isSaving =
                        savingId === order.id;

                      return (
                        <tr
                          key={order.id}
                          className="transition hover:bg-white/[0.025]"
                        >
                          {/* Product */}

                          <td className="px-6 py-4">
                            <div className="flex items-center gap-4">
                              <ListingImage
                                imageUrl={order.imageUrl}
                                item={order.item}
                              />

                              <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedOrderId(
                                      order.id
                                    )
                                  }
                                  className="break-words text-left text-sm font-medium leading-6 text-slate-200 transition hover:text-blue-400"
                                >
                                  {order.item}
                                </button>

                                <p className="mt-1 text-[11px] text-slate-500">
                                  {formatOrderDate(
                                    order.orderDate
                                  )}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Sale price */}

                          <td className="px-3 py-4 text-sm font-medium text-slate-200">
                            {refunded ? (
                              <span className="text-slate-500 line-through">{money(order.salePrice)}</span>
                            ) : (
                              <div>{money(Math.max(0, order.salePrice - order.refundAmount))}
                                {partialRefund && <p className="text-[11px] text-orange-400">Refund: {money(order.refundAmount)}</p>}
                              </div>
                            )}
                          </td>

                          {/* eBay fees */}

                          <td className="px-3 py-4 text-sm text-slate-400">
                            {money(order.ebayFees)}
                          </td>

                          {/* Product cost */}

                          <td className="px-3 py-4">
                            {refunded ? <span className="text-xs text-slate-500">Not required</span> : <div className="flex items-center gap-2">
                              <span className="text-sm text-slate-500">
                                $
                              </span>

                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={order.productCost}
                                placeholder="0.00"
                                aria-label={`Product cost for ${order.item}`}
                                disabled={
                                  isSaving ||
                                  syncing ||
                                  loggingOut
                                }
                                onChange={(event) =>
                                  updateProductCost(
                                    order.id,
                                    event.target.value
                                  )
                                }
                                onBlur={(event) =>
                                  saveProductCost(
                                    order.id,
                                    event.target.value
                                  )
                                }
                                onKeyDown={(event) => {
                                  if (
                                    event.key === "Enter"
                                  ) {
                                    event.currentTarget.blur();
                                  }
                                }}
                                className="w-24 rounded-lg border border-white/10 bg-[#0b1120] px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                              />

                              {isSaving && (
                                <span className="text-[11px] text-blue-400">
                                  Saving
                                </span>
                              )}
                            </div>}
                          </td>

                          {/* Profit */}

                          <td className="px-3 py-4">
                            {refunded ? (
                              <span className="text-xs text-slate-500">Excluded</span>
                            ) : hasValidDraft ? (
                              <span
                                className={`text-sm font-semibold ${
                                  profit >= 0
                                    ? "text-emerald-400"
                                    : "text-red-400"
                                }`}
                              >
                                {money(profit)}
                              </span>
                            ) : (
                              <span className="text-sm text-slate-600">
                                Pending
                              </span>
                            )}
                          </td>

                          {/* Status */}

                          <td className="px-3 py-4">
                            {refunded ? (
                              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-400">Refunded</span>
                            ) : partialRefund ? (
                              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-400">Partially Refunded</span>
                            ) : hasSavedCost ? (
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-500/10 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                Completed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-500/10 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                                Cost Needed
                              </span>
                            )}
                          </td>

                          {/* Details button */}

                          <td className="px-3 py-4">
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedOrderId(order.id)
                              }
                              aria-label={`View details for ${order.item}`}
                              className="rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-white"
                            >
                              <Icon
                                name="chevron"
                                size={18}
                              />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Empty state */}

                {filteredOrders.length === 0 && (
                  <div className="py-16 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.04] text-slate-500">
                      <Icon name="search" size={22} />
                    </div>

                    <p className="text-sm font-medium text-slate-300">
                      No orders found
                    </p>

                    <p className="mt-2 text-xs text-slate-500">
                      {orders.length === 0
                        ? "Sync your eBay account to import orders."
                        : "Try changing your date range, search, or status filter."}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* =================================================
                TABLE FOOTER
            ================================================= */}

            {!loading && filteredOrders.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-white/[0.07] bg-[#111827] px-6 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Showing {filteredOrders.length} of{" "}
                  {periodOrders.length} orders in the
                  selected period
                </span>

                <span>
                  Click a product to view details.
                  Costs save when you leave an input.
                </span>
              </div>
            )}
          </section>

          {/* =================================================
              FOOTER
          ================================================= */}

          <footer className="mt-8 flex flex-col gap-2 border-t border-white/[0.06] pt-6 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <span>
              © {new Date().getFullYear()} ProfitSync
            </span>

            <span>
              Built for smarter eBay selling.
            </span>
          </footer>
        </div>
      </main>

      {/* =====================================================
          ORDER DETAILS PANEL
      ===================================================== */}

      {selectedOrder && (
        <OrderDetailsPanel
          order={selectedOrder}
          saving={savingId === selectedOrder.id}
          syncing={syncing}
          loggingOut={loggingOut}
          onClose={() => setSelectedOrderId(null)}
          onChangeCost={updateProductCost}
          onSaveCost={saveProductCost}
        />
      )}
    </div>
  );
}