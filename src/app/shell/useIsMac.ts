"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// Macs show ⌘K instead of Ctrl K. False while the server renders.
export function useIsMac(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
    () => false
  );
}
