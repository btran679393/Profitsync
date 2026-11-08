"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/components/ui";
import { Icon } from "../dashboard/Icon";
import type { View } from "../dashboard/model";
import AccountBadge from "../AccountBadge";
import { ACCOUNT_ITEMS, NAV_GROUPS, type NavItem } from "./nav";
import { toggleSidebar, useSidebarCollapsed } from "./useShell";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent text-on-accent shadow-sm">
        {/* Rising line: the ProfitSync mark */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 16l5-5 4 3 7-7" />
          <path d="M15 7h5v5" />
        </svg>
      </span>
      {!compact && <span className="ps-hide-collapsed text-[15px] font-semibold tracking-tight text-ink">ProfitSync</span>}
    </span>
  );
}

function NavButton({
  item,
  active,
  badge,
  onSelect,
}: {
  item: NavItem;
  active: boolean;
  badge?: ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
      className={cn(
        "ps-nav-item group relative flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-150",
        active ? "bg-accent-soft font-semibold text-ink" : "font-medium text-muted hover:bg-surface-2 hover:text-ink"
      )}
    >
      {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" aria-hidden="true" />}
      <Icon name={item.icon} size={18} className={cn("shrink-0", active ? "text-accent-ink" : "")} />
      <span className="ps-hide-collapsed min-w-0 flex-1 truncate text-left">{item.label}</span>
      {badge && <span className="ps-hide-collapsed shrink-0">{badge}</span>}
      <span className="ps-nav-tip pointer-events-none absolute left-full top-1/2 z-50 ml-3 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-bg shadow-pop">
        {item.label}
      </span>
    </button>
  );
}

export default function Sidebar({
  view,
  onNavigate,
  badges,
  mobileOpen,
  onCloseMobile,
  onLogout,
  loggingOut,
}: {
  view: View;
  onNavigate: (view: View) => void;
  badges: Partial<Record<View, ReactNode>>;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const collapsed = useSidebarCollapsed();

  // Phones: Escape closes the slide-out menu.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseMobile();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-overlay backdrop-blur-[2px] lg:hidden"
        />
      )}

      <aside
        aria-label="Main navigation"
        className={cn(
          "ps-sidebar fixed inset-y-0 left-0 z-50 flex flex-col border-r border-line bg-surface lg:translate-x-0",
          mobileOpen ? "translate-x-0 shadow-pop" : "-translate-x-full"
        )}
      >
        {/* Logo + collapse */}
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
          <Logo />
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="ps-hide-collapsed hidden h-7 w-7 items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-ink lg:flex"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16" />
              <path d="m15 10-2 2 2 2" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close menu"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink lg:hidden"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Expand button (only when collapsed) */}
        <div className="ps-show-collapsed hidden justify-center pt-3">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Expand sidebar"
            aria-expanded={false}
            title="Expand sidebar"
            className="flex h-8 w-8 items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16" />
              <path d="m13 10 2 2-2 2" />
            </svg>
          </button>
        </div>

        {/* Main navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="ps-hide-collapsed mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-subtle">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavButton key={item.id} item={item} active={view === item.id} badge={badges[item.id]} onSelect={() => onNavigate(item.id)} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Account */}
        <div className="shrink-0 space-y-0.5 border-t border-line px-3 py-3">
          {ACCOUNT_ITEMS.map((item) => (
            <NavButton key={item.id} item={item} active={view === item.id} badge={badges[item.id]} onSelect={() => onNavigate(item.id)} />
          ))}
          <button
            type="button"
            onClick={onLogout}
            disabled={loggingOut}
            aria-label="Log out"
            className="ps-nav-item group relative flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-loss-soft hover:text-loss disabled:opacity-50"
          >
            <Icon name="logout" size={18} className="shrink-0" />
            <span className="ps-hide-collapsed">{loggingOut ? "Logging out…" : "Log out"}</span>
            <span className="ps-nav-tip pointer-events-none absolute left-full top-1/2 z-50 ml-3 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-bg shadow-pop">
              Log out
            </span>
          </button>
          <div className="pt-2">
            <AccountBadge variant="sidebar" />
          </div>
        </div>
      </aside>
    </>
  );
}
