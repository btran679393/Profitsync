"use client";

import { useSyncExternalStore } from "react";
import { Button, Notice } from "@/components/ui";
import { inDemo } from "@/lib/demo/shim";
import type { PlanLimits } from "@/lib/billing/plans";

// Bump this (and the list below) when there's something new to announce.
const RELEASE = "2026-11-17";
const STORAGE_KEY = "profitsync:whats-new-seen";
const EVENT = "profitsync:whats-new";

function readSeen(): string | null {
  if (inDemo()) return RELEASE; // Not shown in the demo.
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return RELEASE; // Storage blocked: don't nag.
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

type Target = "payouts" | "inventory" | "listings" | "expenses" | "taxes" | "billing";

// A one-time note on the Dashboard about recent features. Hidden once
// dismissed (remembered in this browser). Each line links to the page; a
// feature the seller's plan doesn't include links to the plans instead.
export default function WhatsNew({
  onGo,
  limits,
}: {
  onGo: (view: Target) => void;
  limits: Pick<PlanLimits, "payouts" | "inventory" | "buyerInterest" | "mileage" | "form1099k">;
}) {
  const seen = useSyncExternalStore(subscribe, readSeen, () => RELEASE);
  if (seen === RELEASE) return null;

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, RELEASE);
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }

  const items: Array<{ name: string; text: string; to: Target; allowed: boolean; plan: string }> = [
    { name: "Payouts", text: "money waiting at eBay and what's inside every payout.", to: "payouts", allowed: limits.payouts, plan: "Pro" },
    { name: "Inventory", text: "log what you buy, see unsold stock and which purchases paid off.", to: "inventory", allowed: limits.inventory, plan: "Pro" },
    { name: "Listings", text: "views and watchers from eBay, and the lowest offer you can accept.", to: "listings", allowed: limits.buyerInterest, plan: "Pro" },
    { name: "Mileage", text: "on Expenses: type the miles and ProfitSync works out the deduction.", to: "expenses", allowed: limits.mileage, plan: "Ultimate" },
    { name: "Form 1099-K check", text: "on Taxes: how close each eBay account is to getting one.", to: "taxes", allowed: limits.form1099k, plan: "Ultimate" },
  ];

  return (
    <Notice
      tone="accent"
      title="New in ProfitSync"
      action={
        <Button variant="secondary" size="sm" onClick={dismiss}>
          Got it
        </Button>
      }
    >
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {items.map((item) => (
          <li key={item.name}>
            <button type="button" className="font-medium text-accent-ink hover:underline" onClick={() => onGo(item.allowed ? item.to : "billing")}>
              {item.name}
            </button>
            {": "}
            {item.text}
            {!item.allowed && <span className="text-subtle"> ({item.plan})</span>}
          </li>
        ))}
      </ul>
    </Notice>
  );
}
