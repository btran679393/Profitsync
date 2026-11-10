"use client";

import { useSyncExternalStore } from "react";
import { Button, Notice } from "@/components/ui";

// Bump this (and the list below) when there's something new to announce.
const RELEASE = "2026-11-09";
const STORAGE_KEY = "profitsync:whats-new-seen";
const EVENT = "profitsync:whats-new";

function readSeen(): string | null {
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

// A one-time note on the Dashboard about recent features. Hidden once
// dismissed (remembered in this browser).
export default function WhatsNew({ onShortcuts, onGo }: { onShortcuts: () => void; onGo: (view: "taxes" | "orders") => void }) {
  const seen = useSyncExternalStore(subscribe, readSeen, () => RELEASE);
  if (seen === RELEASE) return null;

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, RELEASE);
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }

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
        <li>
          <button type="button" className="font-medium text-accent-ink hover:underline" onClick={() => onGo("orders")}>
            Check against eBay
          </button>{" "}
          (Orders → Import / export) compares a month with eBay&apos;s payment records.
        </li>
        <li>
          <button type="button" className="font-medium text-accent-ink hover:underline" onClick={() => onGo("taxes")}>
            Taxes
          </button>{" "}
          now cover all your stores, with a &quot;Before you file&quot; checklist.
        </li>
        <li>
          Press <kbd className="rounded border border-line-strong px-1 text-xs">Ctrl K</kbd> to jump anywhere, or{" "}
          <button type="button" className="font-medium text-accent-ink hover:underline" onClick={onShortcuts}>
            see all shortcuts
          </button>
          .
        </li>
      </ul>
    </Notice>
  );
}
