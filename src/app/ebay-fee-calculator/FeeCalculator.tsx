"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Checkbox, Field, Input, MoneyInput, Select, buttonClasses } from "@/components/ui";
import { FEES_CHECKED, FEE_CATEGORIES, INTERNATIONAL_FEE_PERCENT, calculateFees, feeCategory } from "@/lib/feeCalculator";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

// Text box value → number (blank or junk = 0).
const num = (text: string) => {
  const value = Number(text.replace(/[$,%\s]/g, ""));
  return Number.isFinite(value) ? value : 0;
};

function Row({ label, value, tone, strong }: { label: string; value: string; tone?: "loss" | "profit"; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 ${strong ? "text-base font-semibold" : "text-sm"}`}>
      <span className={strong ? "text-ink" : "text-muted"}>{label}</span>
      <span className={`ps-num ${tone === "loss" ? "text-loss" : tone === "profit" ? "text-profit" : "text-ink"}`}>{value}</span>
    </div>
  );
}

// `inApp`: inside ProfitSync for signed-in sellers (no sign-up pitch).
export default function FeeCalculator({ inApp = false }: { inApp?: boolean }) {
  const [categoryId, setCategoryId] = useState("most");
  const [itemPrice, setItemPrice] = useState("50");
  const [shippingCharged, setShippingCharged] = useState("0");
  const [salesTax, setSalesTax] = useState("7");
  const [itemCost, setItemCost] = useState("15");
  const [shippingLabel, setShippingLabel] = useState("6");
  const [adRate, setAdRate] = useState("0");
  const [international, setInternational] = useState(false);

  const result = useMemo(
    () =>
      calculateFees({
        categoryId,
        itemPrice: num(itemPrice),
        shippingCharged: num(shippingCharged),
        salesTaxPercent: num(salesTax),
        itemCost: num(itemCost),
        shippingLabel: num(shippingLabel),
        adRatePercent: num(adRate),
        international,
      }),
    [categoryId, itemPrice, shippingCharged, salesTax, itemCost, shippingLabel, adRate, international]
  );
  const category = feeCategory(categoryId);
  const losing = result.profit < 0;

  return (
    <div className="grid gap-6 text-left lg:grid-cols-[1.15fr_1fr]">
      {/* Inputs */}
      <section aria-label="Your sale" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="eBay category" className="sm:col-span-2" hint={category.summary}>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {FEE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sold price">
            <MoneyInput value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} aria-describedby="calc-result" />
          </Field>
          <Field label="Shipping the buyer paid" hint="0 for free shipping">
            <MoneyInput value={shippingCharged} onChange={(e) => setShippingCharged(e.target.value)} />
          </Field>
          <Field label="What you paid for the item">
            <MoneyInput value={itemCost} onChange={(e) => setItemCost(e.target.value)} />
          </Field>
          <Field label="Your shipping label">
            <MoneyInput value={shippingLabel} onChange={(e) => setShippingLabel(e.target.value)} />
          </Field>
          <Field label="Buyer's sales tax (%)" hint="eBay charges its fee on the tax too">
            <Input inputMode="decimal" className="ps-num" value={salesTax} onChange={(e) => setSalesTax(e.target.value)} />
          </Field>
          <Field label="Promoted listing ad rate (%)" hint="0 if not promoted">
            <Input inputMode="decimal" className="ps-num" value={adRate} onChange={(e) => setAdRate(e.target.value)} />
          </Field>
          <Checkbox
            className="sm:col-span-2"
            label={`Shipped outside the US without eBay International Shipping (+${INTERNATIONAL_FEE_PERCENT}%)`}
            checked={international}
            onChange={(e) => setInternational(e.target.checked)}
          />
        </div>
      </section>

      {/* Result */}
      <section
        id="calc-result"
        aria-label="Your profit"
        aria-live="polite"
        className="flex flex-col rounded-2xl border border-line bg-surface p-5 sm:p-6"
      >
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">You keep</p>
        <p className={`ps-num mt-1 text-4xl font-bold tracking-tight ${losing ? "text-loss" : "text-profit"}`}>{money(result.profit)}</p>
        <p className="mt-1 text-sm text-muted">
          {result.marginPercent === null
            ? "Enter a sold price to see your profit."
            : `${result.marginPercent}% margin${result.roiPercent === null ? "" : ` · ${result.roiPercent}% return on what you paid`}`}
        </p>

        <div className="mt-5 divide-y divide-line border-t border-line">
          <div className="py-2">
            <Row label="Buyer paid you (item + shipping)" value={money(result.youReceive)} />
            <Row label={`Sales tax (goes to the state)`} value={money(result.salesTax)} />
          </div>
          <div className="py-2">
            <Row label="Final value fee" value={`−${money(result.finalValueFee)}`} tone="loss" />
            <Row label="Per-order fee" value={`−${money(result.perOrderFee)}`} tone="loss" />
            {result.adFee > 0 && <Row label="Promoted listing fee" value={`−${money(result.adFee)}`} tone="loss" />}
            {result.internationalFee > 0 && <Row label="International fee" value={`−${money(result.internationalFee)}`} tone="loss" />}
            <Row label="Total eBay fees" value={`−${money(result.totalFees)}`} tone="loss" strong />
          </div>
          <div className="py-2">
            <Row label="Shipping label" value={`−${money(num(shippingLabel) > 0 ? num(shippingLabel) : 0)}`} tone="loss" />
            <Row label="Item cost" value={`−${money(num(itemCost) > 0 ? num(itemCost) : 0)}`} tone="loss" />
            <Row label="Profit" value={money(result.profit)} tone={losing ? "loss" : "profit"} strong />
          </div>
        </div>

        {inApp ? (
          <p className="mt-auto pt-4 text-xs leading-5 text-subtle">
            An estimate from eBay&apos;s US fee rates, checked {FEES_CHECKED}. Store subscriptions and Top Rated discounts
            aren&apos;t included. Your Orders page shows the real fees eBay charged on each sale.
          </p>
        ) : (
        <div className="mt-auto rounded-xl bg-accent-soft p-4 pt-4">
          <p className="text-sm font-semibold text-ink">Want this for every sale, automatically?</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            ProfitSync pulls in your real eBay fees, labels and refunds and shows your true profit on every order.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/login?mode=signup" className={buttonClasses("primary", "sm")}>
              Start free
            </Link>
            <Link href="/demo" className={buttonClasses("secondary", "sm")}>
              Try the demo
            </Link>
          </div>
        </div>
        )}
      </section>
    </div>
  );
}
