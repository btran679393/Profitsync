// The seller's display preferences. Saved on their ProfitSync account
// (user_metadata.preferences) so they follow them to any device; the theme is
// also kept in this browser so the page opens in the right colours at once.

export type ThemeChoice = "dark" | "light" | "system";
export type StartPage = "dashboard" | "orders" | "listings" | "expenses";
export type DefaultRange = "7d" | "30d" | "90d" | "all";

export type Preferences = {
  theme: ThemeChoice;
  startPage: StartPage;
  defaultRange: DefaultRange;
  // A listing that has sold before counts as "running low" at this many left.
  lowStockAt: number;
  // A listing with no sale for this many days counts as "not selling".
  staleAfterDays: number;
};

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "dark",
  startPage: "dashboard",
  defaultRange: "30d",
  lowStockAt: 2,
  staleAfterDays: 60,
};

export const THEME_STORAGE_KEY = "profitsync:theme";

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function whole(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

export function readPreferences(meta: Record<string, unknown> | undefined): Preferences {
  const raw = (meta?.preferences ?? {}) as Record<string, unknown>;
  const d = DEFAULT_PREFERENCES;
  return {
    theme: pick(raw.theme, ["dark", "light", "system"] as const, d.theme),
    startPage: pick(raw.startPage, ["dashboard", "orders", "listings", "expenses"] as const, d.startPage),
    defaultRange: pick(raw.defaultRange, ["7d", "30d", "90d", "all"] as const, d.defaultRange),
    lowStockAt: whole(raw.lowStockAt, 0, 50, d.lowStockAt),
    staleAfterDays: whole(raw.staleAfterDays, 7, 365, d.staleAfterDays),
  };
}

// "light" or "dark" for a choice ("system" follows the device).
export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "system") return choice;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

// Colour the page now and remember the choice in this browser.
export function applyTheme(choice: ThemeChoice) {
  document.documentElement.setAttribute("data-theme", resolveTheme(choice));
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Private browsing etc.: the account copy still applies on next load.
  }
}

// Runs before the first paint (see layout.tsx) so there's no flash of the
// wrong colours.
export const THEME_BOOT_SCRIPT = `(function(){try{var c=localStorage.getItem("${THEME_STORAGE_KEY}")||"dark";var t=c==="system"?(window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):c;document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark")}catch(e){}})()`;
