// The public demo (/demo) runs the real ProfitSync app in the browser, but
// every request to ProfitSync's own API is answered here with sample data,
// so nothing reaches the server or the database. Changes (like typing a
// cost) are kept in memory until the page is closed.

import { PLANS, type BillingStatus } from "@/lib/billing/plans";
import type { ApiOrder } from "@/app/dashboard/model";
import type { Expense } from "@/app/ExpensesSection";
import { DEMO_STORE_ID, DEMO_STORE_NAME, demoExpenses, demoListings, demoOrders } from "./data";

export const DEMO_MESSAGE = "This is a demo with sample data. Create a free account to do this with your own store.";

export function inDemo(): boolean {
  return typeof window !== "undefined" && window.location.pathname.startsWith("/demo");
}

type Store = {
  orders: ApiOrder[];
  listings: ReturnType<typeof demoListings>;
  expenses: Expense[];
  nextExpenseId: number;
};

let store: Store | null = null;
function data(): Store {
  store ??= { orders: demoOrders(), listings: demoListings(), expenses: demoExpenses(), nextExpenseId: 100 };
  return store;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const demoOnly = () => json({ error: DEMO_MESSAGE, demo: true }, 403);

async function body(init?: RequestInit): Promise<Record<string, unknown>> {
  try {
    return typeof init?.body === "string" ? JSON.parse(init.body) : {};
  } catch {
    return {};
  }
}

function billing(): BillingStatus {
  return {
    enabled: true,
    plan: "ultimate",
    interval: null,
    status: "active",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    comped: true,
    // No automatic sync in the demo: there's no eBay account behind it.
    limits: { ...PLANS.ultimate.limits, autoSync: false },
    usage: { stores: 1, ordersThisMonth: 0 },
  };
}

async function handle(url: URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const path = url.pathname;
  const d = data();

  if (path === "/api/orders" && method === "GET") {
    const limit = Number(url.searchParams.get("limit") ?? d.orders.length) || d.orders.length;
    const offset = Number(url.searchParams.get("offset") ?? 0) || 0;
    return json(d.orders.slice(offset, offset + limit), 200, { "X-Total-Count": String(d.orders.length) });
  }
  const orderMatch = /^\/api\/orders\/(\d+)$/.exec(path);
  if (orderMatch && method === "PATCH") {
    const changes = await body(init);
    const order = d.orders.find((o) => o.id === Number(orderMatch[1]));
    if (order) Object.assign(order, changes);
    return json({ success: true });
  }
  if (path === "/api/listings" && method === "GET") return json(d.listings);
  const listingMatch = /^\/api\/listings\/([^/]+)$/.exec(path);
  if (listingMatch && (method === "PATCH" || method === "PUT")) {
    const changes = await body(init);
    const listing = d.listings.find((l) => l.ebayItemId === decodeURIComponent(listingMatch[1]));
    if (listing) Object.assign(listing, changes);
    return json({ success: true, updated: 0 });
  }
  if (path === "/api/listings/bulk") return json({ success: true, updated: 0 });
  if (path === "/api/expenses") {
    if (method === "GET") return json({ enabled: true, canRepeat: true, expenses: d.expenses });
    const input = await body(init);
    if (method === "POST") {
      d.expenses.unshift({
        id: d.nextExpenseId++,
        ebayUserId: input.wholeBusiness ? null : DEMO_STORE_ID,
        spentOn: String(input.spentOn),
        category: String(input.category),
        amount: String(input.amount),
        note: input.note ? String(input.note) : null,
        repeatMonthly: Boolean(input.repeatMonthly),
        endedOn: null,
      });
    } else if (method === "DELETE") {
      d.expenses = d.expenses.filter((e) => e.id !== input.id);
    } else if (method === "PATCH") {
      const expense = d.expenses.find((e) => e.id === input.id);
      if (expense) Object.assign(expense, input);
    }
    return json({ success: true });
  }
  if (path === "/api/ebay/stores" && method === "GET") {
    return json({
      allStores: false,
      canUseAllStores: true,
      maxStores: null,
      stores: [{ id: DEMO_STORE_ID, name: DEMO_STORE_NAME, username: "demo_collectibles", active: true, locked: false, needsReconnect: false }],
    });
  }
  if (path === "/api/ebay/profile") return json({ storeName: DEMO_STORE_NAME, username: "demo_collectibles" });
  if (path === "/api/billing" && method === "GET") return json(billing());
  if (path === "/api/ebay/sync" || path === "/api/ebay/listings/sync") {
    return json({ success: true, found: d.orders.length, imported: 0, skipped: d.orders.length, listings: d.listings.length });
  }
  // Anything else (checkout, store changes, account deletion, eBay checks…)
  // needs a real account.
  return demoOnly();
}

let installed = false;

// Answer ProfitSync API requests from the demo data while on /demo.
export function installDemoShim() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.origin);
    if (inDemo() && url.origin === window.location.origin && url.pathname.startsWith("/api/")) {
      return handle(url, init);
    }
    return realFetch(input, init);
  };

  // Links that need a real account (connect eBay, etc.) go to sign-up.
  document.addEventListener(
    "click",
    (event) => {
      if (!inDemo()) return;
      const link = (event.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (link && new URL(link.href, window.location.origin).pathname.startsWith("/api/")) {
        event.preventDefault();
        window.location.assign(new URL("/login?mode=signup", window.location.origin).href);
      }
    },
    true
  );
}
