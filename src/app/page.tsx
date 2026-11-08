"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, ConfirmProvider, Notice, PageHeader, SegmentedControl, ToastProvider, useToast } from "@/components/ui";
import Sidebar from "./shell/Sidebar";
import Topbar from "./shell/Topbar";
import DashboardView, { type Attention, type CostSlice } from "./dashboard/DashboardView";
import OrdersView from "./dashboard/OrdersView";
import type { TrendPoint } from "./dashboard/TrendChart";
import { SYNC_EVENT, useLastSynced } from "./shell/useShell";
import ListingsSection, { LISTING_RANGES, type ListingRange } from "./ListingsSection";
import StoreShippingSetting from "./StoreShippingSetting";
import StoreSwitcher, { type EbayStore } from "./StoreSwitcher";
import OrderTools, { type ToolOrder } from "./OrderTools";
import ExpensesSection, {
  todayKey,
  type Expense,
  type ExpenseChanges,
  type ExpenseEntry,
  type NewExpense,
} from "./ExpensesSection";
import { repeatDates } from "@/lib/expenses";
import SettingsSection from "./SettingsSection";
import {
  DEFAULT_PREFERENCES,
  THEME_STORAGE_KEY,
  applyTheme,
  readPreferences,
  type Preferences,
} from "@/lib/preferences";
import MonthlyGoal from "./MonthlyGoal";
import BillingSection from "./BillingSection";
import TaxReport, { type TaxOrder } from "./TaxReport";
import { PLANS, type BillingStatus } from "@/lib/billing/plans";

import { type ApiListing, type Order, type ApiOrder, type SyncResponse, type OrderFilter, type DateRange, money, isValidCost, formatOrders, isFullyRefunded, getRefundLoss, isPartiallyRefunded, hasRecordedCost, getShippingCost, getOrderProfit, type View, subscribeToHash, viewFromHash, VIEW_COPY, isOrderInListingRange, normalizeTitle, buildListingRows, getDateRangeStart, isOrderInDateRange, dateRangeLabel, localDateKey, startOfLocalDay, computeTotals, previousRange } from "./dashboard/model";
import { OrderDetailsPanel } from "./dashboard/OrderParts";
import { Icon } from "./dashboard/Icon";

// ============================================================
// MAIN DASHBOARD
// ============================================================

// The page: shared toast and confirm-dialog providers around the dashboard.
export default function Home() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Dashboard />
      </ConfirmProvider>
    </ToastProvider>
  );
}

function Dashboard() {
  const router = useRouter();

  // Orders as loaded; `orders` (below) adds the active store's shipping default.
  const [rawOrders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(
    null
  );

  const savingRef = useRef(false);
  const syncInFlightRef = useRef(false);

  const [syncing, setSyncing] = useState(false);
  // Success and error messages appear as toasts (bottom right).
  const toast = useToast();
  const [loadError, setLoadError] = useState("");

  const [loggingOut, setLoggingOut] = useState(false);

  const [search, setSearch] = useState("");
  const [filter, setFilter] =
    useState<OrderFilter>("all");

  const [dateRange, setDateRange] =
    useState<DateRange>("30d");

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [selectedOrderId, setSelectedOrderId] =
    useState<number | null>(null);

  const [now, setNow] = useState<Date | null>(null);

  const [listings, setListings] = useState<ApiListing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [listingsSyncing, setListingsSyncing] = useState(false);
  const [listingRange, setListingRange] = useState<ListingRange>("all");
  const [recentlySavedId, setRecentlySavedId] = useState<number | null>(null);
  const [shippingEnabled, setShippingEnabled] = useState(false);
  // "Shipping per order" default for each eBay store, saved on the ProfitSync
  // account (user_metadata.defaultShippingByStore). The older single
  // account-wide value (defaultShippingCost) is still used as a fallback.
  const [profitGoals, setProfitGoals] = useState<Record<string, number>>({});
  const [shippingDefaults, setShippingDefaults] = useState<{
    byStore: Record<string, number>;
    legacy: number | null;
  }>({ byStore: {}, legacy: null });

  const [firstName, setFirstName] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);

  // Save settings to the account (and apply a new theme straight away).
  async function savePreferences(changes: Partial<Preferences>) {
    const next = { ...preferences, ...changes };
    setPreferences(next);
    if (changes.theme) applyTheme(changes.theme);
    if (changes.defaultRange) setDateRange(changes.defaultRange);
    const { error } = await createClient().auth.updateUser({ data: { preferences: next } });
    if (error) throw new Error("Couldn't save your settings. Please try again.");
  }

  // "Match my device": follow the device when it switches light/dark.
  useEffect(() => {
    if (preferences.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preferences.theme]);

  // Name for the greeting: the eBay store name, else the eBay username,
  // else the person's first name (from their sign-in profile or email).
  useEffect(() => {
    let active = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        const user = data.user;
        if (!active || !user) return;
        const meta = user.user_metadata ?? {};
        const full = String(meta.full_name ?? meta.name ?? "").trim();
        const fromEmail = (user.email ?? "").split("@")[0].split(/[._\-+\d]/)[0];
        const name = full ? full.split(/\s+/)[0] : fromEmail;
        setFirstName(name ? name.charAt(0).toUpperCase() + name.slice(1) : "");

        // Settings saved on the account: theme, start page, date range.
        const prefs = readPreferences(meta);
        setPreferences(prefs);
        let localTheme: string | null = null;
        try {
          localTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
        } catch {
          localTheme = null;
        }
        if (localTheme !== prefs.theme) applyTheme(prefs.theme);
        setDateRange(prefs.defaultRange);
        if (!window.location.hash && prefs.startPage !== "dashboard") {
          window.location.hash = `#${prefs.startPage}`;
        }

        const legacy = Number(meta.defaultShippingCost);
        const byStore: Record<string, number> = {};
        const raw = meta.defaultShippingByStore;
        if (raw && typeof raw === "object") {
          for (const [id, amount] of Object.entries(raw as Record<string, unknown>)) {
            if (typeof amount === "number" && Number.isFinite(amount) && amount >= 0) byStore[id] = amount;
          }
        }
        const goals: Record<string, number> = {};
        if (meta.profitGoalByStore && typeof meta.profitGoalByStore === "object") {
          for (const [key, amount] of Object.entries(meta.profitGoalByStore as Record<string, unknown>)) {
            if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) goals[key] = amount;
          }
        }
        setProfitGoals(goals);
        setShippingDefaults({
          byStore,
          legacy: meta.defaultShippingCost == null || !Number.isFinite(legacy) ? null : legacy,
        });
      });
    return () => {
      active = false;
    };
  }, []);


  // Ticks every minute so the greeting and "today" roll over on their own.
  const [clock, setClock] = useState<Date | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const currentTime = clock ?? now;

  const hour = currentTime?.getHours();
  const greeting =
    hour === undefined
      ? "Welcome back"
      : hour < 5
        ? "Good evening" // midnight–5 AM still feels like evening
        : hour < 12
          ? "Good morning"
          : hour < 18
            ? "Good afternoon"
            : "Good evening";
  const savedFlashTimer = useRef<number | undefined>(undefined);

  // Enter in a cost box: save it (by leaving the box) and jump to the next
  // order further down that still needs a cost.
  function focusNextCostInput(current: HTMLInputElement) {
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-cost-input]"));
    const next = inputs
      .slice(inputs.indexOf(current) + 1)
      .find((input) => input.dataset.needsCost === "true" && !input.disabled);
    current.blur();
    next?.focus();
  }

  const hash = useSyncExternalStore(
    subscribeToHash,
    () => window.location.hash,
    () => ""
  );
  const view = viewFromHash(hash);

  function navigate(target: View | "performance") {
    setSidebarOpen(false);
    const nextHash = target === "dashboard" ? "" : `#${target}`;
    if (window.location.hash === nextHash) {
      if (target === "performance") {
        document.getElementById("performance")?.scrollIntoView({ behavior: "smooth" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }
    if (nextHash) {
      window.location.hash = nextHash;
    } else {
      history.pushState(null, "", window.location.pathname + window.location.search);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  }

  // Each view starts at the top; "Performance" jumps to its chart.
  useEffect(() => {
    if (hash === "#performance") {
      document.getElementById("performance")?.scrollIntoView({ behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [hash]);

  // ----------------------------------------------------------
  // INITIAL DATE
  // ----------------------------------------------------------

  // Set after the first render (not during it) so server and browser agree.
  useEffect(() => {
    const id = window.setTimeout(() => setNow(new Date()), 0);
    return () => window.clearTimeout(id);
  }, []);

  // ----------------------------------------------------------
  // LOGOUT
  // ----------------------------------------------------------

  async function logout() {
    if (loggingOut) return;

    try {
      setLoggingOut(true);

      const supabase = createClient();

      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      setOrders([]);
      setLoadError("");

      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error("Logout failed:", error);

      toast.error("Couldn't log out", "Please try again.");

      setLoggingOut(false);
    }
  }

  // ----------------------------------------------------------
  // LOAD ORDERS
  // ----------------------------------------------------------

  const loadOrders = useCallback(async () => {
    const response = await fetch("/api/orders", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Failed to load orders.");
    }

    const data: ApiOrder[] = await response.json();

    setOrders(formatOrders(data));
    setShippingEnabled(response.headers.get("X-Shipping-Cost-Enabled") === "1");
    setLoadError("");
  }, []);

  // Save what shipping cost for one order (blank clears it).
  async function saveShippingCost(id: number, value: string) {
    const response = await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shippingCost: value === "" ? null : value }),
    });
    if (!response.ok) {
      const data: { error?: string } = await response.json().catch(() => ({}));
      setLoadError(data.error || "Failed to save shipping cost. Please try again.");
      throw new Error(data.error || "Failed to save shipping cost.");
    }
    const formatted = value === "" ? "" : Number(value).toFixed(2);
    setOrders((current) =>
      current.map((order) =>
        order.id === id ? { ...order, shippingCost: formatted, savedShippingCost: formatted } : order
      )
    );
  }

  // ----------------------------------------------------------
  // LOAD + SYNC LISTINGS
  // ----------------------------------------------------------

  const loadListings = useCallback(async () => {
    try {
      const response = await fetch("/api/listings", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load listings.");
      setListings((await response.json()) as ApiListing[]);
    } catch (error) {
      console.error("Loading listings failed:", error);
    } finally {
      setListingsLoading(false);
    }
  }, []);

  // ----------------------------------------------------------
  // EBAY STORES (several per account; one is active)
  // ----------------------------------------------------------

  const [stores, setStores] = useState<EbayStore[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  // "All stores" view: every connected store's data combined.
  const [allStores, setAllStores] = useState(false);
  // What the seller's plan allows for stores (from /api/ebay/stores).
  const [storePlan, setStorePlan] = useState<{ canUseAllStores: boolean; maxStores: number | null }>({
    canUseAllStores: true,
    maxStores: null,
  });
  const activeStore = allStores ? null : stores.find((store) => store.active) ?? null;
  const activeStoreId = activeStore?.id ?? null;

  // The active store's "shipping per order" default (null = not set).
  const storeShipping =
    activeStoreId && shippingDefaults.byStore[activeStoreId] !== undefined
      ? shippingDefaults.byStore[activeStoreId]
      : shippingDefaults.legacy;

  // Each order uses its own store's default (matters in the All stores view).
  const orders = useMemo(
    () =>
      rawOrders.map((order) => {
        const fromStore = order.ebayUserId ? shippingDefaults.byStore[order.ebayUserId] : undefined;
        return { ...order, storeShipping: fromStore ?? shippingDefaults.legacy ?? 0 };
      }),
    [rawOrders, shippingDefaults]
  );

  // Monthly profit goal per store ("all" for the All stores view), saved on
  // the ProfitSync account (user_metadata.profitGoalByStore).
  const goalKey = allStores ? "all" : activeStoreId ?? "default";
  const monthlyGoal = profitGoals[goalKey] ?? null;

  async function saveMonthlyGoal(value: string) {
    const amount = value === "" ? null : Math.round(Number(value) * 100) / 100;
    const next = { ...profitGoals };
    if (amount === null || amount <= 0) delete next[goalKey];
    else next[goalKey] = amount;
    const { error } = await createClient().auth.updateUser({ data: { profitGoalByStore: next } });
    if (error) throw error;
    setProfitGoals(next);
  }

  async function saveStoreShipping(value: string) {
    const amount = value === "" ? null : Math.round(Number(value) * 100) / 100;
    const byStore = { ...shippingDefaults.byStore };
    let legacy = shippingDefaults.legacy;
    if (activeStoreId) {
      if (amount === null) delete byStore[activeStoreId];
      else byStore[activeStoreId] = amount;
    } else {
      legacy = amount;
    }
    const { error } = await createClient().auth.updateUser({
      data: { defaultShippingByStore: byStore, defaultShippingCost: legacy },
    });
    if (error) throw error;
    setShippingDefaults({ byStore, legacy });
  }
  const greetingName =
    sellerName ||
    (activeStore && activeStore.name !== "eBay store" ? activeStore.name : "") ||
    firstName;

  const loadStores = useCallback(async () => {
    try {
      const response = await fetch("/api/ebay/stores", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load stores.");
      const data: { stores?: EbayStore[]; allStores?: boolean; canUseAllStores?: boolean; maxStores?: number | null } =
        await response.json();
      setStores(data.stores ?? []);
      setAllStores(Boolean(data.allStores));
      setStorePlan({ canUseAllStores: data.canUseAllStores !== false, maxStores: data.maxStores ?? null });
    } catch (error) {
      console.error("Loading eBay stores failed:", error);
    } finally {
      setStoresLoading(false);
    }
  }, []);

  // ----------------------------------------------------------
  // EXPENSES (costs not tied to one sale)
  // ----------------------------------------------------------

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesEnabled, setExpensesEnabled] = useState(true);
  const [expensesLoading, setExpensesLoading] = useState(true);
  const [expensesCanRepeat, setExpensesCanRepeat] = useState(false);

  // One entry per expense, or per month for a repeating one, up to today.
  const expenseEntries = useMemo<ExpenseEntry[]>(() => {
    const today = todayKey();
    return expenses.flatMap((expense) =>
      expense.repeatMonthly
        ? repeatDates(expense.spentOn, expense.endedOn ?? null, today).map((date) => ({
            ...expense,
            key: `${expense.id}-${date}`,
            date,
          }))
        : [{ ...expense, key: String(expense.id), date: expense.spentOn }]
    ).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  }, [expenses]);

  // Every category used, for the category list on the Expenses page.
  const expenseCategories = useMemo(() => [...new Set(expenses.map((e) => e.category))], [expenses]);

  const loadExpenses = useCallback(async () => {
    try {
      const response = await fetch("/api/expenses", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load expenses.");
      const data: { enabled?: boolean; canRepeat?: boolean; expenses?: Expense[] } = await response.json();
      setExpensesEnabled(data.enabled !== false);
      setExpensesCanRepeat(Boolean(data.canRepeat));
      setExpenses(data.expenses ?? []);
    } catch (error) {
      console.error("Loading expenses failed:", error);
    } finally {
      setExpensesLoading(false);
    }
  }, []);

  async function updateExpense(id: number, changes: ExpenseChanges) {
    const response = await fetch("/api/expenses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...changes }),
    });
    const data: { success?: boolean; error?: string } = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "Couldn't save the expense.");
    await loadExpenses();
  }

  async function addExpense(expense: NewExpense) {
    const response = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(expense),
    });
    const data: { success?: boolean; error?: string } = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "Couldn't add the expense.");
    await loadExpenses();
  }

  async function deleteExpense(id: number) {
    const response = await fetch("/api/expenses", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) throw new Error("Couldn't delete the expense.");
    await loadExpenses();
  }

  // ----------------------------------------------------------
  // PLAN & BILLING
  // ----------------------------------------------------------

  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingNotice, setBillingNotice] = useState("");

  const loadBilling = useCallback(async (syncFromStripe = false) => {
    try {
      const response = await fetch(`/api/billing${syncFromStripe ? "?sync=1" : ""}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load plan.");
      setBilling((await response.json()) as BillingStatus);
    } catch (error) {
      console.error("Loading plan failed:", error);
    } finally {
      setBillingLoading(false);
    }
  }, []);

  // Until billing is switched on (or while it loads), nothing is limited.
  const limits = billing?.enabled ? billing.limits : PLANS.ultimate.limits;
  const onFreePlan = Boolean(billing?.enabled && billing.plan === "free");
  const goToPlans = () => navigate("billing");

  // Coming back from Stripe checkout or the billing portal.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("billing");
    void (async () => {
      await Promise.resolve();
      if (!result) {
        await loadBilling();
        return;
      }
      history.replaceState(null, "", window.location.pathname + window.location.hash);
      await loadBilling(true);
      if (result === "success") setBillingNotice("Payment received. Your new plan is active, thank you!");
      else if (result === "cancelled") setBillingNotice("Checkout cancelled. You haven't been charged.");
      // Plan changes can unlock stores and orders: refresh everything.
      await Promise.all([loadStores(), loadOrders()]);
    })();
    // Runs once when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch the whole dashboard to another connected store.
  async function switchStore(id: string) {
    const response = await fetch("/api/ebay/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data: { success?: boolean; error?: string } = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "Couldn't switch stores.");
    setSellerName("");
    setSelectedOrderId(null);
    await Promise.all([loadStores(), loadOrders(), loadListings(), loadExpenses()]);
  }

  // Remove a store and its ProfitSync data, then show whichever store is left.
  async function removeStore(id: string) {
    const response = await fetch("/api/ebay/stores", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data: { success?: boolean; error?: string } = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "Couldn't remove the store.");
    setSellerName("");
    setSelectedOrderId(null);
    setShippingDefaults((current) => {
      const byStore = { ...current.byStore };
      delete byStore[id];
      return { ...current, byStore };
    });
    await Promise.all([loadStores(), loadOrders(), loadListings(), loadExpenses()]);
  }

  // Store name for the greeting, refreshed whenever the active store changes.
  useEffect(() => {
    if (!activeStoreId) return;
    let active = true;
    fetch(`/api/ebay/profile?store=${encodeURIComponent(activeStoreId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((profile: { storeName?: string | null; username?: string | null } | null) => {
        if (active && profile) setSellerName(profile.storeName || profile.username || "");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [activeStoreId]);

  // Save a listing's cost per item; optionally fill it into past sales.
  async function saveListingCost(itemId: string, field: "unitCost" | "shippingCost", value: string, applyToPast: boolean) {
    const response = await fetch(`/api/listings/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, [field]: value === "" ? null : value, applyToPast }),
    });
    const data: { success?: boolean; applied?: number; error?: string } = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "Couldn't save the cost.");
    await loadListings();
    if (data.applied) await loadOrders();
    return data.applied ?? 0;
  }

  // Same, for many listings at once (the Listings page's bulk bar).
  async function saveListingCostBulk(itemIds: string[], field: "unitCost" | "shippingCost", value: string, applyToPast: boolean) {
    const response = await fetch("/api/listings/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds, field, value, applyToPast }),
    });
    const data: { success?: boolean; applied?: number; error?: string } = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "Couldn't update the listings.");
    await loadListings();
    if (data.applied) await loadOrders();
    return data.applied ?? 0;
  }

  // quiet: used right after an order sync, so only problems are shown.
  async function syncListings(quiet = false) {
    if (listingsSyncing) return;
    setListingsSyncing(true);
    try {
      // In the "All stores" view, refresh each store's listings in turn.
      let data: { success?: boolean; message?: string; error?: string } = {};
      for (const target of allStores ? stores.filter((s) => !s.locked) : [activeStore]) {
        const response = await fetch(
          target ? `/api/ebay/listings/sync?store=${encodeURIComponent(target.id)}` : "/api/ebay/listings/sync",
          { method: "POST", cache: "no-store" }
        );
        data = await response.json();
        if (!response.ok || !data.success) {
          const reason = data.error || "Couldn't load your eBay listings.";
          throw new Error(target ? `${target.name}: ${reason}` : reason);
        }
      }
      if (allStores) data.message = `Refreshed listings for ${stores.length} stores.`;
      await loadListings();
      if (!quiet) toast.success("Listings refreshed", data.message ?? undefined);
    } catch (error) {
      toast.error("Listings didn't refresh", error instanceof Error ? error.message : "Couldn't load your eBay listings.");
    } finally {
      setListingsSyncing(false);
    }
  }

  useEffect(() => {
    async function initialLoad() {
      const storesLoaded = loadStores();
      const expensesLoaded = loadExpenses();
      const listingsLoaded = loadListings();
      try {
        await loadOrders();
      } catch (error) {
        console.error("Loading failed:", error);

        setLoadError(
          "Unable to load orders from the database."
        );
      } finally {
        setLoading(false);
      }
      await listingsLoaded;
      await storesLoaded;
      await expensesLoaded;
    }

    void initialLoad();
  }, [loadOrders, loadListings, loadStores, loadExpenses]);

  // ----------------------------------------------------------
  // EDIT PRODUCT COST
  // ----------------------------------------------------------

  function updateProductCost(id: number, value: string) {
    setOrders((currentOrders) =>
      currentOrders.map((order) =>
        order.id === id && !isFullyRefunded(order)
          ? { ...order, productCost: value }
          : order
      )
    );
  }

  // ----------------------------------------------------------
  // SAVE PRODUCT COST
  // ----------------------------------------------------------

  async function saveProductCost(
    id: number,
    value: string
  ) {
    if (savingRef.current) return;

    const currentOrder = orders.find(
      (order) => order.id === id
    );

    if (!currentOrder || isFullyRefunded(currentOrder)) return;

    if (!isValidCost(value)) {
      setOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === id
            ? {
                ...order,
                productCost: order.savedProductCost,
              }
            : order
        )
      );

      return;
    }

    const productCost = Number(value);

    if (
      currentOrder.savedProductCost !== "" &&
      Number(currentOrder.savedProductCost) === productCost
    ) {
      return;
    }

    savingRef.current = true;

    try {
      setSavingId(id);
      setLoadError("");

      const response = await fetch(
        `/api/orders/${id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ productCost }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to save product cost.");
      }

      const formattedCost = productCost.toFixed(2);

      setRecentlySavedId(id);
      window.clearTimeout(savedFlashTimer.current);
      savedFlashTimer.current = window.setTimeout(() => setRecentlySavedId(null), 2500);

      setOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === id
            ? {
                ...order,
                productCost: formattedCost,
                savedProductCost: formattedCost,
                status: isPartiallyRefunded(order) ? "PARTIALLY_REFUNDED" : "COMPLETED",
              }
            : order
        )
      );
    } catch (error) {
      console.error("Saving failed:", error);

      setLoadError(
        "Failed to save product cost. Please try again."
      );

      setOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === id
            ? {
                ...order,
                productCost: order.savedProductCost,
              }
            : order
        )
      );
    } finally {
      savingRef.current = false;
      setSavingId(null);
    }
  }

  async function saveRefundOutcome(id: number, data: { refundOutcome: string; productCost: number | null; refundShippingLoss: number; refundFeeLoss: number }) {
    const response = await fetch(`/api/orders/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || "Failed to save refund details.");
    }
    await loadOrders();
  }

  // ----------------------------------------------------------
  // SYNC EBAY
  // ----------------------------------------------------------

  async function syncEbayOrders() {
    if (syncing || syncInFlightRef.current || savingRef.current || loggingOut) {
      return;
    }
    syncInFlightRef.current = true;

    try {
      setSyncing(true);

      // In the "All stores" view, sync each store in turn.
      const targets: Array<EbayStore | null> = allStores ? stores.filter((s) => !s.locked) : [activeStore];
      const results: SyncResponse[] = [];
      for (const target of targets) {
        const response = await fetch(
          target ? `/api/ebay/sync?store=${encodeURIComponent(target.id)}` : "/api/ebay/sync",
          { method: "POST", cache: "no-store" }
        );
        const result: SyncResponse & { busy?: boolean } = await response.json();
        // Another tab or an auto-sync is already on it: nothing went wrong.
        if (response.status === 409 && result.busy) {
          toast.info("Already syncing", result.message);
          return;
        }
        if (!response.ok || !result.success) {
          const reason = result.message || result.error || "Failed to sync eBay orders.";
          throw new Error(target ? `${target.name}: ${reason}` : reason);
        }
        results.push(result);
      }
      const data: SyncResponse =
        results.length === 1
          ? results[0]
          : {
              success: true,
              found: results.reduce((sum, r) => sum + (r.found ?? 0), 0),
              imported: results.reduce((sum, r) => sum + (r.imported ?? 0), 0),
              skipped: results.reduce((sum, r) => sum + (r.skipped ?? 0), 0),
            };

      recordSync();
      await loadOrders();

      // Also refresh listings (the order sync renews the eBay sign-in first).
      void syncListings(true);

      const found = data.found ?? 0;
      const imported = data.imported ?? 0;
      // Short, plain summary: only mention things that actually changed.
      const changes = [
        imported > 0 && `${imported} new order${imported === 1 ? "" : "s"}`,
        (data.feesUpdated ?? 0) > 0 && `fees updated on ${data.feesUpdated}`,
        (data.refundsUpdated ?? 0) + (data.refundedImported ?? 0) > 0 &&
          `${(data.refundsUpdated ?? 0) + (data.refundedImported ?? 0)} refund${(data.refundsUpdated ?? 0) + (data.refundedImported ?? 0) === 1 ? "" : "s"} updated`,
      ].filter(Boolean);
      const overLimit = results.reduce((sum, r) => sum + (r.ordersOverPlanLimit ?? 0), 0);
      toast.success(
        `Synced ${found} order${found === 1 ? "" : "s"}`,
        changes.length ? changes.join(" · ") : "Everything is up to date."
      );
      if (overLimit > 0) {
        toast.info(
          `${overLimit} more order${overLimit === 1 ? "" : "s"} not imported`,
          `The Free plan includes ${results[0]?.monthlyOrderLimit ?? 50} orders a month. Upgrade on Plan & billing for unlimited orders.`
        );
      }
      // Usage on the plan page changes with new orders.
      if (onFreePlan) void loadBilling();
    } catch (error) {
      console.error("Sync failed:", error);

      toast.error(
        "Sync didn't finish",
        error instanceof Error ? error.message : "Something went wrong syncing orders."
      );
    } finally {
      setSyncing(false);
      syncInFlightRef.current = false;
    }
  }

  // ----------------------------------------------------------
  // AUTOMATIC SYNC when the dashboard opens (at most every 6 hours per
  // store, remembered in this browser)
  // ----------------------------------------------------------

  const AUTO_SYNC_MS = 6 * 60 * 60 * 1000;
  const syncKey = `profitsync:lastSync:${allStores ? "all" : activeStoreId ?? "none"}`;

  // "Synced 2h ago" in the top bar.
  const lastSyncedAt = useLastSynced(syncKey);

  function recordSync() {
    try {
      window.localStorage.setItem(syncKey, String(Date.now()));
    } catch {
      // Private browsing etc.: auto-sync just runs again next time.
    }
    window.dispatchEvent(new Event(SYNC_EVENT));
  }

  useEffect(() => {
    if (storesLoading || stores.length === 0) return;
    // Automatic sync is a paid-plan feature (Free syncs with the button).
    if (billingLoading || !limits.autoSync) return;
    let last = 0;
    try {
      last = Number(window.localStorage.getItem(syncKey) ?? 0);
    } catch {
      last = 0;
    }
    if (Date.now() - last < AUTO_SYNC_MS) return;
    void (async () => {
      await Promise.resolve();
      await syncEbayOrders();
    })();
    // Re-check only when the store (or All stores view) or plan changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storesLoading, syncKey, billingLoading, limits.autoSync]);

  // Coming back from eBay after adding a store: show the result, and bring
  // in the new store's orders and listings straight away.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("ebay") === "connected";
    const failed = params.get("ebay_error");
    if (!connected && !failed) return;
    history.replaceState(null, "", window.location.pathname + window.location.hash);
    void (async () => {
      await Promise.resolve();
      if (failed) {
        toast.error("eBay store not connected", failed);
        return;
      }
      await loadStores();
      await syncEbayOrders();
    })();
    // Runs once when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----------------------------------------------------------
  // SELECTED DATE RANGE
  // ----------------------------------------------------------

  const periodOrders = useMemo(() => {
    if (!now) return [];

    return orders.filter((order) =>
      isOrderInDateRange(order, dateRange, now)
    );
  }, [orders, dateRange, now]);

  // Expenses in the same date range (dates are calendar days, local time).
  const periodExpenses = useMemo(() => {
    if (!now) return [];
    return expenseEntries.filter((expense) => {
      const [y, m, d] = expense.date.split("-").map(Number);
      // Start of that day, so an expense dated today shows straight away.
      const asOrder = { orderDate: new Date(y, m - 1, d).toISOString() } as Order;
      return isOrderInDateRange(asOrder, dateRange, now);
    });
  }, [expenseEntries, dateRange, now]);

  // ----------------------------------------------------------
  // FINANCIAL TOTALS
  // ----------------------------------------------------------

  // Orders in the chosen date range, flattened for the CSV download.
  // Every loaded order, for the yearly tax summary.
  const taxOrders = useMemo<TaxOrder[]>(
    () =>
      orders.map((order) => ({
        orderDate: order.orderDate,
        refunded: isFullyRefunded(order),
        salePrice: order.salePrice,
        ebayFees: order.ebayFees,
        otherFees: order.otherFees,
        shipping: getShippingCost(order),
        productCost: hasRecordedCost(order) ? Number(order.savedProductCost) : null,
        refundLoss: getRefundLoss(order),
      })),
    [orders]
  );

  const toolOrders = useMemo<ToolOrder[]>(
    () =>
      periodOrders.map((order) => ({
        ebayOrderId: order.ebayOrderId,
        orderDate: order.orderDate,
        item: order.item,
        quantity: order.quantity,
        status: order.status,
        salePrice: order.salePrice,
        refundAmount: order.refundAmount,
        ebayFees: order.ebayFees,
        otherFees: order.otherFees,
        shipping: getShippingCost(order),
        productCost: hasRecordedCost(order) ? Number(order.savedProductCost) : null,
        profit: isFullyRefunded(order) ? -getRefundLoss(order) : getOrderProfit(order),
      })),
    [periodOrders]
  );

  const totals = useMemo(() => computeTotals(periodOrders, periodExpenses), [periodOrders, periodExpenses]);

  // The same numbers for the window just before (for "vs previous period").
  const previousTotals = useMemo(() => {
    if (!now) return null;
    const window = previousRange(dateRange, now);
    if (!window) return null;
    const inWindow = (date: Date) => date >= window.start && date < window.end;
    const prevOrders = orders.filter((order) => order.orderDate && inWindow(new Date(order.orderDate)));
    const prevExpenses = expenseEntries.filter((entry) => {
      const [y, m, d] = entry.date.split("-").map(Number);
      return inWindow(new Date(y, m - 1, d));
    });
    return computeTotals(prevOrders, prevExpenses);
  }, [orders, expenseEntries, dateRange, now]);

  // ----------------------------------------------------------
  // FILTERED ORDERS
  // ----------------------------------------------------------

  // Cost per unit to suggest for an order without a cost: the listing's saved
  // cost per item first, otherwise the most recent cost used for the same item.
  const costHints = useMemo(() => {
    const fromListings = new Map<string, number>();
    for (const listing of listings) {
      if (listing.unitCost !== null && listing.unitCost !== undefined) {
        fromListings.set(listing.ebayItemId, Number(listing.unitCost));
      }
    }
    const fromOrders = new Map<string, number>();
    const oldestFirst = [...orders].sort((a, b) => (a.orderDate ?? "").localeCompare(b.orderDate ?? ""));
    for (const order of oldestFirst) {
      if (isFullyRefunded(order) || !hasRecordedCost(order)) continue;
      const perUnit = Number(order.savedProductCost) / order.quantity;
      if (order.ebayItemId) fromOrders.set(`item:${order.ebayItemId}`, perUnit);
      fromOrders.set(`title:${normalizeTitle(order.item)}`, perUnit);
    }
    return { fromListings, fromOrders };
  }, [orders, listings]);

  function suggestedCost(order: Order): number | null {
    const { fromListings, fromOrders } = costHints;
    return (
      (order.ebayItemId ? fromListings.get(order.ebayItemId) ?? fromOrders.get(`item:${order.ebayItemId}`) : undefined) ??
      fromOrders.get(`title:${normalizeTitle(order.item)}`) ??
      null
    );
  }

  // Today / last 7 days activity for the line under the greeting (always
  // based on the clock, not the date picker, so it never repeats the cards).
  // This calendar month so far: profit after refunds and expenses, for the goal.
  const monthStats = useMemo(() => {
    if (!currentTime) return null;
    const start = new Date(currentTime.getFullYear(), currentTime.getMonth(), 1);
    const inMonth = orders.filter((order) => {
      if (!order.orderDate) return false;
      const date = new Date(order.orderDate);
      return date >= start && date <= currentTime;
    });
    const active = inMonth.filter((order) => !isFullyRefunded(order));
    const orderProfit = active.reduce((sum, order) => sum + (getOrderProfit(order) ?? 0), 0);
    const refundLoss = inMonth.reduce((sum, order) => sum + getRefundLoss(order), 0);
    const monthPrefix = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-`;
    const spent = expenseEntries
      .filter((expense) => expense.date.startsWith(monthPrefix))
      .reduce((sum, expense) => sum + Number(expense.amount), 0);
    return {
      profit: orderProfit - refundLoss - spent,
      sales: active.reduce((sum, order) => sum + order.quantity, 0),
      dayOfMonth: currentTime.getDate(),
      daysInMonth: new Date(currentTime.getFullYear(), currentTime.getMonth() + 1, 0).getDate(),
      monthName: currentTime.toLocaleDateString("en-US", { month: "long" }),
    };
  }, [orders, expenseEntries, currentTime]);

  const activity = useMemo(() => {
    const summarize = (from: Date) => {
      const sales = orders.filter((order) => {
        if (!order.orderDate || isFullyRefunded(order)) return false;
        const date = new Date(order.orderDate);
        return date >= from && (!currentTime || date <= currentTime);
      });
      return {
        sales: sales.reduce((sum, order) => sum + order.quantity, 0),
        profit: sales.reduce((sum, order) => sum + (getOrderProfit(order) ?? 0), 0),
      };
    };
    if (!currentTime) return null;
    const startOfToday = new Date(currentTime);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 6);
    return {
      today: summarize(startOfToday),
      week: summarize(startOfWeek),
      needsCost: orders.filter((order) => !isFullyRefunded(order) && !hasRecordedCost(order)).length,
    };
  }, [orders, currentTime]);

  const recentOrders = useMemo(
    () =>
      [...orders]
        .sort((a, b) => (b.orderDate ?? "").localeCompare(a.orderDate ?? "") || b.id - a.id)
        .slice(0, 5),
    [orders]
  );

  const listingRows = useMemo(() => {
    if (!now) return [];
    const inRange = orders.filter((order) => isOrderInListingRange(order, listingRange, now));
    return buildListingRows(inRange, listings, orders, now, preferences);
  }, [orders, listings, listingRange, now, preferences]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();

    return periodOrders.filter((order) => {
      const matchesSearch =
        order.item.toLowerCase().includes(query) ||
        (order.ebayOrderId ?? "")
          .toLowerCase()
          .includes(query) ||
        (order.ebayBuyerId ?? "").toLowerCase().includes(query);

      const refunded = isFullyRefunded(order);
      const completed = !refunded && hasRecordedCost(order);

      const matchesFilter =
        filter === "all" ||
        (filter === "completed" && completed) ||
        (filter === "pending" && !completed && !refunded) ||
        (filter === "refunded" && refunded);

      return matchesSearch && matchesFilter;
    });
  }, [periodOrders, search, filter]);

  // ----------------------------------------------------------
  // DASHBOARD CHART: running revenue and net profit
  // ----------------------------------------------------------

  const trendPoints = useMemo<TrendPoint[]>(() => {
    if (!now || periodOrders.length === 0) return [];
    const profitByDay = new Map<string, number>();
    const revenueByDay = new Map<string, number>();
    const add = (map: Map<string, number>, key: string, amount: number) => map.set(key, (map.get(key) ?? 0) + amount);

    for (const order of periodOrders) {
      if (!order.orderDate || Number.isNaN(new Date(order.orderDate).getTime())) continue;
      const key = localDateKey(new Date(order.orderDate));
      if (!isFullyRefunded(order)) add(revenueByDay, key, Math.max(0, order.salePrice - order.refundAmount));
      if (!isFullyRefunded(order) && isValidCost(order.savedProductCost)) {
        const profit = getOrderProfit(order);
        if (profit !== null) add(profitByDay, key, profit);
      }
      const loss = getRefundLoss(order);
      if (loss > 0) add(profitByDay, localDateKey(new Date(order.refundedAt ?? order.orderDate)), -loss);
    }
    for (const expense of periodExpenses) add(profitByDay, expense.date, -Number(expense.amount));

    const firstOrder = periodOrders
      .map((order) => (order.orderDate ? new Date(order.orderDate) : null))
      .filter((date): date is Date => date !== null && !Number.isNaN(date.getTime()))
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const startDate = dateRange === "all" ? startOfLocalDay(firstOrder ?? now) : getDateRangeStart(dateRange, now) ?? startOfLocalDay(now);
    const endDate = startOfLocalDay(now);
    const days: Date[] = [];
    for (let current = new Date(startDate); current <= endDate; current.setDate(current.getDate() + 1)) days.push(new Date(current));

    // Keep it readable for long ranges.
    const bucketSize = Math.max(1, Math.ceil(days.length / 60));
    const points: TrendPoint[] = [];
    let revenue = 0;
    let profit = 0;
    for (let index = 0; index < days.length; index += bucketSize) {
      const bucket = days.slice(index, index + bucketSize);
      for (const day of bucket) {
        const key = localDateKey(day);
        revenue += revenueByDay.get(key) ?? 0;
        profit += profitByDay.get(key) ?? 0;
      }
      points.push({
        label: bucket[bucket.length - 1].toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        revenue: Math.round(revenue * 100) / 100,
        profit: Math.round(profit * 100) / 100,
      });
    }
    return points;
  }, [periodOrders, periodExpenses, dateRange, now]);

  // Top 5 listings by profit in the chosen period.
  const topListings = useMemo(() => {
    if (!now) return [];
    return buildListingRows(periodOrders, listings, orders, now, preferences)
      .filter((row) => row.netProfit > 0)
      .sort((a, b) => b.netProfit - a.netProfit)
      .slice(0, 5);
  }, [periodOrders, listings, orders, now, preferences]);

  // Where the money went in the chosen period.
  const costSlices = useMemo<CostSlice[]>(() => {
    const byCategory = new Map<string, number>();
    for (const expense of periodExpenses) byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + Number(expense.amount));
    const expenseColors = ["#94a3b8", "#a78bfa", "#f472b6", "#22d3ee", "#facc15"];
    return [
      { label: "Product costs", amount: totals.totalProductCosts, color: "var(--ps-accent)" },
      { label: "eBay selling fees", amount: totals.totalFees - totals.totalOtherFees, color: "#f59e0b" },
      { label: "Ads & other eBay charges", amount: totals.totalOtherFees, color: "#fb923c" },
      { label: "Shipping", amount: totals.totalLabels, color: "#38bdf8" },
      { label: "Refund losses", amount: totals.refundLosses, color: "var(--ps-loss)" },
      ...[...byCategory].sort((a, b) => b[1] - a[1]).map(([label, amount], i) => ({ label, amount, color: expenseColors[i % expenseColors.length] })),
    ].filter((slice) => slice.amount > 0.004);
  }, [totals, periodExpenses]);

  const attention = useMemo<Attention>(() => {
    const ranked = now ? buildListingRows(orders, listings, orders, now, preferences) : [];
    return {
      needsCost: totals.pendingOrders,
      lowStock: ranked.filter((row) => row.alert === "low").length,
      stale: ranked.filter((row) => row.alert === "stale").length,
      reconnect: stores.filter((store) => store.needsReconnect && !store.locked).map((store) => store.name),
    };
  }, [orders, listings, now, preferences, totals.pendingOrders, stores]);

  // ----------------------------------------------------------
  // SELECTED ORDER
  // ----------------------------------------------------------

  const selectedOrder =
    selectedOrderId === null
      ? null
      : orders.find(
          (order) => order.id === selectedOrderId
        ) ?? null;

  // ----------------------------------------------------------
  // NAVIGATION HELPERS
  // ----------------------------------------------------------

  function goToOrders(
    selectedFilter: OrderFilter = "all"
  ) {
    setFilter(selectedFilter);
    setSearch("");
    navigate("orders");
  }

  // ==========================================================
  // RENDER
  // ==========================================================

  const dateRangeOptions = [
    { value: "7d", label: "7 days" },
    { value: "30d", label: "30 days" },
    { value: "90d", label: "90 days" },
    { value: "all", label: "All time" },
  ] as const;
  const showsDateRange = view === "dashboard" || view === "orders" || view === "expenses";

  return (
    <div className="ps-app min-h-screen bg-bg text-ink-2">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-accent"
      >
        Skip to content
      </a>

      <Sidebar
        view={view}
        onNavigate={(target) => (target === "orders" ? goToOrders() : navigate(target))}
        badges={{
          taxes: onFreePlan ? <Badge tone="accent">Pro</Badge> : null,
          billing: billing?.enabled ? (
            <Badge tone={billing.plan === "free" ? "neutral" : "profit"}>{PLANS[billing.plan].name}</Badge>
          ) : null,
        }}
        mobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        onLogout={() => void logout()}
        loggingOut={loggingOut}
      />

      <div className="ps-main overflow-x-clip">
        <Topbar
          onOpenMenu={() => setSidebarOpen(true)}
          hasStore={stores.length > 0}
          syncing={syncing}
          syncDisabled={syncing || loading || loggingOut || savingId !== null}
          onSync={() => void syncEbayOrders()}
          lastSyncedAt={lastSyncedAt}
          now={currentTime}
          switcher={
            <StoreSwitcher
              stores={stores}
              loading={storesLoading}
              allStores={allStores}
              canUseAllStores={storePlan.canUseAllStores}
              atStoreLimit={storePlan.maxStores !== null && stores.length >= storePlan.maxStores}
              onUpgrade={goToPlans}
              onSwitch={switchStore}
              onRemove={removeStore}
            />
          }
        />

      <main id="main-content" tabIndex={-1} className="outline-none">
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <PageHeader
            title={
              view === "dashboard" ? (
                <>
                  {greeting}
                  {greetingName ? `, ${greetingName}` : ""}
                </>
              ) : (
                VIEW_COPY[view].title
              )
            }
            description={
              view !== "dashboard" ? (
                VIEW_COPY[view].subtitle
              ) : loading || !activity ? (
                "Loading your latest numbers…"
              ) : orders.length === 0 ? (
                <>No sales yet. Press Sync to bring in your orders.</>
              ) : (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    <span className="font-medium text-ink-2">Today</span>{" "}
                    {activity.today.sales === 0 ? (
                      "no sales yet"
                    ) : (
                      <>
                        {activity.today.sales} sale{activity.today.sales === 1 ? "" : "s"} ·{" "}
                        <span className={`ps-num font-semibold ${activity.today.profit < 0 ? "text-loss" : "text-profit"}`}>
                          {activity.today.profit < 0 ? "−" : "+"}
                          {money(Math.abs(activity.today.profit))}
                        </span>
                      </>
                    )}
                  </span>
                  <span className="text-line-strong" aria-hidden="true">|</span>
                  <span>
                    <span className="font-medium text-ink-2">Last 7 days</span>{" "}
                    {activity.week.sales === 0 ? (
                      "no sales"
                    ) : (
                      <>
                        {activity.week.sales} sale{activity.week.sales === 1 ? "" : "s"} ·{" "}
                        <span className={`ps-num font-semibold ${activity.week.profit < 0 ? "text-loss" : "text-profit"}`}>
                          {activity.week.profit < 0 ? "−" : "+"}
                          {money(Math.abs(activity.week.profit))}
                        </span>
                      </>
                    )}
                  </span>
                  {activity.needsCost > 0 && (
                    <>
                      <span className="text-line-strong" aria-hidden="true">|</span>
                      <button
                        type="button"
                        onClick={() => {
                          setDateRange("all");
                          goToOrders("pending");
                        }}
                        className="font-medium text-warn underline-offset-2 hover:underline"
                      >
                        {activity.needsCost} order{activity.needsCost === 1 ? " needs" : "s need"} a cost →
                      </button>
                    </>
                  )}
                </span>
              )
            }
            actions={
              showsDateRange ? (
                <SegmentedControl label="Date range" value={dateRange} options={dateRangeOptions} onChange={setDateRange} />
              ) : view === "listings" ? (
                <>
                  <SegmentedControl label="Sales period" value={listingRange} options={LISTING_RANGES} onChange={setListingRange} />
                  {listings.length > 0 && (
                    <Button variant="secondary" onClick={() => void syncListings()} loading={listingsSyncing} icon={<Icon name="refresh" size={15} />}>
                      Refresh listings
                    </Button>
                  )}
                </>
              ) : undefined
            }
          />

          {loadError && (
            <Notice tone="loss" className="mb-6">
              {loadError}
            </Notice>
          )}

          {onFreePlan && billing && (view === "dashboard" || view === "orders") && (
            <Notice
              className="mb-6"
              action={
                <Button variant="primary" size="sm" onClick={goToPlans}>
                  Unlock unlimited orders
                </Button>
              }
            >
              <span className="font-semibold text-ink">Free plan</span> ·{" "}
              <span className="ps-num">
                {Math.min(billing.usage.ordersThisMonth, billing.limits.monthlyOrders ?? 0)} of {billing.limits.monthlyOrders}
              </span>{" "}
              orders this month · last {billing.limits.historyDays} days of history
            </Notice>
          )}

          {view === "dashboard" && (
            <DashboardView
              loading={loading}
              hasOrders={orders.length > 0}
              totals={totals}
              previous={previousTotals}
              comparisonLabel={dateRange === "7d" ? "vs prior 7 days" : dateRange === "30d" ? "vs prior 30 days" : "vs prior 90 days"}
              rangeLabel={dateRangeLabel(dateRange)}
              trend={trendPoints}
              topListings={topListings}
              costs={costSlices}
              attention={attention}
              recentOrders={recentOrders}
              onOpenOrder={(id) => setSelectedOrderId(id)}
              onGoOrders={(target) => goToOrders(target ?? "all")}
              onGoListings={() => navigate("listings")}
              onSync={() => void syncEbayOrders()}
              goal={
                monthStats ? (
                  <MonthlyGoal
                    goal={monthlyGoal}
                    profit={monthStats.profit}
                    sales={monthStats.sales}
                    dayOfMonth={monthStats.dayOfMonth}
                    daysInMonth={monthStats.daysInMonth}
                    monthName={monthStats.monthName}
                    onSave={saveMonthlyGoal}
                  />
                ) : null
              }
            />
          )}

          {view === "orders" && (
            <OrdersView
              orders={filteredOrders}
              periodOrders={periodOrders}
              allOrdersCount={orders.length}
              loading={loading}
              search={search}
              onSearch={setSearch}
              filter={filter}
              onFilter={setFilter}
              savingId={savingId}
              recentlySavedId={recentlySavedId}
              inputsDisabled={syncing || loggingOut}
              shippingEnabled={shippingEnabled}
              onSaveShipping={saveShippingCost}
              onChangeCost={updateProductCost}
              onSaveCost={saveProductCost}
              onEnterCost={focusNextCostInput}
              suggestedCost={suggestedCost}
              onOpenOrder={(id) => setSelectedOrderId(id)}
              onSync={() => void syncEbayOrders()}
              tools={
                <>
                  {!allStores && <StoreShippingSetting value={storeShipping} onSave={saveStoreShipping} />}
                  <OrderTools
                    orders={toolOrders}
                    periodLabel={dateRangeLabel(dateRange)}
                    shippingEnabled={shippingEnabled}
                    onImported={loadOrders}
                    allowed={limits.exports}
                    onUpgrade={goToPlans}
                  />
                </>
              }
            />
          )}

          {/* =================================================
              LISTINGS
          ================================================= */}

          {view === "taxes" && (
            <TaxReport
              orders={taxOrders}
              expenses={expenseEntries}
              storeLabel={allStores ? "All stores" : activeStore?.name ?? "Your store"}
              allowed={limits.exports}
              onUpgrade={goToPlans}
            />
          )}

          {view === "settings" && (
            <SettingsSection
              preferences={preferences}
              onChange={savePreferences}
              billing={billing}
              storeCount={stores.length}
              onOpenPlans={goToPlans}
              onSignOut={() => void logout()}
            />
          )}

          {view === "billing" && (
            <BillingSection
              key={billing?.interval ?? "none"}
              billing={billing}
              loading={billingLoading}
              notice={billingNotice}
              onChanged={async () => {
                await loadBilling(true);
                await Promise.all([loadStores(), loadOrders()]);
              }}
            />
          )}

          {view === "expenses" && (
            <ExpensesSection
              expenses={periodExpenses}
              enabled={expensesEnabled}
              loading={expensesLoading}
              periodLabel={dateRangeLabel(dateRange)}
              showWholeBusiness={stores.length > 1}
              categories={expenseCategories}
              canRepeat={expensesCanRepeat}
              onAdd={addExpense}
              onUpdate={updateExpense}
              onDelete={deleteExpense}
            />
          )}

          {view === "listings" && (
            <ListingsSection
              rows={listingRows}
              loading={loading || listingsLoading}
              syncing={listingsSyncing}
              range={listingRange}
              hasSyncedListings={listings.length > 0}
              onRefresh={() => void syncListings()}
              onSaveCost={saveListingCost}
              onBulkSaveCost={saveListingCostBulk}
              shippingEnabled={shippingEnabled}
              storeShipping={storeShipping}
              onSaveStoreShipping={saveStoreShipping}
              canSetStoreShipping={!allStores}
              staleAfterDays={preferences.staleAfterDays}
            />
          )}

          {/* =================================================
              FOOTER
          ================================================= */}

          <footer className="mt-10 flex flex-col gap-2 border-t border-line pt-6 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between">
            <span>
              © {new Date().getFullYear()} ProfitSync
            </span>

            <span>
              Built for smarter eBay selling.
            </span>
          </footer>
        </div>
      </main>
      </div>

      {/* =====================================================
          ORDER DETAILS PANEL
      ===================================================== */}

      {selectedOrder && (
        <OrderDetailsPanel
          key={selectedOrder.id}
          order={selectedOrder}
          saving={savingId === selectedOrder.id}
          syncing={syncing}
          loggingOut={loggingOut}
          onClose={() => setSelectedOrderId(null)}
          onChangeCost={updateProductCost}
          onSaveCost={saveProductCost}
          onSaveRefund={saveRefundOutcome}
          shippingEnabled={shippingEnabled}
          onSaveShipping={saveShippingCost}
        />
      )}
    </div>
  );
}