"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ui";
import {
  PLANS,
  yearlySavingsCents,
  type BillingInterval,
  type BillingStatus,
  type PaidPlanId,
  type PlanId,
} from "@/lib/billing/plans";

const dollars = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

function prettyDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

const PLAN_ORDER: PlanId[] = ["free", "pro", "ultimate"];

async function postJson(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string; changed?: boolean };
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-profit" aria-hidden="true">
      <path d="M5 12l4 4L19 6" />
    </svg>
  );
}

function UsageBar({
  label,
  used,
  limit,
  overLabel,
}: {
  label: string;
  used: number;
  limit: number | null;
  // e.g. "locked": what the ones over the limit are called.
  overLabel?: string;
}) {
  const share = limit ? Math.min(1, used / limit) : 0;
  const full = limit !== null && used >= limit;
  const over = limit !== null && overLabel && used > limit ? ` · ${used - limit} ${overLabel}` : "";
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className={full ? "font-semibold text-warn" : "text-ink-2"}>
          {used} {limit === null ? "· unlimited" : `of ${limit}${over}`}
        </span>
      </div>
      {limit !== null && (
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
          <div className={`h-full rounded-full ${full ? "bg-warn" : "bg-accent"}`} style={{ width: `${share * 100}%` }} />
        </div>
      )}
    </div>
  );
}

export default function BillingSection({
  billing,
  loading,
  notice,
  onChanged,
}: {
  billing: BillingStatus | null;
  loading: boolean;
  // e.g. "Payment received — welcome to Pro!" after coming back from Stripe.
  notice: string;
  onChanged: () => Promise<void>;
}) {
  const [interval, setBillingInterval] = useState<BillingInterval>(billing?.interval ?? "year");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const confirm = useConfirm();

  if (loading && !billing) {
    return <div className="h-64 animate-pulse rounded-xl bg-surface-2" />;
  }

  const plan: PlanId = billing?.enabled ? billing.plan : "free";
  const enabled = Boolean(billing?.enabled);
  const comped = Boolean(billing?.comped);
  const paying = enabled && plan !== "free" && !comped;
  const limits = billing?.limits ?? PLANS.free.limits;

  async function choose(target: PaidPlanId) {
    setError("");
    setMessage("");
    if (paying) {
      const ok = await confirm({
        title: `Switch to ${PLANS[target].name} (${interval === "year" ? "yearly" : "monthly"})?`,
        description: "Stripe charges or credits the difference for the rest of your current period straight away.",
        confirmLabel: "Switch plan",
      });
      if (!ok) return;
    }
    setBusy(`${target}-${interval}`);
    try {
      const data = await postJson("/api/billing/checkout", { plan: target, interval });
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      await onChanged();
      setMessage(`You're now on ${PLANS[target].name}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start checkout.");
    } finally {
      setBusy(null);
    }
  }

  async function openPortal() {
    setError("");
    setBusy("portal");
    try {
      const data = await postJson("/api/billing/portal");
      if (data.url) window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the billing page.");
      setBusy(null);
    }
  }

  const statusLine = !enabled
    ? "Payments aren't switched on yet, so every feature is open for now."
    : comped
      ? "Included free on your account."
      : plan === "free"
        ? "Upgrade any time to unlock more stores, unlimited orders and the tax report."
        : billing?.status === "past_due"
          ? "Your last payment didn't go through. Update your card to keep your plan."
          : billing?.cancelAtPeriodEnd
            ? `Cancelled: your plan stays active until ${prettyDate(billing.currentPeriodEnd)}, then moves to Free.`
            : billing?.currentPeriodEnd
              ? `Renews ${billing.interval === "year" ? "yearly" : "monthly"} on ${prettyDate(billing.currentPeriodEnd)}.`
              : "";

  return (
    <div className="space-y-6">
      {(notice || message) && (
        <div role="status" className="rounded-xl border border-profit/30 bg-profit-soft px-5 py-4 text-sm text-profit">
          {message || notice}
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-xl border border-loss/30 bg-loss-soft px-5 py-4 text-sm text-loss">
          {error}
        </div>
      )}

      {/* Current plan + usage */}
      <section className="grid gap-6 rounded-xl border border-line bg-surface p-6 lg:grid-cols-[1fr_minmax(16rem,22rem)]">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">Your plan</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h3 className="text-2xl font-bold text-ink">{enabled ? PLANS[plan].name : "Early access"}</h3>
            {paying && billing?.interval && (
              <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-ink">
                {billing.interval === "year" ? "Yearly" : "Monthly"}
              </span>
            )}
            {billing?.status === "past_due" && (
              <span className="rounded-full bg-warn-soft px-3 py-1 text-xs font-semibold text-warn">Payment due</span>
            )}
          </div>
          <p className="mt-2 max-w-xl text-sm text-muted">{statusLine}</p>
          {paying && (
            <button
              type="button"
              onClick={() => void openPortal()}
              disabled={busy !== null}
              className="mt-4 rounded-xl border border-line-strong px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent/40 hover:text-ink disabled:opacity-50"
            >
              {busy === "portal" ? "Opening…" : "Manage billing, invoices or cancel"}
            </button>
          )}
        </div>
        <div className="space-y-4 rounded-xl bg-surface-2 p-4">
          <UsageBar label="eBay stores" used={billing?.usage.stores ?? 0} limit={enabled ? limits.maxStores : null} overLabel="locked" />
          <UsageBar label="Orders imported this month" used={billing?.usage.ordersThisMonth ?? 0} limit={enabled ? limits.monthlyOrders : null} />
          <p className="text-[11px] text-subtle">
            Order history: last {enabled && limits.historyDays < 365 ? `${limits.historyDays} days` : "12 months"}
          </p>
        </div>
      </section>

      {/* Monthly / yearly */}
      <div className="flex flex-col items-center gap-2">
        <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-xl border border-line-strong bg-surface-2 p-1">
          {(["month", "year"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={interval === value}
              onClick={() => setBillingInterval(value)}
              className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${
                interval === value ? "bg-accent text-on-accent" : "text-muted hover:text-ink"
              }`}
            >
              {value === "month" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
        <p className="text-xs text-profit">
          Yearly saves up to {dollars(yearlySavingsCents("ultimate"))} a year
        </p>
      </div>

      {/* Plans */}
      <div className="grid gap-5 lg:grid-cols-3">
        {PLAN_ORDER.map((id) => {
          const info = PLANS[id];
          const isCurrent = enabled && id === plan && (id === "free" || comped || billing?.interval === interval);
          const isCurrentOtherPeriod = enabled && id === plan && id !== "free" && !comped && billing?.interval !== interval;
          const featured = id === "pro";
          const cents = id === "free" ? 0 : interval === "year" ? info.yearlyCents : info.monthlyCents;
          const higher = PLAN_ORDER.indexOf(id) > PLAN_ORDER.indexOf(plan);
          const working = busy === `${id}-${interval}`;

          let action: React.ReactNode;
          if (!enabled) {
            action = <span className="block py-2.5 text-center text-sm text-subtle">Coming soon</span>;
          } else if (isCurrent) {
            action = (
              <span className="block rounded-xl border border-line-strong py-2.5 text-center text-sm font-semibold text-muted">
                Current plan
              </span>
            );
          } else if (comped) {
            action = <span className="block py-2.5 text-center text-sm text-subtle">Included on your account</span>;
          } else if (id === "free") {
            action = (
              <button
                type="button"
                onClick={() => void openPortal()}
                disabled={busy !== null}
                className="w-full rounded-xl border border-line-strong py-2.5 text-sm font-semibold text-ink-2 transition hover:text-ink disabled:opacity-50"
              >
                Cancel paid plan
              </button>
            );
          } else {
            action = (
              <button
                type="button"
                onClick={() => void choose(id)}
                disabled={busy !== null}
                className={`w-full rounded-xl py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
                  featured || higher
                    ? "bg-accent text-on-accent shadow-lg shadow-accent/20 hover:bg-accent-hover"
                    : "border border-line-strong text-ink hover:border-accent/40"
                }`}
              >
                {working
                  ? "One moment…"
                  : isCurrentOtherPeriod
                    ? `Switch to ${interval === "year" ? "yearly" : "monthly"}`
                    : plan === "free"
                      ? `Get ${info.name}`
                      : `${higher ? "Upgrade" : "Switch"} to ${info.name}`}
              </button>
            );
          }

          return (
            <section
              key={id}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                featured ? "border-accent/40 bg-gradient-to-b from-accent-soft to-surface" : "border-line bg-surface"
              }`}
            >
              {featured && (
                <span className="absolute -top-3 left-6 rounded-full bg-accent px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-on-accent">
                  Most popular
                </span>
              )}
              <h4 className="text-lg font-semibold text-ink">{info.name}</h4>
              <p className="mt-1 text-xs text-subtle">{info.tagline}</p>
              <p className="mt-5 flex items-baseline gap-1 whitespace-nowrap">
                <span className="text-3xl font-bold tracking-tight text-ink 2xl:text-4xl">{id === "free" ? "$0" : dollars(cents)}</span>
                <span className="text-sm text-subtle">{id === "free" ? "forever" : interval === "year" ? "/ year" : "/ month"}</span>
              </p>
              <p className="mt-1 h-4 text-xs text-profit">
                {id !== "free" && interval === "year"
                  ? `${dollars(Math.round(info.yearlyCents / 12))}/month · save ${dollars(yearlySavingsCents(id as PaidPlanId))}`
                  : ""}
              </p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm text-ink-2">
                {info.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5">
                    <Check />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-6">{action}</div>
            </section>
          );
        })}
      </div>

      <p className="text-center text-xs leading-5 text-subtle">
        Prices in US dollars. <strong className="font-medium text-muted">Paid plans renew automatically</strong> each month or
        year at the price shown until you cancel. Cancel any time here in Plan &amp; billing and keep your plan until the end
        of the period you paid for. By choosing a paid plan you agree to the{" "}
        <a href="/terms" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">Terms of Service</a>{" "}
        and{" "}
        <a href="/refunds" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">Refund policy</a>.
        Payments are handled securely by Stripe; ProfitSync never sees your card number.
      </p>
    </div>
  );
}
