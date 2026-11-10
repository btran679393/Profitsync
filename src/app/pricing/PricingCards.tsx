"use client";

import Link from "next/link";
import { useState } from "react";
import { PLANS, yearlySavingsCents, type BillingInterval, type PaidPlanId, type PlanId } from "@/lib/billing/plans";
import { useSignedIn } from "@/components/site/useSignedIn";

const dollars = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

const ORDER: PlanId[] = ["free", "pro", "ultimate"];

// Plan cards for visitors who aren't signed in. Every button leads to
// sign-up; paying happens later from Plan & billing inside the app.
export default function PricingCards() {
  const [interval, setBillingInterval] = useState<BillingInterval>("year");
  // Signed-in sellers choose a plan in Plan & billing, not on the sign-up page.
  const signedIn = useSignedIn();

  return (
    <>
      <div className="mt-10 flex flex-col items-center gap-2">
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
        <p className="text-xs text-profit">Yearly saves up to {dollars(yearlySavingsCents("ultimate"))} a year</p>
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {ORDER.map((id) => {
          const plan = PLANS[id];
          const featured = id === "pro";
          const cents = interval === "year" ? plan.yearlyCents : plan.monthlyCents;
          return (
            <section
              key={id}
              className={`relative flex flex-col rounded-2xl border p-7 text-left ${
                featured ? "border-accent/40 bg-gradient-to-b from-accent-soft to-surface" : "border-line bg-surface"
              }`}
            >
              {featured && (
                <span className="absolute -top-3 left-7 rounded-full bg-accent px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-on-accent">
                  Most popular
                </span>
              )}
              <h2 className="text-lg font-semibold text-ink">{plan.name}</h2>
              <p className="mt-1 text-xs text-subtle">{plan.tagline}</p>
              <p className="mt-5 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight text-ink">{id === "free" ? "$0" : dollars(cents)}</span>
                <span className="text-sm text-subtle">{id === "free" ? "forever" : interval === "year" ? "/ year" : "/ month"}</span>
              </p>
              <p className="mt-1 h-4 text-xs text-profit">
                {id !== "free" && interval === "year"
                  ? `${dollars(Math.round(plan.yearlyCents / 12))}/month · save ${dollars(yearlySavingsCents(id as PaidPlanId))}`
                  : ""}
              </p>
              <ul className="mt-6 flex-1 space-y-2.5 text-sm text-ink-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-profit" aria-hidden="true">
                      <path d="M5 12l4 4L19 6" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href={signedIn ? (id === "free" ? "/" : "/#billing") : "/login?mode=signup"}
                className={`mt-7 block rounded-xl py-2.5 text-center text-sm font-semibold transition ${
                  featured
                    ? "bg-accent text-on-accent shadow-lg shadow-accent/20 hover:bg-accent-hover"
                    : "border border-line-strong text-ink hover:border-accent/40 hover:text-ink"
                }`}
              >
                {signedIn
                  ? id === "free"
                    ? "Open ProfitSync"
                    : `Choose ${plan.name}`
                  : id === "free"
                    ? "Start free"
                    : `Start with ${plan.name}`}
              </Link>
            </section>
          );
        })}
      </div>
    </>
  );
}
