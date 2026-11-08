"use client";

import { useEffect, useRef, useState } from "react";
import { cn, useConfirm, useToast } from "@/components/ui";
import { MARKETPLACES } from "./shell/nav";

export type EbayStore = {
  id: string;
  name: string;
  username: string | null;
  active: boolean;
  needsReconnect: boolean;
  // Beyond the plan's store limit: kept, but can't be opened until upgrading.
  locked?: boolean;
};

// Starts eBay's sign-in. eBay always asks which account to use, so this
// both adds a new store and reconnects an existing one.
const CONNECT_URL = "/api/ebay/auth";

export const ALL_STORES = "__all__";

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-subtle" aria-label="Needs an upgrade">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-accent-ink" aria-label="Current">
      <path d="M5 12l4 4L19 6" />
    </svg>
  );
}

// Store initials, with a small marketplace dot (eBay today; Shopify, Amazon
// and Etsy later) so several channels can sit side by side.
function StoreAvatar({ name, all = false, size = "md" }: { name: string; all?: boolean; size?: "sm" | "md" }) {
  const marketplace = MARKETPLACES.ebay;
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-lg bg-surface-2 font-semibold text-ink-2 ring-1 ring-line",
        size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs"
      )}
    >
      {all ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="3" y="3" width="8" height="8" rx="1.5" />
          <rect x="13" y="3" width="8" height="8" rx="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" />
          <rect x="13" y="13" width="8" height="8" rx="1.5" />
        </svg>
      ) : (
        name.slice(0, 2).toUpperCase()
      )}
      {!all && (
        <span
          className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface"
          style={{ background: marketplace.color }}
          title={marketplace.name}
          aria-hidden="true"
        />
      )}
    </span>
  );
}

// The channel switcher in the top bar: which connected store you're
// looking at, every store combined, or add another.
export default function StoreSwitcher({
  stores,
  loading,
  onSwitch,
  onRemove,
  allStores = false,
  canUseAllStores = true,
  atStoreLimit = false,
  onUpgrade,
}: {
  stores: EbayStore[];
  loading: boolean;
  allStores?: boolean;
  // The plan includes the combined "All stores" view.
  canUseAllStores?: boolean;
  // Adding another store needs a bigger plan.
  atStoreLimit?: boolean;
  onUpgrade?: () => void;
  onSwitch: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirm = useConfirm();
  const toast = useToast();

  // Close the list when clicking anywhere else or pressing Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
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
    setOpen(false);
    const ok = await confirm({
      title: `Remove ${store.name}?`,
      description:
        "This deletes its orders, listings and costs from ProfitSync. Nothing changes on eBay, and you can add the store again later.",
      confirmLabel: "Remove store",
      danger: true,
    });
    if (!ok) return;
    setSwitchingId(store.id);
    try {
      await onRemove(store.id);
      toast.success(`${store.name} removed`);
    } catch (e) {
      toast.error("Couldn't remove the store", e instanceof Error ? e.message : undefined);
    } finally {
      setSwitchingId(null);
    }
  }

  async function choose(id: string) {
    if (showingAll ? id === ALL_STORES : id === active?.id) {
      setOpen(false);
      return;
    }
    const lockedChoice = id === ALL_STORES ? !canUseAllStores : stores.find((s) => s.id === id)?.locked;
    if (lockedChoice) {
      setOpen(false);
      onUpgrade?.();
      return;
    }
    setSwitchingId(id);
    try {
      await onSwitch(id);
      setOpen(false);
    } catch (e) {
      toast.error("Couldn't switch stores", e instanceof Error ? e.message : undefined);
    } finally {
      setSwitchingId(null);
    }
  }

  if (loading) {
    return <span className="ps-skeleton block h-9 w-36 rounded-lg sm:w-48" aria-hidden="true" />;
  }

  // No store yet: one clear call to action.
  if (!active) {
    return (
      <a
        href={CONNECT_URL}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover"
      >
        + Connect eBay store
      </a>
    );
  }

  const optionClass = (current: boolean) =>
    cn(
      "flex w-full min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors disabled:opacity-60",
      current ? "bg-accent-soft" : "hover:bg-surface-2"
    );

  return (
    <div className="relative" ref={boxRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Store: ${shownName}. Switch store`}
        className="flex h-9 max-w-[13rem] items-center gap-2 rounded-lg border border-line bg-surface pl-1.5 pr-2 text-left transition-colors hover:border-line-strong hover:bg-surface-2 sm:max-w-[16rem]"
      >
        <StoreAvatar name={showingAll ? "All" : active.name} all={showingAll} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{shownName}</span>
        {!showingAll && active.needsReconnect && <span className="h-2 w-2 shrink-0 rounded-full bg-warn" title="Needs reconnecting" />}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("shrink-0 text-subtle transition-transform", open && "rotate-180")} aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Your stores"
          className="animate-ps-in absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-line bg-elevated shadow-pop"
        >
          <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-subtle">Stores</p>
          <div className="max-h-72 overflow-y-auto p-1.5">
            {stores.length > 1 && (
              <button
                type="button"
                role="option"
                aria-selected={showingAll}
                onClick={() => void choose(ALL_STORES)}
                disabled={switchingId !== null}
                className={cn(optionClass(showingAll), "mb-1")}
              >
                <StoreAvatar name="All" all />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">All stores</span>
                  <span className="block text-xs text-subtle">{canUseAllStores ? "Combined totals" : "Pro and Ultimate plans"}</span>
                </span>
                {!canUseAllStores ? <LockIcon /> : switchingId === ALL_STORES ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-subtle border-t-transparent" /> : showingAll ? <Check /> : null}
              </button>
            )}
            {stores.map((store) => {
              const current = !showingAll && store.id === active.id;
              return (
                <div key={store.id} className="group flex items-center">
                  <button
                    type="button"
                    role="option"
                    aria-selected={current}
                    onClick={() => void choose(store.id)}
                    disabled={switchingId !== null}
                    className={optionClass(current)}
                  >
                    <StoreAvatar name={store.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{store.name}</span>
                      <span className="block truncate text-xs text-subtle">
                        {store.locked ? "Locked · upgrade to open" : store.needsReconnect ? "Needs reconnecting" : `eBay${store.username ? ` · ${store.username}` : ""}`}
                      </span>
                    </span>
                    {store.locked ? (
                      <LockIcon />
                    ) : switchingId === store.id ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-subtle border-t-transparent" />
                    ) : current ? (
                      <Check />
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(store)}
                    disabled={switchingId !== null}
                    aria-label={`Remove ${store.name}`}
                    title="Remove this store from ProfitSync"
                    className="ml-0.5 rounded-md p-1.5 text-subtle opacity-0 transition hover:bg-loss-soft hover:text-loss focus:opacity-100 group-hover:opacity-100 disabled:opacity-30"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M19 6l-1 14H6L5 6" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
          <div className="space-y-0.5 border-t border-line p-1.5">
            {!showingAll && active.needsReconnect && (
              <a href={CONNECT_URL} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium text-warn hover:bg-warn-soft">
                Reconnect {active.name} →
              </a>
            )}
            {atStoreLimit ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onUpgrade?.();
                }}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm font-medium text-accent-ink hover:bg-accent-soft"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-accent/40 text-base">+</span>
                <span>
                  Add a store
                  <span className="block text-xs font-normal text-subtle">Upgrade for more stores</span>
                </span>
              </button>
            ) : (
              <a href={CONNECT_URL} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium text-accent-ink hover:bg-accent-soft">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-accent/40 text-base">+</span>
                <span>
                  Add a store
                  <span className="block text-xs font-normal text-subtle">Connect another eBay account</span>
                </span>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
