"use client";

// Moved out of page.tsx unchanged (redesign phase 1).
import { useState } from "react";
import { type Order, money, isValidCost, isFullyRefunded, getRefundLoss, isPartiallyRefunded, getShippingCost, formatOrderDate } from "./model";
import { Icon } from "./Icon";
import { ListingImage } from "./ListingImage";

// ============================================================
// ORDER DETAILS PANEL
// ============================================================

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
      ? `${order.shippingLabelCost.toFixed(2)} eBay label`
      : order.storeShipping > 0
        ? `${order.storeShipping.toFixed(2)} default`
        : "Shipping";

  return (
    <div className={className}>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">$</span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          disabled={!enabled}
          title={
            enabled
              ? "What shipping cost you for this order (outside eBay). Leave blank to use any eBay label."
              : "Run docs/sql/2026-11-07_shipping_cost.sql in Supabase to turn on shipping costs."
          }
          aria-label={`Shipping cost for ${order.item}`}
          onChange={(event) => {
            setValue(event.target.value);
            setState("idle");
          }}
          onBlur={() => void save()}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setValue(lastSaved);
          }}
          className={`w-full rounded-lg border bg-[#0b1120] py-1.5 pl-6 pr-6 text-xs text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-40 ${
            valid ? "border-white/10" : "border-red-500/60"
          }`}
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2" aria-live="polite">
          {state === "saving" ? (
            <span className="block h-3 w-3 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" aria-label="Saving" />
          ) : state === "saved" ? (
            <Icon name="check" size={12} className="text-emerald-400" />
          ) : null}
        </span>
      </div>
      {state === "error" && <p className="mt-1 text-[11px] text-red-400">Couldn&apos;t save shipping</p>}
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
  const validMoney = (v: string) => isValidCost(v);
  const refundValid = validMoney(shippingLoss) && validMoney(feeLoss) &&
    (refundOutcome !== "SHIPPED_LOST" || validMoney(lostProductCost));
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
  const partialRefund = isPartiallyRefunded(order);
  const hasSavedCost = isValidCost(
    order.savedProductCost
  );

  const validDraft = isValidCost(order.productCost);

  const calculatedProfit = !refunded && validDraft
    ? order.salePrice - order.refundAmount -
      order.ebayFees - order.otherFees - getShippingCost(order) - Number(order.productCost)
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

              <p className="mt-1 text-xs text-slate-400">
                Buyer: {order.ebayBuyerId || "Unavailable"}
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

          {refunded && (
            <div className="mt-6 rounded-2xl border border-rose-500/20 bg-[#151d2d] p-5">
              <h4 className="text-sm font-semibold text-white">Refund Loss Tracking</h4>
              <p className="mt-2 text-xs text-slate-400">Choose what happened to the product. These expenses reduce your overall net profit.</p>
              <label className="mt-4 block text-xs text-slate-300" htmlFor="refund-outcome">Product outcome</label>
              <select id="refund-outcome" value={refundOutcome} onChange={e => setRefundOutcome(e.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1120] p-3 text-sm text-white">
                <option value="NOT_SHIPPED">Not shipped / Still in inventory</option>
                <option value="SHIPPED_LOST">Shipped &amp; lost / Not returned</option>
                <option value="RETURNED">Product returned / Recovered</option>
              </select>
              {refundOutcome === "SHIPPED_LOST" && (
                <label className="mt-4 block text-xs text-slate-300">Lost product cost ($)
                  <input type="number" min="0" step="0.01" value={lostProductCost} onChange={e => setLostProductCost(e.target.value)}
                    placeholder="Cost of the lost product" className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1120] p-3 text-sm text-white" />
                </label>
              )}
              <label className="mt-4 block text-xs text-slate-300">Unrecovered shipping expenses ($)
                <input type="number" min="0" step="0.01" value={shippingLoss} onChange={e => setShippingLoss(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1120] p-3 text-sm text-white" />
              </label>
              <label className="mt-4 block text-xs text-slate-300">eBay fees actually retained ($)
                <input type="number" min="0" step="0.01" value={feeLoss} onChange={e => setFeeLoss(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1120] p-3 text-sm text-white" />
              </label>
              <p className="mt-4 text-sm font-semibold text-rose-400">Estimated refund loss: {money((refundOutcome === "SHIPPED_LOST" ? Number(lostProductCost || 0) : 0) + Number(shippingLoss || 0) + Number(feeLoss || 0))}</p>
              <p className="mt-1 text-xs text-slate-500">Only enter fees eBay did not credit back. Avoid counting refunded fees twice.</p>
              {refundError && <p role="alert" className="mt-3 text-xs text-red-400">{refundError}</p>}
              <button type="button" disabled={!refundValid || refundSaving || syncing || loggingOut}
                onClick={() => void saveRefundDetails()}
                className="mt-4 w-full rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">
                {refundSaving ? "Saving refund..." : "Save Refund Outcome"}
              </button>
            </div>
          )}

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

              {order.otherFees > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Other eBay Charges</span>
                  <span className="text-sm font-semibold text-red-400">−{money(order.otherFees)}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-400">
                  Shipping
                  {order.savedShippingCost === "" && order.shippingLabelCost > 0 && (
                    <span className="ml-1 text-xs text-slate-500">(eBay label)</span>
                  )}
                  {order.savedShippingCost === "" && order.shippingLabelCost === 0 && order.storeShipping > 0 && (
                    <span className="ml-1 text-xs text-slate-500">(store default)</span>
                  )}
                </span>
                <ShippingInput
                  order={order}
                  enabled={shippingEnabled}
                  onSave={onSaveShipping}
                  className="w-36"
                />
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
                refunded
                  ? (getRefundLoss(order) > 0 ? "text-red-400" : "text-slate-500")
                  : calculatedProfit === null
                  ? "text-slate-500"
                  : calculatedProfit >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
              }`}
            >
              {refunded ? (getRefundLoss(order) > 0 ? money(-getRefundLoss(order)) : money(0)) : calculatedProfit === null
                ? "Pending"
                : money(calculatedProfit)}
            </p>

            <p className="mt-2 text-xs text-slate-500">
              {refunded ? "Refunded sale excluded from revenue. Recorded refund losses are deducted from net profit." : profitMargin === null
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
              and product costs. Refunded sales are excluded from dashboard reporting.
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
