"use client";

import type { ReactNode } from "react";
import { Button, Tooltip } from "@/components/ui";
import { Icon } from "../dashboard/Icon";
import { Logo } from "./Sidebar";
import { useIsMac } from "./useIsMac";
import { timeAgo } from "./useShell";

// The bar across the top of every page: menu button (phones), the store
// switcher and the sync button with when it last ran.
export default function Topbar({
  onOpenMenu,
  switcher,
  syncing,
  syncDisabled,
  onSync,
  lastSyncedAt,
  now,
  hasStore,
  progressText = null,
  onSearch,
}: {
  onOpenMenu: () => void;
  switcher: ReactNode;
  syncing: boolean;
  syncDisabled: boolean;
  onSync: () => void;
  lastSyncedAt: number | null;
  now: Date | null;
  hasStore: boolean;
  // Live sync progress, e.g. "Bringing in your orders… 1,200 so far".
  progressText?: string | null;
  // Opens the Ctrl+K quick-jump box.
  onSearch?: () => void;
}) {
  const isMac = useIsMac();
  const status = syncing ? progressText ?? "Syncing…" : lastSyncedAt && now ? `Synced ${timeAgo(lastSyncedAt, now.getTime())}` : null;

  return (
    <div className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open menu"
          className="-ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink lg:hidden"
        >
          <Icon name="menu" size={20} />
        </button>
        <span className="lg:hidden">
          <Logo compact />
        </span>

        {onSearch && (
          <button
            type="button"
            onClick={onSearch}
            aria-label="Quick jump"
            aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
            className="ml-1 flex h-9 items-center gap-2 rounded-lg border border-line bg-surface-2/60 px-2.5 text-sm text-subtle transition hover:border-line-strong hover:text-ink sm:w-56 lg:ml-0"
          >
            <Icon name="search" size={16} />
            <span className="hidden sm:inline">Search or jump to…</span>
            <kbd className="ml-auto hidden rounded border border-line-strong px-1.5 text-[11px] font-medium sm:inline">{isMac ? "⌘K" : "Ctrl K"}</kbd>
          </button>
        )}

        <div className="ml-auto flex min-w-0 items-center gap-2">
          {switcher}
          {hasStore && (
            <>
              <span aria-live="polite" className="ps-num hidden text-xs text-subtle md:inline">
                {status}
              </span>
              <Tooltip content={status ?? "Bring in new orders, fees and refunds"} side="bottom" className="sm:hidden">
                <Button variant="primary" size="md" onClick={onSync} disabled={syncDisabled} aria-label="Sync orders" className="w-9 px-0">
                  <Icon name="refresh" size={16} className={syncing ? "animate-spin" : ""} />
                </Button>
              </Tooltip>
              <span className="hidden sm:inline-flex">
                <Button
                  variant="primary"
                  size="md"
                  onClick={onSync}
                  disabled={syncDisabled}
                  icon={<Icon name="refresh" size={16} className={syncing ? "animate-spin" : ""} />}
                >
                  {syncing ? "Syncing…" : "Sync"}
                </Button>
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
