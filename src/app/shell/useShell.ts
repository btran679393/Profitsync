"use client";

import { useSyncExternalStore } from "react";
import { SIDEBAR_STORAGE_KEY } from "@/lib/preferences";

// ------------------------------------------------------------
// Sidebar collapsed / expanded. Stored on <html data-sidebar> (set before
// the first paint by layout.tsx) and in this browser's localStorage.
// ------------------------------------------------------------

const SIDEBAR_EVENT = "ps-sidebar";

function subscribeSidebar(onChange: () => void) {
  window.addEventListener(SIDEBAR_EVENT, onChange);
  return () => window.removeEventListener(SIDEBAR_EVENT, onChange);
}

function readCollapsed() {
  return document.documentElement.getAttribute("data-sidebar") === "collapsed";
}

export function toggleSidebar() {
  const next = readCollapsed() ? "expanded" : "collapsed";
  document.documentElement.setAttribute("data-sidebar", next);
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next);
  } catch {
    // Private browsing: it just won't be remembered.
  }
  window.dispatchEvent(new Event(SIDEBAR_EVENT));
}

export function useSidebarCollapsed() {
  return useSyncExternalStore(subscribeSidebar, readCollapsed, () => false);
}

// ------------------------------------------------------------
// When this browser last synced a store (for "Synced 2h ago").
// ------------------------------------------------------------

export const SYNC_EVENT = "ps-synced";

function subscribeSync(onChange: () => void) {
  window.addEventListener(SYNC_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SYNC_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useLastSynced(storageKey: string): number | null {
  return useSyncExternalStore(
    subscribeSync,
    () => {
      try {
        const value = Number(window.localStorage.getItem(storageKey) ?? 0);
        return value > 0 ? value : null;
      } catch {
        return null;
      }
    },
    () => null
  );
}

export function timeAgo(timestamp: number, now = Date.now()) {
  const minutes = Math.round((now - timestamp) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
