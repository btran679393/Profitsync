// The public demo (/demo) runs the real ProfitSync app in the browser, but
// every request to ProfitSync's own API is answered here with sample data,
// so nothing reaches the server or the database. Changes (like typing a
// cost) are kept in memory until the page is closed.

import { PLANS, type BillingStatus } from "@/lib/billing/plans";
import type { ApiOrder } from "@/app/dashboard/model";
import type { Expense } from "@/app/ExpensesSection";
import { DEMO_STORE_ID, DEMO_STORE_NAME, demoExpenses, demoInventory, demoListings, demoOrders } from "./data";
import { demoPayouts } from "./payouts";
import { breakdown } from "@/lib/ebay/payouts";
import { splitPurchaseCost, type InventoryItem, type Purchase } from "@/lib/inventory";

export const DEMO_MESSAGE = "This is a demo with sample data. Create a free account to do this with your own store.";

export function inDemo(): boolean {
  return typeof window !== "undefined" && window.location.pathname.startsWith("/demo");
}

type Store = {
  orders: ApiOrder[];
  listings: ReturnType<typeof demoListings>;
  expenses: Expense[];
  nextExpenseId: number;
  purchases: Purchase[];
  items: InventoryItem[];
  nextInventoryId: number;
};

let store: Store | null = null;
function data(): Store {
  store ??= {
    orders: demoOrders(),
    listings: demoListings(),
    expenses: demoExpenses(),
    nextExpenseId: 100,
    ...demoInventory(),
    nextInventoryId: 100,
  };
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
  if (path === "/api/email/preferences") {
    if (method === "PUT") return json({ success: false, message: DEMO_MESSAGE }, 403);
    return json({ weeklySummary: true, sending: false });
  }
  if (path === "/api/orders/bulk-cost" && method === "POST") {
    const { items } = (await body(init)) as { items?: { id: number; productCost: number }[] };
    const updated: number[] = [];
    for (const item of items ?? []) {
      const order = d.orders.find((o) => o.id === item.id);
      if (order && (order.productCost === null || order.productCost === undefined)) {
        Object.assign(order, { productCost: item.productCost });
        updated.push(item.id);
      }
    }
    return json({ updated });
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
  if (path === "/api/inventory") {
    if (method === "GET") return json({ enabled: true, purchases: d.purchases, items: d.items });
    const input = await body(init);
    if (method === "POST" && input.purchaseId !== undefined) {
      d.items.push({
        id: d.nextInventoryId++,
        purchaseId: Number(input.purchaseId),
        name: String(input.name),
        quantity: Number(input.quantity) || 1,
        unitCost: Number(input.unitCost) || 0,
        ebayItemId: input.ebayItemId ? String(input.ebayItemId) : null,
      });
    } else if (method === "POST") {
      const purchaseId = d.nextInventoryId++;
      const lines = Array.isArray(input.items) ? (input.items as Array<Record<string, unknown>>) : [];
      const split = splitPurchaseCost(
        Math.round(Number(input.totalPaid) * 100) || 0,
        lines.map((line) => ({ quantity: Number(line.quantity) || 1, estimate: line.estimate ? Number(line.estimate) : null }))
      );
      d.purchases.push({
        id: purchaseId,
        ebayUserId: DEMO_STORE_ID,
        purchasedOn: String(input.purchasedOn),
        source: String(input.source),
        note: input.note ? String(input.note) : null,
      });
      lines.forEach((line, i) =>
        d.items.push({
          id: d.nextInventoryId++,
          purchaseId,
          name: String(line.name),
          quantity: Number(line.quantity) || 1,
          unitCost: split[i]?.unitCost ?? 0,
          ebayItemId: line.ebayItemId ? String(line.ebayItemId) : null,
        })
      );
    } else if (method === "PATCH") {
      const target =
        input.purchaseId !== undefined
          ? d.purchases.find((p) => p.id === Number(input.purchaseId))
          : d.items.find((i) => i.id === Number(input.itemId));
      const changes = { ...input };
      delete changes.purchaseId;
      delete changes.itemId;
      delete changes.useAsListingCost;
      if (target) Object.assign(target, changes);
    } else if (method === "DELETE") {
      if (input.purchaseId !== undefined) {
        d.purchases = d.purchases.filter((p) => p.id !== Number(input.purchaseId));
        d.items = d.items.filter((i) => i.purchaseId !== Number(input.purchaseId));
      } else {
        d.items = d.items.filter((i) => i.id !== Number(input.itemId));
      }
    }
    return json({ success: true, costsApplied: 0 });
  }
  if (path === "/api/ebay/stores" && method === "GET") {
    return json({
      allStores: false,
      canUseAllStores: true,
      maxStores: null,
      stores: [
        {
          id: DEMO_STORE_ID,
          name: DEMO_STORE_NAME,
          username: "demo_collectibles",
          active: true,
          locked: false,
          needsReconnect: false,
          lastSyncAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          lastFullSyncAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
    });
  }
  if (path === "/api/ebay/payouts" && method === "GET") {
    const days = Number(url.searchParams.get("days")) || 90;
    const { response, details } = demoPayouts(d.orders, Math.max(days, 365));
    const payoutId = url.searchParams.get("payout");
    if (payoutId) {
      const lines = details.get(payoutId) ?? [];
      const titles: Record<string, string> = {};
      for (const o of d.orders) if (o.ebayOrderId && o.item) titles[String(o.ebayOrderId)] = String(o.item);
      return json({ lines, breakdown: breakdown(lines), titles });
    }
    const from = Date.now() - days * 86_400_000;
    return json({ ...response, payouts: response.payouts.filter((p) => p.date && Date.parse(p.date) >= from) });
  }
  if (path === "/api/ebay/profile") return json({ storeName: DEMO_STORE_NAME, username: "demo_collectibles" });
  if (path === "/api/billing" && method === "GET") return json(billing());
  if (path === "/api/ebay/sync" && url.searchParams.get("year")) {
    // The demo store only has recent orders: nothing older to bring in.
    return json({ success: true, mode: "history", found: 0, imported: 0, skipped: 0 });
  }
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
