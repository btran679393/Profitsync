"use client";

import { useState } from "react";
import { Badge, Button, Drawer, Field, MoneyInput, Select, cn, useConfirm } from "@/components/ui";
import { type Order, money, isValidCost, isFullyRefunded, getRefundLoss, getShippingCost, formatOrderDate } from "./model";
import { Icon } from "./Icon";
import { ListingImage } from "./ListingImage";

const smallField =
  "h-8 w-full rounded-md border bg-surface-2 pl-6 pr-6 text-xs text-ink outline-none transition-colors placeholder:text-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50";

function SavingMark({ state }: { state: "saving" | "saved" | null }) {
  return (
    <span className="absolute right-2 top-1/2 -translate-y-1/2" aria-live="polite">
      {state === "saving" ? (
        <span className="block h-3 w-3 animate-spin rounded-full border-2 border-subtle border-t-transparent" aria-label="Saving" />
      ) : state === "saved" ? (
        <Icon name="check" size={12} className="text-profit" />
      ) : null}
    </span>
  );
}

// ============================================================
// ORDER STATUS BADGE
// ============================================================

export function OrderStatusBadge({ order }: { order: Order }) {
  if (isFullyRefunded(order)) return <Badge tone="loss">Refunded</Badge>;
  return isValidCost(order.savedProductCost) ? (
    <Badge tone="profit" dot>
      Complete
    </Badge>
  ) : (
    <Badge tone="warn" dot>
      Needs cost
    </Badge>
  );
}

// ============================================================
// SHIPPING COST INPUT (shipping paid outside eBay)
// ============================================================

export function ShippingInput({
  order,
  enabled,
  onSave,
  className = "",
}: {
  order: Order;
  enabled: boolean;
  onSave: (id: number, value: string) => Promise<void>;
  className?: string;
}) {
  const [value, setValue] = useState(order.savedShippingCost);
  const [lastSaved, setLastSaved] = useState(order.savedShippingCost);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Pick up changes saved elsewhere (table vs. details panel, listing defaults).
  if (order.savedShippingCost !== lastSaved && state !== "saving") {
    setLastSaved(order.savedShippingCost);
    setValue(order.savedShippingCost);
  }

  const valid = value.trim() === "" || isValidCost(value);

  async function save() {
    const trimmed = value.trim();
    if (!valid || trimmed === lastSaved) return;
    setState("saving");
    try {
      await onSave(order.id, trimmed);
      setState("saved");
    } catch {
      setState("error");
      setValue(lastSaved);
    }
  }

  const placeholder =
    order.shippingLabelCost > 0
      ? `${order.shippingLabelCost.toFixed(2)} label`
      : order.storeShipping > 0
        ? `${order.storeShipping.toFixed(2)} default`
        : "Shipping";

  return (
    <div className={className}>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-subtle">$</span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          disabled={!enabled}
          title={
            enabled
              ? "What shipping cost you for this order (outside eBay). Leave blank to use any eBay label."
              : "Shipping costs aren't available yet."
          }
          aria-label={`Shipping cost for ${order.item}`}
          aria-invalid={!valid}
          onChange={(event) => {
            setValue(event.target.value);
            setState("idle");
          }}
          onBlur={() => void save()}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setValue(lastSaved);
          }}
          className={cn("ps-num", smallField, valid ? "border-line-strong" : "border-loss/60")}
        />
        <SavingMark state={state === "saving" ? "saving" : state === "saved" ? "saved" : null} />
      </div>
      {state === "error" && <p className="mt-1 text-[11px] text-loss">Couldn&apos;t save shipping</p>}
    </div>
  );
}

// ============================================================
// PRODUCT COST INPUT (in the orders table and on phone cards)
// ============================================================

export function CostInput({
  order,
  saving,
  saved,
  disabled,
  suggestion,
  onChange,
  onSave,
  onEnter,
}: {
  order: Order;
  saving: boolean;
  saved: boolean;
  disabled: boolean;
  suggestion: number | null;
  onChange: (id: number, value: string) => void;
  onSave: (id: number, value: string) => Promise<void> | void;
  onEnter: (input: HTMLInputElement) => void;
}) {
  const draftChanged = order.productCost !== order.savedProductCost;
  const draftValid = order.productCost.trim() === "" || isValidCost(order.productCost);
  const profit =
    order.salePrice - order.refundAmount - order.ebayFees - order.otherFees - getShippingCost(order) - Number(order.productCost);

  return (
    <div className="w-full max-w-36">
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-subtle">$</span>
        <input
          type="text"
          inputMode="decimal"
          value={order.productCost}
          placeholder="0.00"
          aria-label={`Product cost for ${order.item}`}
          aria-invalid={!draftValid}
          data-cost-input
          data-needs-cost={order.savedProductCost === "" ? "true" : undefined}
          disabled={disabled}
          onChange={(event) => onChange(order.id, event.target.value)}
          onBlur={(event) => void onSave(order.id, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onEnter(event.currentTarget);
            }
            if (event.key === "Escape") onChange(order.id, order.savedProductCost);
          }}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "ps-num",
            smallField,
            "h-9 text-sm",
            !draftValid ? "border-loss/60" : order.savedProductCost === "" ? "border-warn/50" : "border-line-strong"
          )}
        />
        <SavingMark state={saving ? "saving" : saved ? "saved" : null} />
      </div>
      {draftChanged && draftValid && order.productCost.trim() !== "" ? (
        <p className={cn("ps-num mt-1 text-[11px] font-medium", profit >= 0 ? "text-profit" : "text-loss")}>
          = {money(profit)} profit · Enter to save
        </p>
      ) : !draftValid ? (
        <p className="mt-1 text-[11px] text-loss">Like 8 or 8.50</p>
      ) : suggestion !== null ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            const cost = (suggestion * order.quantity).toFixed(2);
            onChange(order.id, cost);
            void onSave(order.id, cost);
          }}
          className="mt-1 text-[11px] font-semibold text-accent-ink hover:underline"
        >
          Use {money(suggestion * order.quantity)}
          {order.quantity > 1 ? ` (${order.quantity}×)` : ""} · last time
        </button>
      ) : null}
    </div>
  );
}

// ============================================================
// ORDER DETAILS PANEL
// ============================================================

function Line({ label, value, tone, children }: { label: React.ReactNode; value?: React.ReactNode; tone?: "loss" | "warn"; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-sm text-muted">{label}</span>
      {children ?? <span className={cn("ps-num text-sm font-medium", tone === "loss" ? "text-loss" : tone === "warn" ? "text-warn" : "text-ink")}>{value}</span>}
    </div>
  );
}

export function OrderDetailsPanel({
  order,
  saving,
  syncing,
  loggingOut,
  onClose,
  onChangeCost,
  onSaveCost,
  onSaveRefund,
  shippingEnabled,
  onSaveShipping,
}: {
  order: Order;
  saving: boolean;
  syncing: boolean;
  loggingOut: boolean;
  onClose: () => void;
  onChangeCost: (id: number, value: string) => void;
  onSaveCost: (id: number, value: string) => Promise<void>;
  shippingEnabled: boolean;
  onSaveShipping: (id: number, value: string) => Promise<void>;
  onSaveRefund: (id: number, data: { refundOutcome: string; productCost: number | null; refundShippingLoss: number; refundFeeLoss: number }) => Promise<void>;
}) {
  const [refundOutcome, setRefundOutcome] = useState(order.refundOutcome ?? "NOT_SHIPPED");
  const [lostProductCost, setLostProductCost] = useState(order.savedProductCost || "");
  const [shippingLoss, setShippingLoss] = useState(String(order.refundShippingLoss));
  const [feeLoss, setFeeLoss] = useState(String(order.refundFeeLoss));
  const [refundSaving, setRefundSaving] = useState(false);
  const [refundError, setRefundError] = useState("");
  const confirm = useConfirm();
  const validMoney = (v: string) => isValidCost(v);
  const refundValid = validMoney(shippingLoss) && validMoney(feeLoss) && (refundOutcome !== "SHIPPED_LOST" || validMoney(lostProductCost));
  async function saveRefundDetails() {
    if (!refundValid || refundSaving) return;
    setRefundSaving(true);
    setRefundError("");
    try {
      await onSaveRefund(order.id, {
        refundOutcome,
        productCost: refundOutcome === "SHIPPED_LOST" ? Number(lostProductCost) : null,
        refundShippingLoss: Number(shippingLoss),
        refundFeeLoss: Number(feeLoss),
      });
    } catch (error) {
      setRefundError(error instanceof Error ? error.message : "Could not save refund details.");
    } finally {
      setRefundSaving(false);
    }
  }
  const refunded = isFullyRefunded(order);
  const validDraft = isValidCost(order.productCost);

  const calculatedProfit =
    !refunded && validDraft
      ? order.salePrice - order.refundAmount - order.ebayFees - order.otherFees - getShippingCost(order) - Number(order.productCost)
      : null;

  const profitMargin = calculatedProfit !== null && order.salePrice > 0 ? (calculatedProfit / order.salePrice) * 100 : null;

  const hasChanges =
    validDraft && (order.savedProductCost === "" || Number(order.savedProductCost) !== Number(order.productCost));

  const disabled = saving || syncing || loggingOut || refunded;
  const refundLoss = getRefundLoss(order);

  // Anything typed here that isn't saved yet.
  const costDirty =
    !refunded &&
    order.productCost.trim() !== order.savedProductCost.trim() &&
    !(isValidCost(order.productCost) && isValidCost(order.savedProductCost) && Number(order.productCost) === Number(order.savedProductCost));
  const refundDirty =
    refunded &&
    (refundOutcome !== (order.refundOutcome ?? "NOT_SHIPPED") ||
      shippingLoss !== String(order.refundShippingLoss) ||
      feeLoss !== String(order.refundFeeLoss) ||
      (refundOutcome === "SHIPPED_LOST" && lostProductCost !== (order.savedProductCost || "")));
  const dirty = costDirty || refundDirty;

  // Closing (X, Escape or clicking outside) never silently throws work away.
  async function requestClose() {
    if (!dirty) {
      onClose();
      return;
    }
    const ok = await confirm({
      title: "Discard unsaved changes?",
      description: costDirty
        ? `The product cost you typed ($${order.productCost.trim() || "0"}) hasn't been saved.`
        : "The refund details you changed haven't been saved.",
      confirmLabel: "Discard changes",
      cancelLabel: "Keep editing",
      danger: true,
    });
    if (!ok) return;
    if (costDirty) onChangeCost(order.id, order.savedProductCost);
    onClose();
  }

  return (
    <Drawer
      open
      onClose={() => void requestClose()}
      title="Order details"
      description={order.ebayOrderId ? `Order #${order.ebayOrderId}` : "Order ID unavailable"}
      footer={
        <div className="flex w-full flex-wrap items-center gap-3">
          <span aria-live="polite" className={cn("flex items-center gap-2 text-xs", dirty ? "font-semibold text-warn" : "text-subtle")}>
            {dirty ? (
              <>
                <span className="h-2 w-2 rounded-full bg-warn" aria-hidden="true" /> Unsaved changes
              </>
            ) : (
              <>
                <Icon name="check" size={14} className="text-profit" /> All changes saved
              </>
            )}
          </span>
          <span className="ml-auto flex items-center gap-2">
            {costDirty && (
              <Button variant="ghost" onClick={() => onChangeCost(order.id, order.savedProductCost)}>
                Undo
              </Button>
            )}
            {!refunded && (
              <Button
                variant="primary"
                disabled={!hasChanges || disabled}
                loading={saving}
                onClick={() => void onSaveCost(order.id, order.productCost)}
                icon={<Icon name="save" size={16} />}
              >
                Save product cost
              </Button>
            )}
          </span>
        </div>
      }
    >
      <div className="flex items-start gap-4">
        <ListingImage imageUrl={order.imageUrl} item={order.item} size="large" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-6 text-ink">{order.item}</h3>
          <p className="mt-1 text-xs text-muted">Buyer: {order.ebayBuyerId || "Unavailable"}</p>
          <p className="mt-0.5 text-xs text-subtle">{formatOrderDate(order.orderDate)}</p>
          <div className="mt-2">
            <OrderStatusBadge order={order} />
          </div>
        </div>
      </div>

      {refunded && (
        <section className="mt-6 rounded-xl border border-loss/25 bg-loss-soft p-4">
          <h4 className="text-sm font-semibold text-ink">What happened to this refund?</h4>
          <p className="mt-1 text-xs leading-5 text-muted">Any loss you record here comes off your net profit.</p>
          <div className="mt-4 space-y-3">
            <Field label="Product outcome">
              <Select value={refundOutcome} onChange={(e) => setRefundOutcome(e.target.value)}>
                <option value="NOT_SHIPPED">Not shipped / still in inventory</option>
                <option value="SHIPPED_LOST">Shipped &amp; lost / not returned</option>
                <option value="RETURNED">Product returned / recovered</option>
              </Select>
            </Field>
            {refundOutcome === "SHIPPED_LOST" && (
              <Field label="Lost product cost">
                <MoneyInput value={lostProductCost} onChange={(e) => setLostProductCost(e.target.value)} placeholder="Cost of the lost product" aria-invalid={!validMoney(lostProductCost)} />
              </Field>
            )}
            <Field label="Shipping you didn't get back">
              <MoneyInput value={shippingLoss} onChange={(e) => setShippingLoss(e.target.value)} aria-invalid={!validMoney(shippingLoss)} />
            </Field>
            <Field label="eBay fees eBay kept" hint="Only fees eBay didn't credit back, so nothing counts twice.">
              <MoneyInput value={feeLoss} onChange={(e) => setFeeLoss(e.target.value)} aria-invalid={!validMoney(feeLoss)} />
            </Field>
          </div>
          <p className="ps-num mt-4 text-sm font-semibold text-loss">
            Estimated refund loss:{" "}
            {money((refundOutcome === "SHIPPED_LOST" ? Number(lostProductCost || 0) : 0) + Number(shippingLoss || 0) + Number(feeLoss || 0))}
          </p>
          {refundError && <p role="alert" className="mt-2 text-xs text-loss">{refundError}</p>}
          <Button
            variant="danger"
            className="mt-4 w-full"
            disabled={!refundValid || syncing || loggingOut}
            loading={refundSaving}
            onClick={() => void saveRefundDetails()}
          >
            Save refund outcome
          </Button>
        </section>
      )}

      <section className="mt-6">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-subtle">Breakdown</h4>
        <div className="mt-1 divide-y divide-line">
          <Line label="Sale price" value={money(order.salePrice)} />
          <Line label="eBay fees" value={`−${money(order.ebayFees)}`} tone="loss" />
          {order.otherFees > 0 && <Line label="Other eBay charges" value={`−${money(order.otherFees)}`} tone="loss" />}
          <Line
            label={
              <>
                Shipping
                {order.savedShippingCost === "" && order.shippingLabelCost > 0 && <span className="ml-1 text-xs text-subtle">(eBay label)</span>}
                {order.savedShippingCost === "" && order.shippingLabelCost === 0 && order.storeShipping > 0 && (
                  <span className="ml-1 text-xs text-subtle">(store default)</span>
                )}
              </>
            }
          >
            <ShippingInput order={order} enabled={shippingEnabled} onSave={onSaveShipping} className="w-32" />
          </Line>
          {order.refundAmount > 0 && <Line label="Refund issued" value={`−${money(order.refundAmount)}`} tone="warn" />}
          {!refunded && (
            <div className="py-3">
              <Field label="Product cost" hint="What you paid for this item. Profit updates as you type.">
                <MoneyInput
                  id="detail-product-cost"
                  value={order.productCost}
                  placeholder="Enter product cost"
                  disabled={disabled}
                  data-autofocus={order.savedProductCost === "" ? true : undefined}
                  onChange={(event) => onChangeCost(order.id, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (hasChanges) void onSaveCost(order.id, order.productCost);
                    }
                  }}
                  className={cn("h-10", costDirty && "border-warn/60")}
                />
              </Field>
            </div>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-line bg-surface-2 p-4">
        <p className="text-xs font-medium text-muted">Net profit</p>
        <p
          className={cn(
            "ps-num mt-1 text-2xl font-semibold tracking-tight",
            refunded
              ? refundLoss > 0
                ? "text-loss"
                : "text-subtle"
              : calculatedProfit === null
                ? "text-subtle"
                : calculatedProfit >= 0
                  ? "text-profit"
                  : "text-loss"
          )}
        >
          {refunded ? (refundLoss > 0 ? money(-refundLoss) : money(0)) : calculatedProfit === null ? "Pending" : money(calculatedProfit)}
        </p>
        <p className="mt-1 text-xs text-subtle">
          {refunded
            ? "Refunded sales aren't counted as revenue. Recorded refund losses come off net profit."
            : profitMargin === null
              ? "Add a product cost to see the margin."
              : `Margin ${profitMargin.toFixed(1)}%`}
        </p>
      </section>
    </Drawer>
  );
}
