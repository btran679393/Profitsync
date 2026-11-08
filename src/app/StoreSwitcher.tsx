"use client";

import { useEffect, useRef, useState } from "react";

export type EbayStore = {
  id: string;
  name: string;
  username: string | null;
  active: boolean;
  needsReconnect: boolean;
};

// Starts eBay's sign-in. eBay always asks which account to use, so this
// both adds a new store and reconnects an existing one.
const CONNECT_URL = "/api/ebay/auth";

export const ALL_STORES = "__all__";

function StoreAvatar({ name, active }: { name: string; active: boolean }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
        active ? "bg-blue-600 text-white" : "bg-white/[0.06] text-slate-300"
      }`}
    >
      {name === "All" ? (
        // Four squares = every store combined.
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" />
        </svg>
      ) : (
        name.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}

export default function StoreSwitcher({
  stores,
  loading,
  onSwitch,
  onRemove,
  allStores = false,
}: {
  stores: EbayStore[];
  loading: boolean;
  allStores?: boolean;
  onSwitch: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  // Close the list when clicking anywhere else or pressing Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = stores.find((store) => store.active) ?? stores[0];
  const showingAll = allStores && stores.length > 1;
  const shownName = showingAll ? "All stores" : active?.name ?? "";

  async function remove(store: EbayStore) {
    const ok = window.confirm(
      `Remove ${store.name} from ProfitSync?

This deletes its orders, listings and costs from ProfitSync. Nothing changes on eBay, and you can add the store again later.`
    );
    if (!ok) return;
    setSwitchingId(store.id);
    setError("");
    try {
      await onRemove(store.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove the store.");
    } finally {
      setSwitchingId(null);
    }
  }

  async function choose(id: string) {
    if (showingAll ? id === ALL_STORES : id === active?.id) {
      setOpen(false);
      return;
    }
    setSwitchingId(id);
    setError("");
    try {
      await onSwitch(id);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't switch stores.");
    } finally {
      setSwitchingId(null);
    }
  }

  if (loading) {
    return <div className="mt-8 h-16 animate-pulse rounded-2xl bg-white/[0.04]" />;
  }

  // No store yet: one clear call to action.
  if (!active) {
    return (
      <div className="mt-8 rounded-2xl border border-blue-500/20 bg-blue-500/[0.07] p-4">
        <p className="text-sm font-semibold text-white">Connect your eBay store</p>
        <p className="mt-1 text-xs leading-5 text-slate-400">
          Sign in with eBay to bring in your orders, fees and listings.
        </p>
        <a
          href={CONNECT_URL}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500"
        >
          + Connect eBay store
        </a>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Store
      </p>

      <div className="relative" ref={boxRef}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 text-left transition hover:border-blue-500/30 hover:bg-white/[0.05]"
        >
          <StoreAvatar name={showingAll ? "All" : active.name} active />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-white" title={shownName}>
              {shownName}
            </span>
            <span className="block truncate text-[11px] text-slate-500">
              {showingAll ? (
                `${stores.length} stores combined · switch`
              ) : active.needsReconnect ? (
                <span className="text-amber-400">Needs reconnecting</span>
              ) : stores.length > 1 ? (
                `${stores.length} stores · switch`
              ) : (
                "eBay store"
              )}
            </span>
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`} aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {open && (
          <div
            role="listbox"
            aria-label="Your eBay stores"
            className="ps-fade-up absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#151d2d] shadow-2xl shadow-black/40"
          >
            <div className="max-h-64 overflow-y-auto p-1.5">
              {stores.length > 1 && (
                <button
                  type="button"
                  role="option"
                  aria-selected={showingAll}
                  onClick={() => void choose(ALL_STORES)}
                  disabled={switchingId !== null}
                  className={`mb-1 flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/[0.05] disabled:opacity-60 ${showingAll ? "bg-blue-500/10" : ""}`}
                >
                  <StoreAvatar name="All" active={showingAll} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-white">All stores</span>
                    <span className="block text-[11px] text-slate-500">Combined totals</span>
                  </span>
                  {switchingId === ALL_STORES ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" aria-label="Working" />
                  ) : showingAll ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Current view"><path d="M5 12l4 4L19 6" /></svg>
                  ) : null}
                </button>
              )}
              {stores.map((store) => (
                <div
                  key={store.id}
                  className={`group flex items-center rounded-xl transition hover:bg-white/[0.05] ${
                    (!showingAll && store.id === active.id) ? "bg-blue-500/10" : ""
                  }`}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={(!showingAll && store.id === active.id)}
                    onClick={() => void choose(store.id)}
                    disabled={switchingId !== null}
                    className="flex min-w-0 flex-1 items-center gap-3 px-2.5 py-2 text-left disabled:opacity-60"
                  >
                    <StoreAvatar name={store.name} active={(!showingAll && store.id === active.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-white">{store.name}</span>
                      {store.needsReconnect && <span className="block text-[11px] text-amber-400">Needs reconnecting</span>}
                    </span>
                    {switchingId === store.id ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" aria-label="Working" />
                    ) : (!showingAll && store.id === active.id) ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Current store">
                        <path d="M5 12l4 4L19 6" />
                      </svg>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(store)}
                    disabled={switchingId !== null}
                    aria-label={`Remove ${store.name}`}
                    title="Remove this store from ProfitSync"
                    className="mr-1.5 rounded-lg p-1.5 text-slate-600 opacity-0 transition hover:bg-rose-500/10 hover:text-rose-400 focus:opacity-100 group-hover:opacity-100 disabled:opacity-30"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="border-t border-white/[0.07] p-1.5">
              <a
                href={CONNECT_URL}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-semibold text-blue-400 transition hover:bg-blue-500/10 hover:text-blue-300"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-blue-500/40 text-base">+</span>
                Add eBay store
              </a>
            </div>
          </div>
        )}
      </div>

      {!showingAll && active.needsReconnect && (
        <a href={CONNECT_URL} className="mt-2 block px-3 text-xs font-semibold text-amber-400 hover:text-amber-300">
          Reconnect {active.name} →
        </a>
      )}
      {error && <p className="mt-2 px-3 text-xs text-rose-400">{error}</p>}
    </div>
  );
}
