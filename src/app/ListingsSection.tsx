"use client";

import { useMemo, useState } from "react";

// One row per eBay listing (or per item title for sales that couldn't be
// matched to a saved listing). Figures are for the dashboard's date range.
export type ListingRow = {
  key: string;
  ebayItemId: string | null;
  title: string;
  imageUrl: string | null;
  status: "ACTIVE" | "ENDED" | "UNLINKED";
  price: number | null;
  available: number | null;
  unitCost: number | null;
  shippingDefault: number | null;
  unitsSold: number;
  orderCount: number;
  revenue: number;
  fees: number;
  shipping: number;
  costs: number;
  refundedCount: number;
  refundLoss: number;
  netProfit: number;
  margin: number | null;
  costMissing: number;
  shippingMissing: number;
  lastSold: string | null;
};

type SortKey = "profit" | "units" | "revenue" | "margin" | "recent" | "stock";
type StatusFilter = "all" | "ACTIVE" | "selling" | "unsold" | "ENDED";

export type ListingRange = "all" | "year" | "90d" | "30d" | "7d";

const RANGES: ReadonlyArray<readonly [ListingRange, string]> = [
  ["all", "All time"],
  ["year", "This year"],
  ["90d", "90 days"],
  ["30d", "30 days"],
  ["7d", "7 days"],
];

const RANGE_TEXT: Record<ListingRange, string> = {
  all: "all time",
  year: "this year",
  "90d": "the last 90 days",
  "30d": "the last 30 days",
  "7d": "the last 7 days",
};

const FILTERS: ReadonlyArray<readonly [StatusFilter, string]> = [
  ["all", "All"],
  ["selling", "Sold"],
  ["ACTIVE", "Active"],
  ["unsold", "Active, not sold"],
  ["ENDED", "Ended / past"],
];

function Pills<T extends string>({
  options,
  value,
  onChange,
  label,
  counts,
}: {
  options: ReadonlyArray<readonly [T, string]>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  counts?: Partial<Record<T, number>>;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5 rounded-xl bg-[#0b1120] p-1 ring-1 ring-white/10">
      {options.map(([key, text]) => {
        const active = key === value;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={active}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              active ? "bg-blue-600 text-white shadow-sm shadow-blue-600/30" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            {text}
            {counts?.[key] !== undefined && (
              <span className={`rounded-md px-1.5 text-[10px] ${active ? "bg-white/20" : "bg-white/[0.06] text-slate-500"}`}>
                {counts[key]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

function relativeDate(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Thumb({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-500">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 8 12 3 3 8v8l9 5 9-5Z" /><path d="m3 8 9 5 9-5" /><path d="M12 13v8" />
        </svg>
      </div>
    );
  }
  return (
    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- eBay listing photo */}
      <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-contain" />
    </div>
  );
}

export type ListingCostField = "unitCost" | "shippingCost";

export type SaveListingCost = (
  itemId: string,
  field: ListingCostField,
  value: string,
  applyToPast: boolean
) => Promise<number>;

// "Cost / item" or "Ship / order" box: saves on Enter or when you click away,
// then offers to fill the same amount into this listing's past sales that
// have none.
function CostCell({
  row,
  onSave,
  field = "unitCost",
  disabled = false,
}: {
  row: ListingRow;
  onSave: SaveListingCost;
  field?: ListingCostField;
  disabled?: boolean;
}) {
  const saved = field === "unitCost" ? row.unitCost : row.shippingDefault;
  const missing = field === "unitCost" ? row.costMissing : row.shippingMissing;
  const initial = saved === null ? "" : saved.toFixed(2);
  const [value, setValue] = useState(initial);
  const [lastSaved, setLastSaved] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [note, setNote] = useState("");

  // Pick up changes made elsewhere (e.g. after a refresh).
  if (initial !== lastSaved && state !== "saving") {
    setLastSaved(initial);
    setValue(initial);
  }

  if (!row.ebayItemId || row.status === "UNLINKED") {
    return <span className="text-xs text-slate-600" title="Set costs on the order itself for past sales">—</span>;
  }
  const itemId = row.ebayItemId;
  const valid = value.trim() === "" || /^\d+(\.\d{1,2})?$/.test(value.trim());

  async function save(applyToPast: boolean) {
    const trimmed = value.trim();
    if (!valid || (!applyToPast && trimmed === lastSaved)) return;
    setState("saving");
    setNote("");
    try {
      const applied = await onSave(itemId, field, trimmed, applyToPast);
      const formatted = trimmed === "" ? "" : Number(trimmed).toFixed(2);
      setValue(formatted);
      setLastSaved(formatted);
      setState("saved");
      if (applyToPast) setNote(applied === 1 ? "Filled 1 sale" : `Filled ${applied} sales`);
    } catch (error) {
      setState("error");
      setNote(error instanceof Error ? error.message : "Couldn't save");
    }
  }

  return (
    <div className={field === "unitCost" ? "w-32" : "w-28"}>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
        <input
          inputMode="decimal"
          value={value}
          disabled={disabled}
          title={disabled ? "Run docs/sql/2026-11-07_shipping_cost.sql in Supabase to turn on shipping costs." : undefined}
          placeholder={field === "unitCost" ? "Cost" : "Ship"}
          aria-label={`${field === "unitCost" ? "Cost per item" : "Shipping per order"} for ${row.title}`}
          onChange={(e) => {
            setValue(e.target.value);
            setState("idle");
          }}
          onBlur={() => void save(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setValue(lastSaved);
              e.currentTarget.blur();
            }
          }}
          className={`w-full rounded-lg border bg-[#0b1120] py-1.5 pl-6 pr-7 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-40 ${
            valid ? "border-white/10" : "border-rose-500/60"
          }`}
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2" aria-live="polite">
          {state === "saving" && <span className="block h-3 w-3 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />}
          {state === "saved" && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-label="Saved"><path d="M5 12l4 4L19 6" /></svg>
          )}
        </span>
      </div>
      {note ? (
        <p className={`mt-1 text-[11px] ${state === "error" ? "text-rose-400" : "text-emerald-400"}`}>{note}</p>
      ) : lastSaved !== "" && missing > 0 ? (
        <button
          type="button"
          onClick={() => void save(true)}
          disabled={state === "saving"}
          className="mt-1 text-[11px] font-semibold text-blue-400 transition hover:text-blue-300"
        >
          Fill {missing} past sale{missing === 1 ? "" : "s"}
        </button>
      ) : !valid ? (
        <p className="mt-1 text-[11px] text-rose-400">Like 8 or 8.50</p>
      ) : null}
    </div>
  );
}

const STATUS_BADGE: Record<ListingRow["status"], { label: string; className: string }> = {
  ACTIVE: { label: "Active", className: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20" },
  ENDED: { label: "Ended", className: "bg-slate-500/10 text-slate-400 ring-slate-500/20" },
  UNLINKED: { label: "Past sale", className: "bg-violet-500/10 text-violet-300 ring-violet-500/20" },
};

function SummaryTile({ label, value, hint, tone = "text-white" }: { label: string; value: string; hint: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-2 truncate text-xl font-bold ${tone}`} title={value}>{value}</p>
      <p className="mt-1 truncate text-xs text-slate-500" title={hint}>{hint}</p>
    </div>
  );
}

export default function ListingsSection({
  rows,
  loading,
  syncing,
  message,
  messageIsError,
  range,
  onRangeChange,
  hasSyncedListings,
  onRefresh,
  onSaveCost,
  shippingEnabled,
}: {
  rows: ListingRow[];
  loading: boolean;
  syncing: boolean;
  message: string;
  messageIsError: boolean;
  range: ListingRange;
  onRangeChange: (range: ListingRange) => void;
  hasSyncedListings: boolean;
  onRefresh: () => void;
  onSaveCost: SaveListingCost;
  shippingEnabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("profit");

  const summary = useMemo(() => {
    const active = rows.filter((r) => r.status === "ACTIVE");
    const selling = rows.filter((r) => r.unitsSold > 0);
    const bestSeller = [...selling].sort((a, b) => b.unitsSold - a.unitsSold)[0];
    const topEarner = [...selling].sort((a, b) => b.netProfit - a.netProfit)[0];
    const stockValue = active.reduce((sum, r) => sum + (r.price ?? 0) * (r.available ?? 0), 0);
    return {
      activeCount: active.length,
      unsoldActive: active.filter((r) => r.unitsSold === 0).length,
      sellingCount: selling.length,
      bestSeller,
      topEarner,
      stockValue,
      stockUnits: active.reduce((sum, r) => sum + (r.available ?? 0), 0),
    };
  }, [rows]);

  const filterCounts = useMemo<Record<StatusFilter, number>>(() => ({
    all: rows.length,
    selling: rows.filter((r) => r.unitsSold > 0).length,
    ACTIVE: rows.filter((r) => r.status === "ACTIVE").length,
    unsold: rows.filter((r) => r.status === "ACTIVE" && r.unitsSold === 0).length,
    ENDED: rows.filter((r) => r.status !== "ACTIVE").length,
  }), [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (q && !r.title.toLowerCase().includes(q) && !(r.ebayItemId ?? "").includes(q)) return false;
      if (status === "ACTIVE") return r.status === "ACTIVE";
      if (status === "ENDED") return r.status !== "ACTIVE";
      if (status === "selling") return r.unitsSold > 0;
      if (status === "unsold") return r.status === "ACTIVE" && r.unitsSold === 0;
      return true;
    });
    const by: Record<SortKey, (r: ListingRow) => number> = {
      profit: (r) => r.netProfit,
      units: (r) => r.unitsSold,
      revenue: (r) => r.revenue,
      margin: (r) => r.margin ?? -Infinity,
      recent: (r) => (r.lastSold ? new Date(r.lastSold).getTime() : 0),
      stock: (r) => r.available ?? -1,
    };
    return filtered.sort((a, b) => by[sort](b) - by[sort](a) || a.title.localeCompare(b.title));
  }, [rows, query, status, sort]);

  return (
    <section id="listings" className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#151d2d]">
      {/* Header */}
      <div className="border-b border-white/[0.07] px-6 py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Your eBay listings</h3>
            <p className="mt-1 text-sm text-slate-500">
              Sales, revenue and profit from {RANGE_TEXT[range]}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Pills label="Time period" options={RANGES} value={range} onChange={onRangeChange} />
          <button
            type="button"
            onClick={onRefresh}
            disabled={syncing}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-500/30 bg-blue-600/15 px-4 py-2.5 text-sm font-semibold text-blue-300 transition hover:bg-blue-600/25 disabled:opacity-60"
          >
            <svg className={syncing ? "animate-spin" : ""} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" />
            </svg>
            {syncing ? "Loading listings…" : hasSyncedListings ? "Refresh listings" : "Load my eBay listings"}
          </button>
          </div>
        </div>

        {message && (
          <p className={`mt-4 rounded-xl px-4 py-2.5 text-sm ${messageIsError ? "bg-rose-500/10 text-rose-300" : "bg-emerald-500/10 text-emerald-300"}`} role="status">
            {message}
          </p>
        )}

        {/* Summary */}
        <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <SummaryTile
            label="Active listings"
            value={hasSyncedListings ? String(summary.activeCount) : "—"}
            hint={hasSyncedListings ? `${summary.unsoldActive} with no sales in this period` : "Load your listings to see them"}
          />
          <SummaryTile
            label="Stock on hand"
            value={hasSyncedListings ? money(summary.stockValue) : "—"}
            hint={hasSyncedListings ? `${summary.stockUnits} units at listed price` : "From your active listings"}
          />
          <SummaryTile
            label="Best seller"
            value={summary.bestSeller ? `${summary.bestSeller.unitsSold} sold` : "—"}
            hint={summary.bestSeller?.title ?? "No sales in this period"}
          />
          <SummaryTile
            label="Top earner"
            value={summary.topEarner ? money(summary.topEarner.netProfit) : "—"}
            hint={summary.topEarner?.title ?? "No sales in this period"}
            tone={summary.topEarner && summary.topEarner.netProfit < 0 ? "text-rose-400" : "text-emerald-400"}
          />
        </div>

        {/* Filters */}
        <div className="mt-5">
          <Pills label="Show listings" options={FILTERS} value={status} onChange={setStatus} counts={filterCounts} />
        </div>

        {/* Search + sort */}
        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title or item number…"
              aria-label="Search listings"
              className="w-full rounded-xl border border-white/10 bg-[#0b1120] py-2.5 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-500"
            />
          </div>
          <div className="flex gap-3">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort listings"
              className="rounded-xl border border-white/10 bg-[#0b1120] px-3 py-2.5 text-sm text-slate-300 outline-none focus:border-blue-500"
            >
              <option value="profit">Most profit</option>
              <option value="units">Most sold</option>
              <option value="revenue">Most revenue</option>
              <option value="margin">Best margin</option>
              <option value="recent">Recently sold</option>
              <option value="stock">Most stock left</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-20 text-center text-sm text-slate-400">Loading your listings…</div>
      ) : visible.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="text-sm font-medium text-slate-300">
            {rows.length === 0 ? "No listings yet" : "No listings match your search"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {rows.length === 0
              ? "Click “Load my eBay listings” to bring in everything you have listed."
              : "Try a different search or filter."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px]">
            <thead>
              <tr className="border-b border-white/[0.07] text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3">Listing</th>
                <th className="px-3 py-3 text-right">Price · Stock</th>
                <th className="px-3 py-3">Cost / item</th>
                <th className="px-3 py-3">Ship / order</th>
                <th className="px-3 py-3 text-right">Sold</th>
                <th className="px-3 py-3 text-right">Revenue</th>
                <th className="px-3 py-3 text-right">Fees, shipping + costs</th>
                <th className="px-3 py-3 text-right">Net profit</th>
                <th className="px-3 py-3">Margin</th>
                <th className="px-6 py-3 text-right">Last sale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {visible.map((row) => {
                const badge = STATUS_BADGE[row.status];
                const marginWidth = row.margin === null ? 0 : Math.max(0, Math.min(100, row.margin));
                return (
                  <tr key={row.key} className="align-middle transition hover:bg-white/[0.025]">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Thumb src={row.imageUrl} alt={row.title} />
                        <div className="min-w-0 max-w-[360px]">
                          <p className="truncate text-sm font-medium text-white" title={row.title}>{row.title}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${badge.className}`}>{badge.label}</span>
                            {row.ebayItemId && (
                              <a
                                href={`https://www.ebay.com/itm/${row.ebayItemId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 transition hover:text-blue-400"
                              >
                                #{row.ebayItemId}
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>
                              </a>
                            )}
                            {row.refundedCount > 0 && <span className="text-rose-400">{row.refundedCount} refunded</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-right text-sm">
                      <p className="font-medium text-slate-200">{row.price !== null ? money(row.price) : "—"}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {row.available === null ? "" : row.available === 0 ? "Out of stock" : `${row.available} left`}
                      </p>
                    </td>
                    <td className="px-3 py-4">
                      <CostCell row={row} onSave={onSaveCost} />
                    </td>
                    <td className="px-3 py-4">
                      <CostCell row={row} onSave={onSaveCost} field="shippingCost" disabled={!shippingEnabled} />
                    </td>
                    <td className="px-3 py-4 text-right text-sm">
                      <p className="font-semibold text-white">{row.unitsSold}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{row.orderCount} order{row.orderCount === 1 ? "" : "s"}</p>
                    </td>
                    <td className="px-3 py-4 text-right text-sm font-medium text-slate-200">{money(row.revenue)}</td>
                    <td className="px-3 py-4 text-right text-sm">
                      <p className="text-slate-300">{money(row.fees + row.shipping + row.costs)}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {money(row.fees)} fees{row.shipping > 0 ? ` · ${money(row.shipping)} ship` : ""}
                      </p>
                    </td>
                    <td className="px-3 py-4 text-right text-sm">
                      <p className={`font-semibold ${row.netProfit < 0 ? "text-rose-400" : row.netProfit > 0 ? "text-emerald-400" : "text-slate-400"}`}>
                        {money(row.netProfit)}
                      </p>
                      {row.costMissing > 0 ? (
                        <p className="mt-0.5 text-xs text-amber-400">{row.costMissing} need cost</p>
                      ) : row.unitsSold > 0 ? (
                        <p className="mt-0.5 text-xs text-slate-500">{money(row.netProfit / row.unitsSold)} / unit</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-4">
                      {row.margin === null ? (
                        <span className="text-xs text-slate-600">—</span>
                      ) : (
                        <div className="w-28">
                          <div className="flex items-center justify-between text-xs">
                            <span className={row.margin < 0 ? "font-semibold text-rose-400" : "font-semibold text-slate-200"}>{row.margin.toFixed(1)}%</span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                            <div
                              className={`h-full rounded-full ${row.margin < 15 ? "bg-amber-400" : "bg-emerald-400"}`}
                              style={{ width: `${row.margin <= 0 ? 0 : Math.max(4, marginWidth)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-xs text-slate-400">{relativeDate(row.lastSold)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col gap-1 border-t border-white/[0.07] px-6 py-4 text-xs text-slate-500 sm:flex-row sm:justify-between">
        <span>
          {visible.length} of {rows.length} listings shown. Profit uses the same rules as your dashboard totals.
        </span>
        <span>“Past sale” = sold items not matched to a current listing yet.</span>
      </div>
    </section>
  );
}
