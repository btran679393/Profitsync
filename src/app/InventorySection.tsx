"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Drawer,
  EmptyState,
  Field,
  IconButton,
  Input,
  LoadingRegion,
  MoneyInput,
  Notice,
  SegmentedControl,
  Select,
  Skeleton,
  StatCard,
  cn,
  useConfirm,
  useToast,
} from "@/components/ui";
import {
  MAX_ITEM_NAME_LENGTH,
  MAX_SOURCE_LENGTH,
  buildInventory,
  splitPurchaseCost,
  type InventoryItem,
  type InventorySale,
  type ItemStats,
  type Purchase,
  type PurchaseStats,
} from "@/lib/inventory";
import { type ApiListing, type Order, getShippingCost, isCanceled, isFullyRefunded, localDateKey, money } from "./dashboard/model";

type InventoryData = { enabled: boolean; purchases: Purchase[]; items: InventoryItem[] };

type Line = { key: number; name: string; quantity: string; estimate: string; ebayItemId: string };

const MONEY = /^\d+(\.\d{1,2})?$/;
const blankLine = (key: number): Line => ({ key, name: "", quantity: "1", estimate: "", ebayItemId: "" });

function prettyDate(date: string) {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function days(value: number | null) {
  if (value === null) return "—";
  const rounded = Math.round(value);
  return `${rounded} day${rounded === 1 ? "" : "s"}`;
}

async function send(method: "POST" | "PATCH" | "DELETE", body: object) {
  const response = await fetch("/api/inventory", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: { success?: boolean; error?: string; costsApplied?: number } = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

const STATUS: Record<ItemStats["status"], { label: string; tone: "neutral" | "accent" | "profit" | "warn" }> = {
  "not-listed": { label: "Not listed", tone: "warn" },
  listed: { label: "Listed", tone: "accent" },
  "sold-out": { label: "Sold out", tone: "profit" },
};

export default function InventorySection({
  orders,
  listings,
  staleAfterDays,
  onCostsApplied,
}: {
  // Every order (not just the chosen period): stock sells over months.
  orders: Order[];
  listings: ApiListing[];
  staleAfterDays: number;
  // A linked listing's cost was filled into past sales: reload orders.
  onCostsApplied: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<InventoryData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [show, setShow] = useState<"purchases" | "unsold">("purchases");
  const [open, setOpen] = useState<Set<number>>(new Set());

  // Drawers
  const [purchaseForm, setPurchaseForm] = useState<{ editing: Purchase | null } | null>(null);
  const [itemForm, setItemForm] = useState<{ purchase: Purchase; item: InventoryItem | null } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/inventory", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const body: InventoryData = await response.json();
      setData({ enabled: body.enabled !== false, purchases: body.purchases ?? [], items: body.items ?? [] });
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    // Load once when the page opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const sales = useMemo<InventorySale[]>(
    () =>
      orders
        .filter((order) => !isCanceled(order) && !isFullyRefunded(order))
        .map((order) => ({
          ebayItemId: order.ebayItemId,
          orderDate: order.orderDate,
          quantity: order.quantity,
          revenue: Math.max(0, order.salePrice - order.refundAmount),
          fees: order.ebayFees + order.otherFees,
          shipping: getShippingCost(order),
        })),
    [orders]
  );

  const report = useMemo(
    () => buildInventory(data?.purchases ?? [], data?.items ?? [], sales, localDateKey(new Date()), staleAfterDays),
    [data, sales, staleAfterDays]
  );

  const listingOptions = useMemo(
    () =>
      [...listings].sort((a, b) => (a.status === b.status ? a.title.localeCompare(b.title) : a.status === "ACTIVE" ? -1 : 1)),
    [listings]
  );
  const listingTitle = useMemo(() => new Map(listings.map((l) => [l.ebayItemId, l.title])), [listings]);

  async function afterSave(costsApplied?: number) {
    await load();
    if (costsApplied && costsApplied > 0) {
      toast.success("Costs filled in", `${costsApplied} past sale${costsApplied === 1 ? " now has" : "s now have"} this cost.`);
      onCostsApplied();
    }
  }

  async function removePurchase(stats: PurchaseStats) {
    const ok = await confirm({
      title: `Delete the ${stats.purchase.source} purchase?`,
      description: `Its ${stats.items.length} item${stats.items.length === 1 ? "" : "s"} go too. Your eBay orders and listing costs stay as they are.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await send("DELETE", { purchaseId: stats.purchase.id });
      await load();
      toast.success("Purchase deleted");
    } catch (error) {
      toast.error("Couldn't delete it", (error as Error).message);
    }
  }

  async function removeItem(stats: ItemStats) {
    const ok = await confirm({
      title: `Delete ${stats.item.name}?`,
      description: "It comes out of this purchase. Your eBay orders and listing costs stay as they are.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await send("DELETE", { itemId: stats.item.id });
      await load();
    } catch (error) {
      toast.error("Couldn't delete it", (error as Error).message);
    }
  }

  if (loadError && !data) {
    return (
      <Notice tone="loss" title="Couldn't load your inventory">
        Please try again a little later.
      </Notice>
    );
  }
  if (data && !data.enabled) {
    return (
      <Notice tone="warn" title="Inventory isn't available yet">
        Please try again a little later.
      </Notice>
    );
  }

  const { totals } = report;
  const unsold = report.items
    .filter((s) => s.remaining > 0)
    .sort((a, b) => b.daysHeld - a.daysHeld || b.unitCost * b.remaining - a.unitCost * a.remaining);

  return (
    <div className="space-y-5">
      {purchaseForm && (
        <PurchaseDrawer
          editing={purchaseForm.editing}
          listings={listingOptions}
          onClose={() => setPurchaseForm(null)}
          onSaved={async (costsApplied) => {
            setPurchaseForm(null);
            await afterSave(costsApplied);
          }}
        />
      )}
      {itemForm && (
        <ItemDrawer
          purchase={itemForm.purchase}
          item={itemForm.item}
          listings={listingOptions}
          onClose={() => setItemForm(null)}
          onSaved={async (costsApplied) => {
            setItemForm(null);
            await afterSave(costsApplied);
          }}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          value={show}
          onChange={(value) => setShow(value as "purchases" | "unsold")}
          options={[
            { value: "purchases", label: "Purchases" },
            { value: "unsold", label: "Unsold stock", count: totals.remaining },
          ]}
          label="Show"
        />
        <Button variant="primary" onClick={() => setPurchaseForm({ editing: null })} icon={<span className="text-base leading-none">+</span>}>
          Add purchase
        </Button>
      </div>

      {(!data || report.purchases.length > 0) && (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Unsold stock"
          value={money(totals.unsoldCost)}
          note={`${totals.remaining} unit${totals.remaining === 1 ? "" : "s"} · ${totals.notListedUnits} not listed`}
          loading={!data}
        />
        <StatCard
          label="Sell-through"
          value={percent(totals.sellThrough)}
          note={`${totals.sold} of ${totals.units} units bought have sold`}
          loading={!data}
        />
        <StatCard label="Average days to sell" value={days(totals.avgDaysToSell)} note="From purchase to sale" loading={!data} />
        <StatCard
          label="Profit on what's sold"
          value={money(totals.profitOnSold)}
          tone={totals.profitOnSold < 0 ? "loss" : "profit"}
          note="After eBay fees, shipping and what it cost you"
          loading={!data}
        />
      </div>
      )}

      {totals.agedUnits > 0 && (
        <Notice tone="warn" title={`${totals.agedUnits} unit${totals.agedUnits === 1 ? " hasn't" : "s haven't"} sold in ${staleAfterDays}+ days`}>
          That&apos;s {money(totals.agedCost)} of stock sitting still. Think about a price drop, a promotion or a bundle.{" "}
          <button type="button" className="font-medium underline" onClick={() => setShow("unsold")}>
            See unsold stock
          </button>
        </Notice>
      )}

      {!data ? (
        <Card>
          <LoadingRegion label="Loading inventory">
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </LoadingRegion>
        </Card>
      ) : report.purchases.length === 0 ? (
        <Card className="p-6 sm:p-8">
          <div className="mx-auto max-w-2xl">
            <h3 className="text-lg font-semibold text-ink">Track your stock from the moment you buy it</h3>
            <p className="mt-1 text-sm text-muted">Three steps, and ProfitSync shows what&apos;s left, how fast it sells and whether each purchase paid off.</p>
            <ol className="mt-5 space-y-4">
              {[
                ["Add a purchase", "A thrift run, a lot or a single item: the date, where, and what you paid in total."],
                ["List what's in it", "Each item and how many. The total is shared across them (pricier items can carry more)."],
                ["Link items to listings", "Pick the eBay listing each item sells through. Sales then count against it automatically."],
              ].map(([title, text], i) => (
                <li key={title} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-ink">{i + 1}</span>
                  <span>
                    <span className="block text-sm font-medium text-ink">{title}</span>
                    <span className="block text-sm text-muted">{text}</span>
                  </span>
                </li>
              ))}
            </ol>
            <Button variant="primary" className="mt-6" onClick={() => setPurchaseForm({ editing: null })}>
              Add your first purchase
            </Button>
          </div>
        </Card>
      ) : show === "unsold" ? (
        <Card className="overflow-hidden">
          {unsold.length === 0 ? (
            <EmptyState title="Everything you've bought has sold" description="Nice work. Add your next purchase when you restock." />
          ) : (
            <ul className="divide-y divide-line">
              {unsold.map((stats) => (
                <li key={stats.item.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink">{stats.item.name}</span>
                      <Badge tone={STATUS[stats.status].tone}>{STATUS[stats.status].label}</Badge>
                    </span>
                    <span className="block truncate text-xs text-subtle">
                      {stats.purchase.source} · bought {prettyDate(stats.purchase.purchasedOn)} ·{" "}
                      <span className={cn(stats.daysHeld >= staleAfterDays && "font-medium text-warn")}>{days(stats.daysHeld)} ago</span>
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="ps-num block text-sm font-semibold text-ink">{money(stats.unitCost * stats.remaining)}</span>
                    <span className="ps-num block text-xs text-subtle">
                      {stats.remaining} left × {money(stats.unitCost)}
                    </span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setItemForm({ purchase: stats.purchase, item: stats.item })}>
                    {stats.item.ebayItemId ? "Edit" : "Link listing"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {report.purchases.map((stats) => {
              const expanded = open.has(stats.purchase.id);
              const bar = stats.sellThrough === null ? 0 : Math.round(stats.sellThrough * 100);
              return (
                <li key={stats.purchase.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setOpen((current) => {
                        const next = new Set(current);
                        if (next.has(stats.purchase.id)) next.delete(stats.purchase.id);
                        else next.add(stats.purchase.id);
                        return next;
                      })
                    }
                    aria-expanded={expanded}
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/60 sm:px-5"
                  >
                    <span className="min-w-[12rem] flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink">{stats.purchase.source}</span>
                        {stats.paidOff ? (
                          <Badge tone="profit">Paid off</Badge>
                        ) : stats.sold > 0 ? (
                          <Badge tone="neutral">{money(-stats.paidBack)} to go</Badge>
                        ) : null}
                      </span>
                      <span className="block text-xs text-subtle">
                        {prettyDate(stats.purchase.purchasedOn)} · {stats.items.length} item{stats.items.length === 1 ? "" : "s"} · spent{" "}
                        {money(stats.spent)}
                      </span>
                    </span>
                    <span className="w-36">
                      <span className="flex justify-between text-xs text-muted">
                        <span>
                          {stats.sold}/{stats.units} sold
                        </span>
                        <span className="ps-num">{percent(stats.sellThrough)}</span>
                      </span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${bar}%` }} />
                      </span>
                    </span>
                    <span className="w-28 text-right">
                      <span className={cn("ps-num block text-sm font-semibold", stats.profitOnSold < 0 ? "text-loss" : "text-profit")}>
                        {money(stats.profitOnSold)}
                      </span>
                      <span className="block text-xs text-subtle">profit on sold</span>
                    </span>
                    <span className={cn("text-subtle transition-transform", expanded && "rotate-90")} aria-hidden="true">
                      ›
                    </span>
                  </button>

                  {expanded && (
                    <div className="border-t border-line bg-surface-2/40 px-4 py-3 sm:px-5">
                      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
                        <span>
                          Brought in <span className="ps-num font-medium text-ink">{money(stats.netProceeds)}</span> after fees and shipping
                        </span>
                        <span>
                          Unsold stock <span className="ps-num font-medium text-ink">{money(stats.unsoldCost)}</span>
                        </span>
                        <span>
                          Days to sell <span className="ps-num font-medium text-ink">{days(stats.avgDaysToSell)}</span>
                        </span>
                        {stats.purchase.note && <span>{stats.purchase.note}</span>}
                      </div>
                      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                        {stats.items.map((item) => (
                          <li key={item.item.id} className="group flex flex-wrap items-center gap-3 px-3 py-2.5">
                            <span className="min-w-[10rem] flex-1">
                              <span className="flex items-center gap-2">
                                <span className="truncate text-sm text-ink">{item.item.name}</span>
                                <Badge tone={STATUS[item.status].tone}>{STATUS[item.status].label}</Badge>
                              </span>
                              <span className="block truncate text-xs text-subtle">
                                {item.item.ebayItemId
                                  ? `eBay: ${listingTitle.get(item.item.ebayItemId) ?? `listing ${item.item.ebayItemId}`}`
                                  : "Not linked to a listing yet"}
                              </span>
                            </span>
                            <span className="ps-num w-24 text-right text-xs text-muted">
                              {item.sold}/{item.quantity} sold
                              <span className="block">{money(item.unitCost)} each</span>
                            </span>
                            <span className="ps-num w-24 text-right text-xs text-muted">
                              {days(item.avgDaysToSell)}
                              <span className="block">to sell</span>
                            </span>
                            <span className={cn("ps-num w-20 text-right text-sm font-medium", item.profit < 0 ? "text-loss" : item.sold ? "text-profit" : "text-subtle")}>
                              {item.sold ? money(item.profit) : "—"}
                            </span>
                            <span className="flex shrink-0 items-center">
                              <Button variant="ghost" size="sm" onClick={() => setItemForm({ purchase: stats.purchase, item: item.item })}>
                                {item.item.ebayItemId ? "Edit" : "Link listing"}
                              </Button>
                              <IconButton label={`Delete ${item.item.name}`} size="sm" onClick={() => void removeItem(item)} className="hover:bg-loss-soft hover:text-loss">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M3 6h18" />
                                  <path d="M8 6V4h8v2" />
                                  <path d="M19 6l-1 14H6L5 6" />
                                </svg>
                              </IconButton>
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setItemForm({ purchase: stats.purchase, item: null })}>
                          Add item
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setPurchaseForm({ editing: stats.purchase })}>
                          Edit purchase
                        </Button>
                        <Button variant="ghost" size="sm" className="text-loss" onClick={() => void removePurchase(stats)}>
                          Delete purchase
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Listing picker
// ------------------------------------------------------------------

function ListingSelect({ listings, value, onChange }: { listings: ApiListing[]; value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Not listed yet</option>
      {listings.map((listing) => (
        <option key={listing.ebayItemId} value={listing.ebayItemId}>
          {listing.title.length > 60 ? `${listing.title.slice(0, 57)}…` : listing.title}
          {listing.status === "ACTIVE" ? "" : " (ended)"}
        </option>
      ))}
    </Select>
  );
}

// ------------------------------------------------------------------
// Add / edit a purchase
// ------------------------------------------------------------------

function PurchaseDrawer({
  editing,
  listings,
  onClose,
  onSaved,
}: {
  editing: Purchase | null;
  listings: ApiListing[];
  onClose: () => void;
  onSaved: (costsApplied?: number) => Promise<void>;
}) {
  const [purchasedOn, setPurchasedOn] = useState(editing?.purchasedOn ?? localDateKey(new Date()));
  const [source, setSource] = useState(editing?.source ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [total, setTotal] = useState("");
  const [lines, setLines] = useState<Line[]>([blankLine(1)]);
  const [useAsListingCost, setUseAsListingCost] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalValid = MONEY.test(total.trim());
  const split = useMemo(() => {
    if (!totalValid) return null;
    return splitPurchaseCost(
      Math.round(Number(total) * 100),
      lines.map((line) => ({
        quantity: Math.max(1, Math.floor(Number(line.quantity)) || 1),
        estimate: MONEY.test(line.estimate.trim()) && Number(line.estimate) > 0 ? Number(line.estimate) : null,
      }))
    );
  }, [lines, total, totalValid]);
  const byEstimate = lines.every((line) => MONEY.test(line.estimate.trim()) && Number(line.estimate) > 0);
  const linesValid = lines.every((line) => line.name.trim() && Number.isInteger(Number(line.quantity)) && Number(line.quantity) >= 1);
  const linked = lines.some((line) => line.ebayItemId);

  const update = (key: number, changes: Partial<Line>) => setLines((current) => current.map((line) => (line.key === key ? { ...line, ...changes } : line)));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await send("PATCH", { purchaseId: editing.id, purchasedOn, source, note });
        await onSaved();
      } else {
        const result = await send("POST", {
          purchasedOn,
          source,
          note,
          totalPaid: total.trim(),
          useAsListingCost,
          items: lines.map((line) => ({
            name: line.name,
            quantity: Number(line.quantity),
            estimate: line.estimate.trim() || null,
            ebayItemId: line.ebayItemId || null,
          })),
        });
        await onSaved(result.costsApplied);
      }
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      size={editing ? "sm" : "lg"}
      title={editing ? "Edit purchase" : "Add a purchase"}
      description={
        editing
          ? "Change when and where you bought it. Item costs are edited on each item."
          : "A sourcing trip, a lot or a single item. What you paid is shared across the items."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="purchase-form"
            variant="primary"
            loading={saving}
            disabled={!source.trim() || (!editing && (!totalValid || !linesValid))}
          >
            {editing ? "Save changes" : "Add purchase"}
          </Button>
        </>
      }
    >
      <form id="purchase-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date">
            <Input type="date" required value={purchasedOn} max={localDateKey(new Date())} onChange={(e) => setPurchasedOn(e.target.value)} />
          </Field>
          <Field label="Where" className="sm:col-span-2">
            <Input
              data-autofocus
              required
              value={source}
              maxLength={MAX_SOURCE_LENGTH}
              placeholder="e.g. Goodwill on 5th, estate sale"
              onChange={(e) => setSource(e.target.value)}
            />
          </Field>
        </div>
        {!editing && (
          <Field label="Total paid" hint="Everything you paid for this purchase, including tax.">
            <MoneyInput required value={total} placeholder="45.00" onChange={(e) => setTotal(e.target.value)} aria-invalid={Boolean(total) && !totalValid} />
          </Field>
        )}
        <Field label="Note" optional>
          <Input value={note} maxLength={200} placeholder="e.g. Half-price day" onChange={(e) => setNote(e.target.value)} />
        </Field>

        {!editing && (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium text-ink">Items</p>
              <p className="text-xs text-subtle">{byEstimate ? "Cost split by expected price" : "Cost split evenly per unit"}</p>
            </div>
            {lines.map((line, i) => (
              <div key={line.key} className="rounded-lg border border-line bg-surface-2 p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_5rem_7rem]">
                  <Input
                    aria-label="Item name"
                    value={line.name}
                    maxLength={MAX_ITEM_NAME_LENGTH}
                    placeholder="What is it?"
                    onChange={(e) => update(line.key, { name: e.target.value })}
                  />
                  <Input
                    aria-label="Quantity"
                    type="number"
                    min={1}
                    step={1}
                    value={line.quantity}
                    onChange={(e) => update(line.key, { quantity: e.target.value })}
                  />
                  <MoneyInput
                    aria-label="Expected sale price (optional)"
                    value={line.estimate}
                    placeholder="Sells for"
                    onChange={(e) => update(line.key, { estimate: e.target.value })}
                  />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <ListingSelect listings={listings} value={line.ebayItemId} onChange={(value) => update(line.key, { ebayItemId: value })} />
                  </span>
                  <span className="ps-num w-28 shrink-0 text-right text-xs text-muted">
                    {split?.[i] ? `${money(split[i].unitCost)} each` : "—"}
                  </span>
                  {lines.length > 1 && (
                    <IconButton label="Remove this item" size="sm" onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}>
                      ✕
                    </IconButton>
                  )}
                </div>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setLines((current) => [...current, blankLine(Math.max(...current.map((l) => l.key)) + 1)])}>
              + Add another item
            </Button>
            {linked && (
              <Checkbox
                checked={useAsListingCost}
                onChange={(e) => setUseAsListingCost(e.target.checked)}
                label="Use these costs for the linked listings (and their sales since this date that don't have a cost)"
              />
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-loss">
            {error}
          </p>
        )}
      </form>
    </Drawer>
  );
}

// ------------------------------------------------------------------
// Add / edit one item
// ------------------------------------------------------------------

function ItemDrawer({
  purchase,
  item,
  listings,
  onClose,
  onSaved,
}: {
  purchase: Purchase;
  item: InventoryItem | null;
  listings: ApiListing[];
  onClose: () => void;
  onSaved: (costsApplied?: number) => Promise<void>;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1));
  const [unitCost, setUnitCost] = useState(item ? Number(item.unitCost).toFixed(2) : "");
  const [ebayItemId, setEbayItemId] = useState(item?.ebayItemId ?? "");
  const [useAsListingCost, setUseAsListingCost] = useState(!item?.ebayItemId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = name.trim() && Number.isInteger(Number(quantity)) && Number(quantity) >= 1 && MONEY.test(unitCost.trim());

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = item
        ? await send("PATCH", {
            itemId: item.id,
            name,
            quantity: Number(quantity),
            unitCost: unitCost.trim(),
            ebayItemId: ebayItemId || null,
            useAsListingCost: Boolean(ebayItemId) && useAsListingCost,
          })
        : await send("POST", {
            purchaseId: purchase.id,
            name,
            quantity: Number(quantity),
            unitCost: unitCost.trim(),
            ebayItemId: ebayItemId || null,
          });
      await onSaved(result.costsApplied);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      size="sm"
      title={item ? "Edit item" : "Add an item"}
      description={`From ${purchase.source}, ${prettyDate(purchase.purchasedOn)}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="item-form" variant="primary" loading={saving} disabled={!valid}>
            {item ? "Save changes" : "Add item"}
          </Button>
        </>
      }
    >
      <form id="item-form" onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <Input data-autofocus required value={name} maxLength={MAX_ITEM_NAME_LENGTH} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity">
            <Input type="number" min={1} step={1} required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
          <Field label="Cost each">
            <MoneyInput required value={unitCost} placeholder="4.50" onChange={(e) => setUnitCost(e.target.value)} aria-invalid={Boolean(unitCost) && !MONEY.test(unitCost.trim())} />
          </Field>
        </div>
        <Field label="eBay listing" hint="Sales of this listing count against this item, oldest purchase first.">
          <ListingSelect listings={listings} value={ebayItemId} onChange={setEbayItemId} />
        </Field>
        {item && ebayItemId && (
          <Checkbox
            checked={useAsListingCost}
            onChange={(e) => setUseAsListingCost(e.target.checked)}
            label="Use this cost for the listing (and its sales since this purchase that don't have a cost)"
          />
        )}
        {error && (
          <p role="alert" className="text-sm text-loss">
            {error}
          </p>
        )}
      </form>
    </Drawer>
  );
}
