"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui";

// Settings → Account: turn the weekly summary email on or off.
export function EmailPreferenceSetting() {
  const [weekly, setWeekly] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/email/preferences", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { weeklySummary?: boolean } | null) => {
        if (!cancelled) setWeekly(data?.weeklySummary ?? true);
      })
      .catch(() => !cancelled && setWeekly(true));
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle() {
    if (weekly === null) return;
    const next = !weekly;
    setSaving(true);
    setWeekly(next);
    try {
      const response = await fetch("/api/email/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weeklySummary: next }),
      });
      if (!response.ok) throw new Error();
      toast.success(next ? "Weekly email turned on" : "Weekly email turned off");
    } catch {
      setWeekly(!next);
      toast.error("Couldn't save that", "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">Weekly summary email</p>
        <p className="mt-0.5 text-xs text-subtle">
          Every Monday: last week&apos;s profit, your best seller, and anything that needs you (missing costs, refunds, eBay sign-ins
          running out).
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={weekly ?? false}
        aria-label="Weekly summary email"
        disabled={weekly === null || saving}
        onClick={() => void toggle()}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${weekly ? "bg-accent" : "bg-line-strong"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${weekly ? "translate-x-5" : "translate-x-0.5"}`}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
