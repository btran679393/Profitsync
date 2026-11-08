"use client";

import { useMemo, useState } from "react";
import StoreShippingSetting from "./StoreShippingSetting";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  LoadingRegion,
  MoneyInput,
  SegmentedControl,
  Select,
  Skeleton,
  StatCard,
  cn,
} from "@/components/ui";

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
  // Stock alert: "low" = selling but only 1–2 left; "stale" = no sale in 60+ days.
  alert: "low" | "stale" | null;
};

type SortKey = "profit" | "units" | "revenue" | "margin" | "recent" | "stock";
type StatusFilter = "all" | "ACTIVE" | "selling" | "unsold" | "ENDED" | "low" | "stale";

export type ListingRange = "all" | "year" | "90d" | "30d" | "7d";

// The Listings page's own time period (shown in the page header).
export const LISTING_RANGES: ReadonlyArray<{ value: ListingRange; label: string }> = [
  { value: "all", label: "All time" },
  { value: "year", label: "This year" },
  { value: "90d", label: "90 days" },
  { value: "30d", label: "30 days" },
  { value: "7d", label: "7 days" },
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
  ["ENDED", "Ended"],
  ["low", "Running low"],
  ["stale", "Not selling"],
];

const PAGE_SIZES = [25, 50, 100] as const;

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
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-subtle">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 8 12 3 3 8v8l9 5 9-5Z" />
          <path d="m3 8 9 5 9-5" />
          <path d="M12 13v8" />
        </svg>
      </div>
    );
  }
  return (
    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-line bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- eBay listing photo */}
      <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-contain" />
    </div>
  );
}

export type ListingCostField = "unitCost" | "shippingCost";

export type SaveListingCost = (itemId: string, field: ListingCostField, value: string, applyToPast: boolean) => Promise<number>;

export type BulkSaveListingCost = (itemIds: string[], field: ListingCostField, value: string, applyToPast: boolean) => Promise<number>;

const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

// One amount shown as plain text ("$23.50") or a quiet "+ Add" link; click it
// to edit in place. Enter saves, Escape cancels. When some of this listing's
// past sales have no amount yet, a tick box offers to fill them too.
function InlineAmount({
  label,
  value,
  fallback,
  missing,
  disabled = false,
  disabledHint,
  emptyTone = "text-subtle",
  onSave,
}: {
  label: string;
  value: number | null;
  fallback: string;
  missing: number;
  disabled?: boolean;
  disabledHint?: string;
  emptyTone?: string;
  onSave: (value: string, applyToPast: boolean) => Promise<number>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [fillPast, setFillPast] = useState(true);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [note, setNote] = useState("");

  const valid = draft.trim() === "" || MONEY_PATTERN.test(draft.trim());

  async function save() {
    if (!valid) return;
    setState("saving");
    try {
      const applied = await onSave(draft.trim(), fillPast && missing > 0 && draft.trim() !== "");
      setEditing(false);
      setState("idle");
      setNote(applied > 0 ? `Filled ${applied} past sale${applied === 1 ? "" : "s"}` : "");
    } catch (error) {
      setState("error");
      setNote(error instanceof Error ? error.message : "Couldn't save");
    }
  }

  if (!editing) {
    return (
      <div className="flex items-baseline gap-2 text-xs">
        <span className="w-8 shrink-0 text-subtle">{label}</span>
        <button
          type="button"
          disabled={disabled}
          title={disabled ? disabledHint : `Edit ${label.toLowerCase()} for this listing`}
          onClick={() => {
            setDraft(value === null ? "" : value.toFixed(2));
            setFillPast(true);
            setNote("");
            setEditing(true);
          }}
          className="group inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {value !== null ? <span className="ps-num font-semibold text-ink">${value.toFixed(2)}</span> : <span className={emptyTone}>{fallback}</span>}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
        {note && <span className="text-[11px] text-profit">{note}</span>}
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="space-y-1.5 text-xs"
    >
      <div className="flex items-center gap-1.5">
        <span className="w-8 shrink-0 text-subtle">{label}</span>
        <div className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-subtle">$</span>
          <input
            autoFocus
            inputMode="decimal"
            value={draft}
            placeholder="0.00"
            aria-label={`${label} for this listing`}
            aria-invalid={!valid}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setEditing(false);
            }}
            className={cn(
              "ps-num h-7 w-[4.5rem] rounded-md border bg-surface-2 pl-5 pr-1 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20",
              valid ? "border-line-strong" : "border-loss/60"
            )}
          />
        </div>
        <Button type="submit" size="sm" variant="primary" className="h-7 w-7 px-0" disabled={!valid} loading={state === "saving"} aria-label="Save" title="Save (Enter)">
          {state === "saving" ? null : "✓"}
        </Button>
        <button type="button" onClick={() => setEditing(false)} className="rounded-md px-1 text-subtle hover:text-ink" aria-label="Cancel">
          ✕
        </button>
      </div>
      {missing > 0 && draft.trim() !== "" && (
        <label className="ml-9 flex items-center gap-1.5 text-[11px] text-muted">
          <input type="checkbox" checked={fillPast} onChange={(event) => setFillPast(event.target.checked)} className="accent-[var(--ps-accent)]" />
          Also fill {missing} past sale{missing === 1 ? "" : "s"} without one
        </label>
      )}
      {state === "error" && <p className="ml-9 text-[11px] text-loss">{note}</p>}
    </form>
  );
}

// Cost per item + shipping per order for one listing, as two quiet lines.
function CostsCell({
  row,
  onSave,
  shippingEnabled,
  storeShipping,
}: {
  row: ListingRow;
  onSave: SaveListingCost;
  shippingEnabled: boolean;
  storeShipping: number | null;
}) {
  if (!row.ebayItemId || row.status === "UNLINKED") {
    return (
      <span className="text-xs text-subtle" title="Set costs on the order itself for past sales">
        Set on each order
      </span>
    );
  }
  const itemId = row.ebayItemId;
  return (
    <div className="space-y-1">
      <InlineAmount
        label="Item"
        value={row.unitCost}
        fallback="+ Add cost"
        emptyTone={row.costMissing > 0 ? "font-semibold text-warn" : "text-accent-ink"}
        missing={row.costMissing}
        onSave={(value, applyToPast) => onSave(itemId, "unitCost", value, applyToPast)}
      />
      <InlineAmount
        label="Ship"
        value={row.shippingDefault}
        fallback={storeShipping !== null ? `$${storeShipping.toFixed(2)} default` : "+ Add"}
        missing={row.shippingMissing}
        disabled={!shippingEnabled}
        disabledHint="Shipping costs aren't available yet."
        onSave={(value, applyToPast) => onSave(itemId, "shippingCost", value, applyToPast)}
      />
    </div>
  );
}

// Shown when listings are ticked: set cost and/or shipping for all of them.
// Sticks to the bottom of the screen so it's always in reach.
function BulkBar({
  count,
  shippingEnabled,
  onApply,
  onClear,
}: {
  count: number;
  shippingEnabled: boolean;
  onApply: (unitCost: string, shippingCost: string, applyToPast: boolean) => Promise<string>;
  onClear: () => void;
}) {
  const [unitCost, setUnitCost] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [fillPast, setFillPast] = useState(true);
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [note, setNote] = useState("");

  const costValid = unitCost.trim() === "" || MONEY_PATTERN.test(unitCost.trim());
  const shipValid = shippingCost.trim() === "" || MONEY_PATTERN.test(shippingCost.trim());
  const ready = costValid && shipValid && (unitCost.trim() !== "" || shippingCost.trim() !== "");

  async function apply() {
    if (!ready) return;
    setState("saving");
    setNote("");
    try {
      const summary = await onApply(unitCost.trim(), shippingCost.trim(), fillPast);
      setState("done");
      setNote(summary);
      setUnitCost("");
      setShippingCost("");
    } catch (error) {
      setState("error");
      setNote(error instanceof Error ? error.message : "Couldn't update the listings");
    }
  }

  return (
    <div className="ps-dock" role="region" aria-label="Edit selected listings">
    <div className="animate-ps-in mx-auto max-w-4xl rounded-xl border border-accent/40 bg-elevated p-3 shadow-pop">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void apply();
        }}
        className="flex flex-col gap-3 lg:flex-row lg:items-end"
      >
        <div className="flex items-center justify-between gap-3 lg:block">
          <p className="text-sm font-semibold text-ink">
            {count} listing{count === 1 ? "" : "s"} selected
          </p>
          <button type="button" onClick={onClear} className="text-xs font-medium text-muted hover:text-ink lg:mt-0.5">
            Clear selection
          </button>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
          <label className="text-xs text-muted sm:w-28">
            <span className="mb-1 block">Cost / item</span>
            <MoneyInput value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="23.50" aria-invalid={!costValid} />
          </label>
          <label className={cn("text-xs text-muted sm:w-28", !shippingEnabled && "opacity-40")}>
            <span className="mb-1 block">Ship / order</span>
            <MoneyInput value={shippingCost} disabled={!shippingEnabled} onChange={(e) => setShippingCost(e.target.value)} placeholder="4.50" aria-invalid={!shipValid} />
          </label>
          <Checkbox className="col-span-2 text-xs sm:mb-2" checked={fillPast} onChange={(e) => setFillPast(e.target.checked)} label="Also fill past sales without one" />
        </div>
        <Button type="submit" variant="primary" disabled={!ready} loading={state === "saving"}>
          Apply
        </Button>
      </form>
      {note && <p className={cn("mt-2 text-xs", state === "error" ? "text-loss" : "text-profit")}>{note}</p>}
    </div>
    </div>
  );
}

const STATUS_BADGE: Record<ListingRow["status"], { label: string; tone: "profit" | "neutral" | "accent" }> = {
  ACTIVE: { label: "Active", tone: "profit" },
  ENDED: { label: "Ended", tone: "neutral" },
  UNLINKED: { label: "Past sale", tone: "accent" },
};

function ListingMeta({ row, staleAfterDays }: { row: ListingRow; staleAfterDays: number }) {
  const badge = STATUS_BADGE[row.status];
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-subtle">
      <Badge tone={badge.tone}>{badge.label}</Badge>
      {row.ebayItemId && (
        <a
          href={`https://www.ebay.com/itm/${row.ebayItemId}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="ps-num inline-flex items-center gap-0.5 hover:text-accent-ink"
          aria-label={`Open item ${row.ebayItemId} on eBay (new tab)`}
        >
          #{row.ebayItemId}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 17 17 7" />
            <path d="M8 7h9v9" />
          </svg>
        </a>
      )}
      {row.refundedCount > 0 && <span className="text-loss">{row.refundedCount} refunded</span>}
      {row.alert === "low" && (
        <Badge tone="warn">
          <span title="Sells well but almost out of stock">Running low · {row.available} left</span>
        </Badge>
      )}
      {row.alert === "stale" && (
        <Badge tone="neutral">
          <span title={`No sale in ${staleAfterDays}+ days. A lower price or better photos might help.`}>Not selling · {staleAfterDays}+ days</span>
        </Badge>
      )}
    </div>
  );
}

function MarginBar({ margin }: { margin: number | null }) {
  if (margin === null) return <span className="text-xs text-subtle">—</span>;
  const width = Math.max(0, Math.min(100, margin));
  return (
    <div className="w-24">
      <span className={cn("ps-num text-xs font-semibold", margin < 0 ? "text-loss" : "text-ink")}>{margin.toFixed(1)}%</span>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={cn("h-full rounded-full", margin < 15 ? "bg-warn" : "bg-profit")} style={{ width: `${margin <= 0 ? 0 : Math.max(4, width)}%` }} />
      </div>
    </div>
  );
}

export default function ListingsSection({
  rows,
  loading,
  syncing,
  range,
  hasSyncedListings,
  onRefresh,
  onSaveCost,
  shippingEnabled,
  onBulkSaveCost,
  storeShipping,
  onSaveStoreShipping,
  canSetStoreShipping = true,
  staleAfterDays = 60,
}: {
  rows: ListingRow[];
  loading: boolean;
  syncing: boolean;
  range: ListingRange;
  hasSyncedListings: boolean;
  onRefresh: () => void;
  onSaveCost: SaveListingCost;
  shippingEnabled: boolean;
  onBulkSaveCost: BulkSaveListingCost;
  storeShipping: number | null;
  onSaveStoreShipping: (value: string) => Promise<void>;
  canSetStoreShipping?: boolean;
  // Settings → Listing alerts: days without a sale before "Not selling".
  staleAfterDays?: number;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("profit");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(25);

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

  const filterCounts = useMemo<Record<StatusFilter, number>>(
    () => ({
      all: rows.length,
      selling: rows.filter((r) => r.unitsSold > 0).length,
      ACTIVE: rows.filter((r) => r.status === "ACTIVE").length,
      unsold: rows.filter((r) => r.status === "ACTIVE" && r.unitsSold === 0).length,
      ENDED: rows.filter((r) => r.status !== "ACTIVE").length,
      low: rows.filter((r) => r.alert === "low").length,
      stale: rows.filter((r) => r.alert === "stale").length,
    }),
    [rows]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (q && !r.title.toLowerCase().includes(q) && !(r.ebayItemId ?? "").includes(q)) return false;
      if (status === "ACTIVE") return r.status === "ACTIVE";
      if (status === "ENDED") return r.status !== "ACTIVE";
      if (status === "selling") return r.unitsSold > 0;
      if (status === "unsold") return r.status === "ACTIVE" && r.unitsSold === 0;
      if (status === "low") return r.alert === "low";
      if (status === "stale") return r.alert === "stale";
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

  // Paging: back to page 1 whenever what's shown changes.
  const signature = `${query}|${status}|${sort}|${pageSize}|${range}|${rows.length}`;
  const [paging, setPaging] = useState({ signature, page: 1 });
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(paging.signature === signature ? paging.page : 1, pageCount);
  const setPage = (page: number) => setPaging({ signature, page });
  const pageRows = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const from = visible.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(visible.length, currentPage * pageSize);

  // Only real eBay listings can be bulk-edited (not unmatched past sales).
  // "Select all" covers every listing that matches the filter, not just this page.
  const selectable = visible.filter((r) => r.ebayItemId && r.status !== "UNLINKED");
  const allVisibleSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.ebayItemId!));

  function toggleRow(itemId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((current) => {
      const next = new Set(current);
      for (const row of selectable) {
        if (allVisibleSelected) next.delete(row.ebayItemId!);
        else next.add(row.ebayItemId!);
      }
      return next;
    });
  }

  async function applyBulk(unitCost: string, shippingCost: string, applyToPast: boolean) {
    const ids = [...selected];
    let filled = 0;
    if (unitCost) filled += await onBulkSaveCost(ids, "unitCost", unitCost, applyToPast);
    if (shippingCost) filled += await onBulkSaveCost(ids, "shippingCost", shippingCost, applyToPast);
    return `Updated ${ids.length} listing${ids.length === 1 ? "" : "s"}` + (filled > 0 ? ` · filled ${filled} past sale${filled === 1 ? "" : "s"}` : "");
  }

  const statusOptions = FILTERS.map(([value, label]) => ({ value, label, count: filterCounts[value] }));

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Active listings"
          loading={loading}
          value={hasSyncedListings ? String(summary.activeCount) : "—"}
          note={hasSyncedListings ? `${summary.unsoldActive} with no sales in this period` : "Load your listings to see them"}
        />
        <StatCard
          label="Stock on hand"
          loading={loading}
          value={hasSyncedListings ? money(summary.stockValue) : "—"}
          note={hasSyncedListings ? `${summary.stockUnits} units at listed price` : "From your active listings"}
        />
        <StatCard
          label="Best seller"
          loading={loading}
          value={summary.bestSeller ? `${summary.bestSeller.unitsSold} sold` : "—"}
          note={<span className="line-clamp-1" title={summary.bestSeller?.title}>{summary.bestSeller?.title ?? "No sales in this period"}</span>}
        />
        <StatCard
          label="Top earner"
          loading={loading}
          tone={summary.topEarner ? (summary.topEarner.netProfit < 0 ? "loss" : "profit") : "neutral"}
          value={summary.topEarner ? money(summary.topEarner.netProfit) : "—"}
          note={<span className="line-clamp-1" title={summary.topEarner?.title}>{summary.topEarner?.title ?? "No sales in this period"}</span>}
        />
      </div>

      <Card className="overflow-hidden">
        {/* Toolbar */}
        <div className="space-y-3 border-b border-line p-4">
          <SegmentedControl label="Show listings" value={status} onChange={setStatus} options={statusOptions} wrap />
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative sm:min-w-56 sm:flex-1">
              <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title or item number" aria-label="Search listings" className="pl-9" />
            </div>
            <span className="sm:w-44">
              <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort listings">
                <option value="profit">Most profit</option>
                <option value="units">Most sold</option>
                <option value="revenue">Most revenue</option>
                <option value="margin">Best margin</option>
                <option value="recent">Recently sold</option>
                <option value="stock">Most stock left</option>
              </Select>
            </span>
            {shippingEnabled && canSetStoreShipping && <StoreShippingSetting value={storeShipping} onSave={onSaveStoreShipping} />}
          </div>
        </div>

        {loading ? (
          <LoadingRegion label="Loading listings">
            <div className="space-y-3 p-4">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-11 w-11 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          </LoadingRegion>
        ) : visible.length === 0 ? (
          rows.length === 0 ? (
            <EmptyState
              title="No listings yet"
              description="Bring in everything you have listed on eBay, with what each one has sold and earned."
              action={
                <Button variant="primary" onClick={onRefresh} loading={syncing}>
                  Load my eBay listings
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No listings match"
              description="Try another search or filter."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          )
        ) : (
          <>
            {/* Tablet and desktop: table */}
            <div className="hidden max-h-[calc(100vh-15rem)] min-h-64 overflow-auto md:block">
              <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-0 text-sm">
                <caption className="sr-only">
                  Listings, {from} to {to} of {visible.length}, sales from {RANGE_TEXT[range]}
                </caption>
                <colgroup>
                  <col className="w-11" />
                  <col />
                  <col className="w-24" />
                  <col className="w-36" />
                  <col className="w-20" />
                  <col className="hidden w-28 xl:table-column" />
                  <col className="w-28" />
                  <col className="hidden w-32 xl:table-column" />
                  <col className="hidden w-28 xl:table-column" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-surface-2 text-left text-xs text-muted">
                  <tr className="[&>th]:border-b [&>th]:border-line [&>th]:px-3 [&>th]:py-2.5 [&>th]:font-medium">
                    <th scope="col" className="pl-4">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        disabled={selectable.length === 0}
                        onChange={toggleAllVisible}
                        aria-label="Select every listing that matches the filter"
                        title="Select every listing that matches (tip: search first, e.g. “1998”)"
                        className="h-4 w-4 accent-[var(--ps-accent)]"
                      />
                    </th>
                    <th scope="col">Listing</th>
                    <th scope="col" className="text-right">Price · stock</th>
                    <th scope="col">Costs</th>
                    <th scope="col" className="text-right">Sold</th>
                    <th scope="col" className="hidden text-right xl:table-cell">Revenue</th>
                    <th scope="col" className="text-right">Net profit</th>
                    <th scope="col" className="hidden xl:table-cell">Margin</th>
                    <th scope="col" className="hidden pr-4 text-right xl:table-cell">Last sale</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => {
                    const isSelected = Boolean(row.ebayItemId && selected.has(row.ebayItemId));
                    return (
                      <tr key={row.key} className={cn("align-middle transition-colors hover:bg-surface-2/60 [&>td]:border-b [&>td]:border-line [&>td]:px-3 [&>td]:py-3", isSelected && "bg-accent-soft")}>
                        <td className="pl-4">
                          {row.ebayItemId && row.status !== "UNLINKED" && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleRow(row.ebayItemId!)}
                              aria-label={`Select ${row.title}`}
                              className="h-4 w-4 accent-[var(--ps-accent)]"
                            />
                          )}
                        </td>
                        <td>
                          <div className="flex items-center gap-3">
                            <Thumb src={row.imageUrl} alt={row.title} />
                            <div className="min-w-0">
                              <p className="line-clamp-2 font-medium leading-5 text-ink" title={row.title}>
                                {row.title}
                              </p>
                              <ListingMeta row={row} staleAfterDays={staleAfterDays} />
                            </div>
                          </div>
                        </td>
                        <td className="text-right">
                          <p className="ps-num font-medium text-ink">{row.price !== null ? money(row.price) : "—"}</p>
                          <p className="mt-0.5 text-xs text-subtle">{row.available === null ? "" : row.available === 0 ? "Out of stock" : `${row.available} left`}</p>
                        </td>
                        <td>
                          <CostsCell row={row} onSave={onSaveCost} shippingEnabled={shippingEnabled} storeShipping={storeShipping} />
                        </td>
                        <td className="text-right">
                          <p className="ps-num font-semibold text-ink">{row.unitsSold}</p>
                          <p className="mt-0.5 text-xs text-subtle">
                            {row.orderCount} order{row.orderCount === 1 ? "" : "s"}
                          </p>
                        </td>
                        <td className="ps-num hidden text-right font-medium text-ink-2 xl:table-cell">{money(row.revenue)}</td>
                        <td className="text-right">
                          <p className={cn("ps-num font-semibold", row.netProfit < 0 ? "text-loss" : row.netProfit > 0 ? "text-profit" : "text-subtle")}>{money(row.netProfit)}</p>
                          {row.costMissing > 0 ? (
                            <p className="mt-0.5 text-xs text-warn">{row.costMissing} need cost</p>
                          ) : row.unitsSold > 0 ? (
                            <p className="ps-num mt-0.5 text-xs text-subtle">{money(row.netProfit / row.unitsSold)} / unit</p>
                          ) : null}
                        </td>
                        <td className="hidden xl:table-cell">
                          <MarginBar margin={row.margin} />
                        </td>
                        <td className="hidden pr-4 text-right text-xs text-muted xl:table-cell">{relativeDate(row.lastSold)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Phones: cards */}
            <ul className="divide-y divide-line md:hidden">
              {pageRows.map((row) => {
                const isSelected = Boolean(row.ebayItemId && selected.has(row.ebayItemId));
                return (
                  <li key={row.key} className={cn("p-4", isSelected && "bg-accent-soft")}>
                    <div className="flex items-start gap-3">
                      {row.ebayItemId && row.status !== "UNLINKED" ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(row.ebayItemId!)}
                          aria-label={`Select ${row.title}`}
                          className="mt-3.5 h-4 w-4 shrink-0 accent-[var(--ps-accent)]"
                        />
                      ) : (
                        <span className="w-4 shrink-0" />
                      )}
                      <Thumb src={row.imageUrl} alt={row.title} />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium leading-5 text-ink">{row.title}</p>
                        <ListingMeta row={row} staleAfterDays={staleAfterDays} />
                      </div>
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 pl-7 text-xs">
                      <div>
                        <dt className="text-subtle">Sold</dt>
                        <dd className="ps-num font-semibold text-ink">{row.unitsSold}</dd>
                      </div>
                      <div>
                        <dt className="text-subtle">Net profit</dt>
                        <dd className={cn("ps-num font-semibold", row.netProfit < 0 ? "text-loss" : row.netProfit > 0 ? "text-profit" : "text-subtle")}>{money(row.netProfit)}</dd>
                      </div>
                      <div>
                        <dt className="text-subtle">Price · stock</dt>
                        <dd className="ps-num text-ink-2">
                          {row.price !== null ? money(row.price) : "—"}
                          {row.available !== null && ` · ${row.available}`}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3 pl-7">
                      <CostsCell row={row} onSave={onSaveCost} shippingEnabled={shippingEnabled} storeShipping={storeShipping} />
                    </div>
                  </li>
                );
              })}
            </ul>

            {selected.size > 0 && (
              <>
                <BulkBar count={selected.size} shippingEnabled={shippingEnabled} onApply={applyBulk} onClear={() => setSelected(new Set())} />
                {/* Room so the floating bar never covers the last rows. */}
                <div className="h-36 lg:h-24" aria-hidden="true" />
              </>
            )}

            {/* Paging */}
            <div className="flex flex-col gap-3 border-t border-line px-4 py-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
              <span>
                <span className="ps-num">
                  {from}–{to} of {visible.length}
                </span>{" "}
                listings · sales from {RANGE_TEXT[range]}. “Past sale” = sold items not matched to a current listing.
              </span>
              <div className="flex items-center gap-2">
                <span className="w-20">
                  <Select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number])} aria-label="Listings per page" className="h-8 text-xs">
                    {PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </Select>
                </span>
                <Button size="sm" variant="secondary" onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page">
                  ←
                </Button>
                <span className="ps-num min-w-16 text-center">
                  {currentPage} / {pageCount}
                </span>
                <Button size="sm" variant="secondary" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount} aria-label="Next page">
                  →
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
