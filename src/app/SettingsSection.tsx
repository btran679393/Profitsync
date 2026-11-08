"use client";

import { useState } from "react";
import AccountBadge from "./AccountBadge";
import { PLANS, type BillingStatus } from "@/lib/billing/plans";
import type { DefaultRange, Preferences, StartPage, ThemeChoice } from "@/lib/preferences";

const card = "rounded-2xl border border-white/[0.07] bg-[#151d2d] p-6";
const field =
  "rounded-xl border border-white/10 bg-[#0b1120] px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500";

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{title}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const THEMES: Array<{ id: ThemeChoice; label: string; swatch: string }> = [ // fixed colours: previews must not change with the theme
  { id: "dark", label: "Dark", swatch: "#0b1120" },
  { id: "light", label: "Light", swatch: "#f3f5f9" },
  { id: "system", label: "Match my device", swatch: "linear-gradient(90deg, #0b1120 50%, #f3f5f9 50%)" },
];

export default function SettingsSection({
  preferences,
  onChange,
  billing,
  storeCount,
  onOpenPlans,
  onSignOut,
}: {
  preferences: Preferences;
  onChange: (changes: Partial<Preferences>) => Promise<void>;
  billing: BillingStatus | null;
  storeCount: number;
  onOpenPlans: () => void;
  onSignOut: () => void;
}) {
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [lowStock, setLowStock] = useState(String(preferences.lowStockAt));
  const [staleDays, setStaleDays] = useState(String(preferences.staleAfterDays));
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function save(changes: Partial<Preferences>, label = "Saved") {
    setError("");
    try {
      await onChange(changes);
      setSaved(label);
      window.setTimeout(() => setSaved(""), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your settings.");
      window.setTimeout(() => setError(""), 5000);
    }
  }

  function saveNumber(raw: string, key: "lowStockAt" | "staleAfterDays", min: number, max: number, reset: (v: string) => void) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      reset(String(preferences[key]));
      setError(`Enter a whole number from ${min} to ${max}.`);
      window.setTimeout(() => setError(""), 5000);
      return;
    }
    if (n !== preferences[key]) void save({ [key]: n } as Partial<Preferences>);
  }

  async function deleteAccount() {
    setDeleting(true);
    setError("");
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: deleteText.trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Couldn't delete your account.");
      try {
        window.localStorage.clear();
      } catch {
        // ignore
      }
      window.location.replace("/login");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete your account.");
      setDeleting(false);
    }
  }

  const planName = billing?.enabled ? PLANS[billing.plan].name : "Early access";

  return (
    <div className="space-y-6">
      {/* "Saved" / error pop-up in the corner */}
      <div aria-live="polite" className="pointer-events-none fixed bottom-6 right-6 z-50">
        {(saved || error) && (
          <div
            className={`ps-fade-up rounded-xl border px-4 py-3 text-sm font-medium shadow-2xl shadow-black/40 ${
              error
                ? "border-rose-500/30 bg-[#151d2d] text-rose-400"
                : "border-emerald-500/30 bg-[#151d2d] text-emerald-400"
            }`}
          >
            {error || `✓ ${saved}`}
          </div>
        )}
      </div>

      {/* Appearance */}
      <section className={card}>
        <h3 className="text-base font-semibold text-white">Appearance</h3>
        <p className="mt-1 text-xs text-slate-500">Choose how ProfitSync looks. Saved to your account for every device.</p>
        <div role="radiogroup" aria-label="Theme" className="mt-5 grid gap-3 sm:grid-cols-3">
          {THEMES.map((theme) => {
            const active = preferences.theme === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => void save({ theme: theme.id }, "Theme saved")}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                  active ? "border-blue-500 bg-blue-500/10" : "border-white/10 hover:border-white/20"
                }`}
              >
                <span className="h-10 w-14 shrink-0 rounded-lg border border-white/15" style={{ background: theme.swatch }} aria-hidden="true" />
                <span className="text-sm font-medium text-white">{theme.label}</span>
                {active && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-auto" aria-hidden="true">
                    <path d="M5 12l4 4L19 6" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Dashboard */}
      <section className={card}>
        <h3 className="text-base font-semibold text-white">Dashboard</h3>
        <p className="mt-1 text-xs text-slate-500">What you see when you open ProfitSync.</p>
        <div className="mt-5 divide-y divide-white/[0.05]">
          <Row title="Start page" hint="The page that opens first.">
            <select
              value={preferences.startPage}
              onChange={(e) => void save({ startPage: e.target.value as StartPage })}
              aria-label="Start page"
              className={field}
            >
              <option value="dashboard">Dashboard</option>
              <option value="orders">Orders</option>
              <option value="listings">Listings</option>
              <option value="expenses">Expenses</option>
            </select>
          </Row>
          <Row title="Default date range" hint="Used on the Dashboard, Orders and Expenses pages.">
            <select
              value={preferences.defaultRange}
              onChange={(e) => void save({ defaultRange: e.target.value as DefaultRange })}
              aria-label="Default date range"
              className={field}
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time</option>
            </select>
          </Row>
        </div>
      </section>

      {/* Listing alerts */}
      <section className={card}>
        <h3 className="text-base font-semibold text-white">Listing alerts</h3>
        <p className="mt-1 text-xs text-slate-500">When the Listings page flags a listing for you.</p>
        <div className="mt-5 divide-y divide-white/[0.05]">
          <Row title="Running low" hint="Flag a listing that has sold before when this many or fewer are left.">
            <label className="flex items-center gap-2 text-sm text-slate-400">
              <input
                inputMode="numeric"
                value={lowStock}
                onChange={(e) => setLowStock(e.target.value)}
                onBlur={() => saveNumber(lowStock, "lowStockAt", 0, 50, setLowStock)}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                aria-label="Running low at"
                className={`w-20 text-center ${field}`}
              />
              left
            </label>
          </Row>
          <Row title="Not selling" hint="Flag a listing with no sale for this many days.">
            <label className="flex items-center gap-2 text-sm text-slate-400">
              <input
                inputMode="numeric"
                value={staleDays}
                onChange={(e) => setStaleDays(e.target.value)}
                onBlur={() => saveNumber(staleDays, "staleAfterDays", 7, 365, setStaleDays)}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                aria-label="Not selling after days"
                className={`w-20 text-center ${field}`}
              />
              days
            </label>
          </Row>
        </div>
      </section>

      {/* Account */}
      <section className={card}>
        <h3 className="text-base font-semibold text-white">Account</h3>
        <div className="mt-5 max-w-md">
          <AccountBadge />
        </div>
        <div className="divide-y divide-white/[0.05]">
          <Row title="Plan" hint={`${planName} · ${storeCount} eBay store${storeCount === 1 ? "" : "s"} connected`}>
            <button type="button" onClick={onOpenPlans} className={`${field} font-semibold hover:border-blue-500/40`}>
              Plan &amp; billing
            </button>
          </Row>
          <Row title="Sign out" hint="Sign out of ProfitSync on this device.">
            <button type="button" onClick={onSignOut} className={`${field} font-semibold hover:border-blue-500/40`}>
              Sign out
            </button>
          </Row>
        </div>
      </section>

      {/* Danger zone */}
      <section className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.04] p-6">
        <h3 className="text-base font-semibold text-white">Delete account</h3>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
          Permanently deletes your ProfitSync account and everything in it: orders, listings, costs, expenses and eBay
          connections. A paid plan is cancelled. Nothing changes on eBay. This can&apos;t be undone.
        </p>
        {!deleteOpen ? (
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="mt-4 rounded-xl border border-rose-500/40 px-4 py-2 text-sm font-semibold text-rose-400 transition hover:bg-rose-500/10"
          >
            Delete my account…
          </button>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              autoFocus
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              placeholder="Type DELETE"
              aria-label="Type DELETE to confirm"
              className={`w-40 ${field}`}
            />
            <button
              type="button"
              disabled={deleteText.trim() !== "DELETE" || deleting}
              onClick={() => void deleteAccount()}
              className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-40"
            >
              {deleting ? "Deleting…" : "Permanently delete"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteOpen(false);
                setDeleteText("");
              }}
              className="px-2 text-sm text-slate-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
