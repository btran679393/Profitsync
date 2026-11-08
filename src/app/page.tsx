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
import AccountBadge from "./AccountBadge";
import ListingsSection, { type ListingRange } from "./ListingsSection";
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

import { type ApiListing, type Order, type ApiOrder, type SyncResponse, type OrderFilter, type DateRange, type ChartPoint, money, isValidCost, formatOrders, isFullyRefunded, getRefundLoss, isPartiallyRefunded, hasRecordedCost, getShippingCost, getOrderProfit, type View, subscribeToHash, viewFromHash, VIEW_COPY, isOrderInListingRange, normalizeTitle, buildListingRows, getDateRangeStart, isOrderInDateRange, dateRangeLabel, formatOrderDate, localDateKey, startOfLocalDay } from "./dashboard/model";
import { Icon } from "./dashboard/Icon";
import { ListingImage } from "./dashboard/ListingImage";
import { MetricCard } from "./dashboard/MetricCard";
import { ProfitChart } from "./dashboard/ProfitChart";
import { ShippingInput, OrderDetailsPanel } from "./dashboard/OrderParts";

// ============================================================
// MAIN DASHBOARD
// ============================================================

export default function Home() {
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
  const [syncMessage, setSyncMessage] = useState("");
  const [syncError, setSyncError] = useState(false);

  // Success messages fade away after a few seconds; errors stay until dismissed.
  useEffect(() => {
    if (!syncMessage || syncError) return;
    const id = window.setTimeout(() => setSyncMessage(""), 8000);
    return () => window.clearTimeout(id);
  }, [syncMessage, syncError]);
  const [loadError, setLoadError] = useState("");

  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

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
  const [listingsMessage, setListingsMessage] = useState("");
  const [listingsError, setListingsError] = useState(false);
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
      setLogoutError("");

      const supabase = createClient();

      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      setOrders([]);
      setSyncMessage("");
      setLoadError("");

      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error("Logout failed:", error);

      setLogoutError(
        "Unable to log out. Please try again."
      );

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
    setSyncMessage("");
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
    if (!quiet) {
      setListingsMessage("");
      setListingsError(false);
    }
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
      if (!quiet) setListingsMessage(data.message ?? "Listings updated.");
    } catch (error) {
      setListingsError(true);
      setListingsMessage(error instanceof Error ? error.message : "Couldn't load your eBay listings.");
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
      setSyncMessage("");
      setSyncError(false);

      // In the "All stores" view, sync each store in turn.
      const targets: Array<EbayStore | null> = allStores ? stores.filter((s) => !s.locked) : [activeStore];
      const results: SyncResponse[] = [];
      for (const target of targets) {
        const response = await fetch(
          target ? `/api/ebay/sync?store=${encodeURIComponent(target.id)}` : "/api/ebay/sync",
          { method: "POST", cache: "no-store" }
        );
        const result: SyncResponse = await response.json();
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
      setSyncMessage(
        `Synced ${found} eBay order${found === 1 ? "" : "s"}` +
          (changes.length ? ` · ${changes.join(" · ")}` : " · everything is up to date") +
          (overLimit > 0
            ? ` · ${overLimit} more order${overLimit === 1 ? "" : "s"} not imported: the Free plan includes ` +
              `${results[0]?.monthlyOrderLimit ?? 50} a month. Upgrade on Plan & billing for unlimited orders.`
            : "")
      );
      // Usage on the plan page changes with new orders.
      if (onFreePlan) void loadBilling();
    } catch (error) {
      console.error("Sync failed:", error);

      setSyncError(true);

      setSyncMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong syncing orders."
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

  function recordSync() {
    try {
      window.localStorage.setItem(syncKey, String(Date.now()));
    } catch {
      // Private browsing etc.: auto-sync just runs again next time.
    }
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
        setSyncError(true);
        setSyncMessage(`eBay store not connected: ${failed}`);
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

  const totals = useMemo(() => {
    const activeOrders = periodOrders.filter((order) => !isFullyRefunded(order));
    const refundedCount = periodOrders.length - activeOrders.length;
    const totalRevenue = activeOrders.reduce(
      (sum, order) => sum + Math.max(0, order.salePrice - order.refundAmount), 0
    );
    const totalFees = activeOrders.reduce((sum, order) => sum + order.ebayFees + order.otherFees, 0);
    const totalLabels = activeOrders.reduce((sum, order) => sum + getShippingCost(order), 0);
    const totalOtherFees = activeOrders.reduce((sum, order) => sum + order.otherFees, 0);
    const completedOrders = activeOrders.filter(hasRecordedCost);
    const totalProductCosts = completedOrders.reduce(
      (sum, order) => sum + Number(order.savedProductCost), 0
    );
    const completedProfit = completedOrders.reduce(
      (sum, order) => sum + (getOrderProfit(order) ?? 0), 0
    );
    const refundLosses = periodOrders.reduce((sum, order) => sum + getRefundLoss(order), 0);
    const expensesTotal = periodExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    const netProfit = completedProfit - refundLosses - expensesTotal;
    const completedRevenue = completedOrders.reduce(
      (sum, order) => sum + Math.max(0, order.salePrice - order.refundAmount), 0
    );
    const profitMargin = completedRevenue > 0
      ? (netProfit / completedRevenue) * 100 : 0;
    const pendingOrders = activeOrders.length - completedOrders.length;
    return {
      totalRevenue, totalFees, totalLabels, totalOtherFees, totalProductCosts, netProfit, expensesTotal, refundLosses, profitMargin,
      completedCount: completedOrders.length, pendingOrders,
      orderCount: activeOrders.length, refundedCount,
    };
  }, [periodOrders, periodExpenses]);

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
  // COMPLETION PERCENTAGE
  // ----------------------------------------------------------

  const completionPercentage =
    totals.orderCount > 0
      ? (totals.completedCount / totals.orderCount) * 100
      : 0;

  // ----------------------------------------------------------
  // REAL PROFIT CHART
  // ----------------------------------------------------------

  const chartData = useMemo(() => {
    if (!now) {
      return {
        points: [] as ChartPoint[],
        hasData: false,
      };
    }

    const completedOrders = periodOrders.filter(
      (order) =>
        !isFullyRefunded(order) &&
        isValidCost(order.savedProductCost) &&
        order.orderDate &&
        !Number.isNaN(
          new Date(order.orderDate).getTime()
        )
    );

    if (completedOrders.length === 0) {
      return {
        points: [] as ChartPoint[],
        hasData: false,
      };
    }

    const profitByDay = new Map<string, number>();

    for (const order of completedOrders) {
      const profit = getOrderProfit(order);

      if (profit === null || !order.orderDate) {
        continue;
      }

      const date = new Date(order.orderDate);
      const key = localDateKey(date);

      profitByDay.set(
        key,
        (profitByDay.get(key) ?? 0) + profit
      );
    }

    // Match the Net Profit headline: refund losses and expenses count too,
    // on the day they happened.
    for (const order of periodOrders) {
      const loss = getRefundLoss(order);
      if (loss <= 0 || !order.orderDate) continue;
      const key = localDateKey(new Date(order.refundedAt ?? order.orderDate));
      profitByDay.set(key, (profitByDay.get(key) ?? 0) - loss);
    }
    for (const expense of periodExpenses) {
      profitByDay.set(expense.spentOn, (profitByDay.get(expense.spentOn) ?? 0) - Number(expense.amount));
    }

    const sortedDates = Array.from(
      profitByDay.keys()
    ).sort();

    if (sortedDates.length === 0) {
      return {
        points: [] as ChartPoint[],
        hasData: false,
      };
    }

    let startDate: Date;

    if (dateRange === "all") {
      const first = completedOrders
        .map((order) => new Date(order.orderDate!))
        .sort(
          (a, b) => a.getTime() - b.getTime()
        )[0];

      startDate = startOfLocalDay(first);
    } else {
      startDate =
        getDateRangeStart(dateRange, now) ??
        startOfLocalDay(now);
    }

    const endDate = startOfLocalDay(now);

    const days: Date[] = [];

    for (
      let current = new Date(startDate);
      current <= endDate;
      current.setDate(current.getDate() + 1)
    ) {
      days.push(new Date(current));
    }

    if (days.length === 0) {
      return {
        points: [] as ChartPoint[],
        hasData: false,
      };
    }

    // Keep the chart readable for longer date ranges.
    const maxPoints = 45;
    const bucketSize = Math.max(
      1,
      Math.ceil(days.length / maxPoints)
    );

    const points: ChartPoint[] = [];

    let cumulativeProfit = 0;

    for (
      let index = 0;
      index < days.length;
      index += bucketSize
    ) {
      const bucket = days.slice(
        index,
        index + bucketSize
      );

      for (const day of bucket) {
        cumulativeProfit +=
          profitByDay.get(localDateKey(day)) ?? 0;
      }

      const lastDay = bucket[bucket.length - 1];

      points.push({
        label: lastDay.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        value: Math.round(cumulativeProfit * 100) / 100,
      });
    }

    return {
      points,
      hasData: true,
    };
  }, [periodOrders, periodExpenses, dateRange, now]);

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

  const navItemClass = (active: boolean) =>
    `flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition ${
      active
        ? "border border-blue-500/20 bg-blue-600/15 font-semibold text-blue-400"
        : "border border-transparent font-medium text-slate-400 hover:bg-white/5 hover:text-white"
    }`;

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="ps-app min-h-screen bg-[#0b1120] text-slate-100">
      {/* =====================================================
          MOBILE HEADER
      ===================================================== */}

      <div className="flex items-center justify-between border-b border-white/10 bg-[#101827] px-5 py-4 lg:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Icon name="chart" />
          </div>

          <span className="text-lg font-bold">
            ProfitSync
          </span>
        </div>

        <button
          type="button"
          onClick={() =>
            setSidebarOpen(!sidebarOpen)
          }
          aria-label="Toggle navigation"
          className="relative z-50 rounded-lg border border-white/10 p-2 text-slate-300"
        >
          <Icon
            name={sidebarOpen ? "close" : "menu"}
          />
        </button>
      </div>

      {/* =====================================================
          MOBILE SIDEBAR BACKDROP
      ===================================================== */}

      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
        />
      )}

      {/* =====================================================
          SIDEBAR
      ===================================================== */}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/[0.07] bg-[#101827] transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen
            ? "translate-x-0"
            : "-translate-x-full"
        }`}
      >
        {/* Logo */}

        <div className="flex h-20 items-center gap-3 border-b border-white/[0.07] px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
            <Icon name="chart" size={22} />
          </div>

          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              ProfitSync
            </h1>

            <p className="text-[11px] tracking-widest text-slate-500">
              SELLER ANALYTICS
            </p>
          </div>
        </div>

        {/* Navigation */}

        <div className="flex-1 px-4 py-7">
          <p className="mb-4 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Workspace
          </p>

          <nav className="space-y-2">
            <button
              type="button"
              onClick={() => navigate("dashboard")}
              aria-current={view === "dashboard" ? "page" : undefined}
              className={navItemClass(view === "dashboard")}
            >
              <Icon name="dashboard" size={19} />
              Dashboard
            </button>

            <button
              type="button"
              onClick={() => goToOrders()}
              aria-current={view === "orders" ? "page" : undefined}
              className={navItemClass(view === "orders")}
            >
              <Icon name="orders" size={19} />
              Orders
            </button>

            <button
              type="button"
              onClick={() => navigate("listings")}
              aria-current={view === "listings" ? "page" : undefined}
              className={navItemClass(view === "listings")}
            >
              <Icon name="box" size={19} />
              Listings
            </button>

            <button
              type="button"
              onClick={() => navigate("expenses")}
              aria-current={view === "expenses" ? "page" : undefined}
              className={navItemClass(view === "expenses")}
            >
              <Icon name="wallet" size={19} />
              Expenses
            </button>

            <button
              type="button"
              onClick={() => navigate("taxes")}
              aria-current={view === "taxes" ? "page" : undefined}
              className={navItemClass(view === "taxes")}
            >
              <Icon name="receipt" size={19} />
              Taxes
              {onFreePlan && (
                <span className="ml-auto rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-300">
                  Pro
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate("billing")}
              aria-current={view === "billing" ? "page" : undefined}
              className={navItemClass(view === "billing")}
            >
              <Icon name="sparkle" size={19} />
              Plan &amp; billing
              {billing?.enabled && (
                <span
                  className={`ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    billing.plan === "free" ? "bg-white/[0.06] text-slate-400" : "bg-emerald-500/15 text-emerald-300"
                  }`}
                >
                  {PLANS[billing.plan].name}
                </span>
              )}
            </button>

          </nav>

          {/* eBay stores: switch between them or add another */}

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
        </div>

        {/* Account, settings and log out */}

        <div className="border-t border-white/[0.07] p-4">
          <AccountBadge />

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => navigate("settings")}
              aria-current={view === "settings" ? "page" : undefined}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                view === "settings"
                  ? "bg-blue-600/15 text-blue-400"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon name="gear" size={17} />
              Settings
            </button>

            <button
              type="button"
              onClick={logout}
              disabled={
                loggingOut ||
                syncing ||
                savingId !== null
              }
              className="flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="logout" size={17} />

              {loggingOut
                ? "Logging out..."
                : "Log out"}
            </button>
          </div>
        </div>
      </aside>

      {/* =====================================================
          MAIN CONTENT
      ===================================================== */}

      <main
        id="dashboard"
        className="min-h-screen lg:ml-64"
      >
        <div className="mx-auto max-w-[1600px] px-5 py-7 sm:px-8 lg:px-10">
          {/* =================================================
              TOP HEADER
          ================================================= */}

          <header className="mb-9 flex flex-col gap-5 border-b border-white/[0.07] pb-7 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                <span>Workspace</span>
                <span>/</span>
                <span className="text-blue-400">
                  {view === "dashboard" ? "Dashboard" : VIEW_COPY[view].title}
                </span>
              </div>

              {view === "dashboard" ? (
                <>
                  <h2 className="text-3xl font-bold tracking-tight text-white">
                    {greeting}
                    {greetingName ? `, ${greetingName}` : ""}{" "}
                    <span aria-hidden="true">👋</span>
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {loading || !activity ? (
                      "Loading your latest numbers…"
                    ) : orders.length === 0 ? (
                      <>No sales yet. Click &ldquo;Sync eBay Orders&rdquo; to bring in your eBay sales.</>
                    ) : (
                      <>
                        <span className="font-semibold text-slate-200">Today:</span>{" "}
                        {activity.today.sales === 0 ? (
                          "no sales yet"
                        ) : (
                          <>
                            {activity.today.sales} sale{activity.today.sales === 1 ? "" : "s"} ·{" "}
                            <span className={`font-semibold ${activity.today.profit < 0 ? "text-red-400" : "text-emerald-400"}`}>
                              {activity.today.profit < 0 ? "−" : "+"}{money(Math.abs(activity.today.profit))}
                            </span>
                          </>
                        )}
                        <span className="mx-2 text-slate-600">|</span>
                        <span className="font-semibold text-slate-200">Last 7 days:</span>{" "}
                        {activity.week.sales === 0 ? (
                          "no sales"
                        ) : (
                          <>
                            {activity.week.sales} sale{activity.week.sales === 1 ? "" : "s"} ·{" "}
                            <span className={`font-semibold ${activity.week.profit < 0 ? "text-red-400" : "text-emerald-400"}`}>
                              {activity.week.profit < 0 ? "−" : "+"}{money(Math.abs(activity.week.profit))}
                            </span>
                          </>
                        )}
                        {activity.needsCost > 0 && (
                          <>
                            <span className="mx-2 text-slate-600">|</span>
                            <button
                              type="button"
                              onClick={() => {
                                setDateRange("all");
                                goToOrders("pending");
                              }}
                              className="font-semibold text-amber-400 transition hover:text-amber-300"
                            >
                              {activity.needsCost} order{activity.needsCost === 1 ? " needs" : "s need"} a cost →
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-3xl font-bold tracking-tight text-white">
                    {VIEW_COPY[view].title}
                  </h2>

                  <p className="mt-2 text-sm text-slate-400">
                    {VIEW_COPY[view].subtitle}
                  </p>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={syncEbayOrders}
              disabled={
                syncing ||
                loading ||
                loggingOut ||
                savingId !== null
              }
              className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/15 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon
                name="refresh"
                size={17}
                className={
                  syncing ? "animate-spin" : ""
                }
              />

              {syncing
                ? "Syncing Orders..."
                : "Sync eBay Orders"}
            </button>
          </header>

          {/* =================================================
              NOTIFICATIONS
          ================================================= */}

          {logoutError && (
            <div
              role="alert"
              className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-400"
            >
              {logoutError}
            </div>
          )}

          {syncMessage && (
            <div
              role={syncError ? "alert" : "status"}
              className={`mb-6 rounded-xl border px-5 py-4 text-sm ${
                syncError
                  ? "border-red-500/20 bg-red-500/10 text-red-400"
                  : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <span>{syncMessage}</span>
                <button
                  type="button"
                  onClick={() => setSyncMessage("")}
                  aria-label="Dismiss"
                  className="shrink-0 opacity-60 transition hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {loadError && (
            <div
              role="alert"
              className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-400"
            >
              {loadError}
            </div>
          )}

          {onFreePlan && billing && (view === "dashboard" || view === "orders") && (
            <div className="mb-6 flex flex-col gap-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] px-5 py-3.5 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="text-slate-300">
                <span className="font-semibold text-white">Free plan</span> ·{" "}
                {Math.min(billing.usage.ordersThisMonth, billing.limits.monthlyOrders ?? 0)} of{" "}
                {billing.limits.monthlyOrders} orders this month · last {billing.limits.historyDays} days of history
              </span>
              <button
                type="button"
                onClick={goToPlans}
                className="shrink-0 self-start rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 sm:self-auto"
              >
                Unlock unlimited orders
              </button>
            </div>
          )}

          {(view === "dashboard" || view === "orders" || view === "expenses") && (
          <>
          {/* =================================================
              OVERVIEW HEADER + DATE FILTER
          ================================================= */}

          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-[12rem]">
              <h3 className="text-lg font-semibold text-white">
                {view === "orders" ? "Order history" : view === "expenses" ? "Your expenses" : "Financial Overview"}
              </h3>

              <p className="mt-1 text-xs text-slate-500">
                {view === "orders" ? "Choose which orders to show" : view === "expenses" ? "Choose which expenses to show" : "Your store at a glance"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
            {view === "orders" && (
              <div className="flex flex-wrap items-center gap-2">
                {!allStores && <StoreShippingSetting value={storeShipping} onSave={saveStoreShipping} />}
                <OrderTools
                  orders={toolOrders}
                  periodLabel={dateRangeLabel(dateRange)}
                  shippingEnabled={shippingEnabled}
                  onImported={loadOrders}
                  allowed={limits.exports}
                  onUpgrade={goToPlans}
                />
              </div>
            )}

            <div className="relative inline-flex w-fit items-center">
              <Icon
                name="calendar"
                size={16}
                className="absolute left-3 text-slate-400"
              />

              <select
                value={dateRange}
                onChange={(event) =>
                  setDateRange(
                    event.target.value as DateRange
                  )
                }
                aria-label="Select date range"
                className="min-w-44 appearance-none rounded-xl border border-white/10 bg-[#151d2d] py-2.5 pl-10 pr-10 text-sm text-slate-200 outline-none transition focus:border-blue-500"
              >
                <option value="7d">
                  Last 7 Days
                </option>

                <option value="30d">
                  Last 30 Days
                </option>

                <option value="90d">
                  Last 90 Days
                </option>

                <option value="all">
                  All Time
                </option>
              </select>

              <Icon
                name="chevron"
                size={15}
                className="pointer-events-none absolute right-3 rotate-90 text-slate-500"
              />
            </div>
            </div>
          </div>

          </>
          )}
          {view === "dashboard" && (
          <>
          {/* =================================================
              FINANCIAL METRIC CARDS
          ================================================= */}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Total Revenue"
              value={money(totals.totalRevenue)}
              description={`${totals.orderCount} active orders; ${totals.refundedCount} refunded excluded`}
              icon="wallet"
              accent="blue"
            />

            <MetricCard
              title={totals.totalLabels > 0 ? "eBay Fees & Shipping" : "eBay Fees"}
              value={money(totals.totalFees + totals.totalLabels)}
              description={totals.totalLabels > 0
                ? `${money(totals.totalFees)} fees · ${money(totals.totalLabels)} shipping`
                : totals.totalOtherFees > 0
                  ? `Includes ${money(totals.totalOtherFees)} in ad & other eBay fees`
                  : "Fees on non-fully-refunded orders"}
              icon="dollar"
              accent="amber"
            />

            <MetricCard
              title="Product Costs"
              value={money(totals.totalProductCosts)}
              description={`${totals.completedCount} orders with saved costs`}
              icon="box"
              accent="purple"
            />

            <MetricCard
              title="Net Profit"
              value={money(totals.netProfit)}
              description={
                totals.expensesTotal > 0
                  ? `After ${money(totals.expensesTotal)} in other expenses`
                  : `Calculated from ${totals.completedCount} completed orders`
              }
              icon="trending"
              accent="green"
              featured
            />
          </div>

          {monthStats && (
            <MonthlyGoal
              goal={monthlyGoal}
              profit={monthStats.profit}
              sales={monthStats.sales}
              dayOfMonth={monthStats.dayOfMonth}
              daysInMonth={monthStats.daysInMonth}
              monthName={monthStats.monthName}
              onSave={saveMonthlyGoal}
            />
          )}

          {/* =================================================
              PROFIT PERFORMANCE
          ================================================= */}

          <section
            id="performance"
            className="mt-6 grid gap-5 xl:grid-cols-3"
          >
            {/* Chart */}

            <div className="rounded-2xl border border-white/[0.07] bg-[#151d2d] p-6 xl:col-span-2">
              <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Profit Performance
                  </h3>

                  <p className="mt-1 text-xs text-slate-500">
                    Cumulative net profit over time
                  </p>
                </div>

                <div className="flex items-center gap-2 rounded-full border border-emerald-500/15 bg-emerald-500/[0.07] px-3 py-1.5 text-xs font-medium text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Actual Order Data
                </div>
              </div>

              <div className="mb-6 flex flex-wrap items-end gap-5">
                <div>
                  <p className="text-xs text-slate-500">
                    Calculated Net Profit
                  </p>

                  <p
                    className={`mt-2 text-3xl font-bold ${
                      totals.netProfit >= 0
                        ? "text-white"
                        : "text-red-400"
                    }`}
                  >
                    {money(totals.netProfit)}
                  </p>
                </div>

                <div className="mb-1 rounded-lg bg-white/[0.05] px-3 py-2 text-xs text-slate-400">
                  {dateRangeLabel(dateRange)}
                </div>
              </div>

              <ProfitChart
                points={chartData.points}
                hasData={chartData.hasData}
              />

              <div className="mt-6 flex items-start gap-2 border-t border-white/[0.07] pt-5">
                <Icon
                  name="info"
                  size={15}
                  className="mt-0.5 shrink-0 text-slate-500"
                />

                <p className="text-xs leading-5 text-slate-500">
                  Chart shows cumulative estimated
                  profit from orders with saved
                  product costs. Other unrecorded
                  expenses may affect actual profit.
                </p>
              </div>
            </div>

            {/* Right-side summary */}

            <div className="flex flex-col gap-4">
              {/* Refund losses: separate summary card above Profit Margin */}
              <div className="rounded-2xl border border-rose-500/20 bg-[#151d2d] p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Refund Losses</h3>
                  <div className="rounded-xl bg-rose-500/10 p-2 text-rose-400">
                    <Icon name="alert" size={18} />
                  </div>
                </div>
                <p className="text-3xl font-bold tracking-tight text-rose-400">
                  {totals.refundLosses > 0 ? `−${money(totals.refundLosses)}` : money(0)}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {totals.refundedCount} refunded orders · Losses included in net profit
                </p>
              </div>

              {/* Profit margin */}

              <div className="rounded-2xl border border-white/[0.07] bg-[#151d2d] p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">
                    Profit Margin
                  </h3>

                  <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-400">
                    <Icon name="trending" size={19} />
                  </div>
                </div>

                <p
                  className={`text-4xl font-bold tracking-tight ${
                    totals.profitMargin >= 0
                      ? "text-white"
                      : "text-red-400"
                  }`}
                >
                  {totals.profitMargin.toFixed(1)}%
                </p>

                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Percentage of revenue kept as
                  profit on completed orders.
                </p>
              </div>

              {/* Order completion */}

              <div className="rounded-2xl border border-white/[0.07] bg-[#151d2d] p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">
                    Order Completion
                  </h3>

                  <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-400">
                    <Icon name="check" size={19} />
                  </div>
                </div>

                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-bold text-white">
                      {completionPercentage.toFixed(0)}%
                    </p>

                    <p className="mt-2 text-xs text-slate-500">
                      Costs recorded
                    </p>
                  </div>

                  <span className="text-xs text-slate-400">
                    {totals.completedCount}/
                    {totals.orderCount}
                  </span>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-300"
                    style={{
                      width: `${completionPercentage}%`,
                    }}
                  />
                </div>

                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      Completed
                    </span>

                    <span className="font-semibold text-white">
                      {totals.completedCount}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-amber-400" />
                      Cost Needed
                    </span>

                    <span className="font-semibold text-white">
                      {totals.pendingOrders}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* =================================================
              NEEDS ATTENTION
          ================================================= */}

          <section className="mt-6">
            <div className="rounded-2xl border border-white/[0.07] bg-[#151d2d] p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Needs Attention
                  </h3>

                  <p className="mt-1 text-xs text-slate-500">
                    Tasks that help improve your
                    financial accuracy
                  </p>
                </div>

                {totals.pendingOrders > 0 ? (
                  <span className="rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-400">
                    {totals.pendingOrders} Orders
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400">
                    All Clear
                  </span>
                )}
              </div>

              {totals.pendingOrders > 0 ? (
                <button
                  type="button"
                  onClick={() => goToOrders("pending")}
                  className="flex w-full items-center justify-between gap-4 rounded-xl border border-amber-500/10 bg-amber-500/[0.035] p-4 text-left transition hover:border-amber-500/25 hover:bg-amber-500/[0.06]"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                      <Icon name="alert" size={21} />
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-white">
                        {totals.pendingOrders}{" "}
                        {totals.pendingOrders === 1
                          ? "order is"
                          : "orders are"}{" "}
                        missing product costs
                      </p>

                      <p className="mt-1 text-xs text-slate-400">
                        Add costs to calculate
                        accurate estimated profit.
                      </p>
                    </div>
                  </div>

                  <Icon
                    name="chevron"
                    size={19}
                    className="shrink-0 text-slate-400"
                  />
                </button>
              ) : (
                <div className="flex items-center gap-4 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.035] p-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                    <Icon name="check" size={21} />
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-white">
                      You&apos;re all caught up
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      Every order in this period has
                      a saved product cost.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* =================================================
              RECENT ORDERS (preview; full table is on Orders)
          ================================================= */}

          <section className="mt-6 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#151d2d]">
            <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-6 py-5">
              <div>
                <h3 className="text-base font-semibold text-white">Recent orders</h3>
                <p className="mt-1 text-xs text-slate-500">Your latest eBay sales</p>
              </div>
              <button
                type="button"
                onClick={() => goToOrders()}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-blue-400 transition hover:bg-blue-500/10 hover:text-blue-300"
              >
                View all orders
                <Icon name="arrow" size={15} />
              </button>
            </div>

            {loading ? (
              <div className="px-6 py-10 text-center text-sm text-slate-400">Loading recent orders…</div>
            ) : recentOrders.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-slate-400">
                No orders yet. Click “Sync eBay Orders” to bring in your sales.
              </div>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {recentOrders.map((order) => {
                  const refunded = isFullyRefunded(order);
                  const profit = getOrderProfit(order);
                  return (
                    <li key={order.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedOrderId(order.id)}
                        className="flex w-full items-center gap-4 px-6 py-3.5 text-left transition hover:bg-white/[0.03]"
                      >
                        <ListingImage imageUrl={order.imageUrl} item={order.item} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white" title={order.item}>{order.item}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{formatOrderDate(order.orderDate)}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-slate-200">{money(order.salePrice)}</p>
                          {refunded ? (
                            <span className="mt-1 inline-block rounded-md bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-400">Refunded</span>
                          ) : profit === null ? (
                            <span className="mt-1 inline-block rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-400">Needs cost</span>
                          ) : (
                            <p className={`mt-0.5 text-xs font-semibold ${profit < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                              {profit < 0 ? "−" : "+"}{money(Math.abs(profit))} profit
                            </p>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          </>
          )}

          {view === "orders" && (
          <>
          {/* =================================================
              ORDER MANAGEMENT
          ================================================= */}

          <section
            id="orders"
            className="mt-7 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#151d2d]"
          >
            {/* Table header */}

            <div className="border-b border-white/[0.07] px-6 py-6">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Order Management
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    Review your orders and manage
                    product costs.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  {/* Search */}

                  <div className="relative">
                    <Icon
                      name="search"
                      size={18}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                    />

                    <input
                      type="search"
                      value={search}
                      onChange={(event) =>
                        setSearch(event.target.value)
                      }
                      placeholder="Search orders..."
                      aria-label="Search orders"
                      className="w-full rounded-xl border border-white/10 bg-[#0b1120] py-2.5 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-500 sm:w-64"
                    />
                  </div>

                  {/* Status filter */}

                  <div className="relative">
                    <select
                      value={filter}
                      onChange={(event) =>
                        setFilter(
                          event.target.value as OrderFilter
                        )
                      }
                      aria-label="Filter orders by status"
                      className="w-full min-w-[10rem] appearance-none rounded-xl border border-white/10 bg-[#0b1120] py-2.5 pl-4 pr-10 text-sm text-slate-300 outline-none focus:border-blue-500"
                    >
                      <option value="all">
                        All Orders
                      </option>

                      <option value="completed">
                        Completed
                      </option>

                      <option value="pending">
                        Cost Needed
                      </option>
                      <option value="refunded">Refunded</option>
                    </select>

                    <Icon
                      name="chevron"
                      size={15}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-slate-500"
                    />
                  </div>
                </div>
              </div>

              {/* Summary badges */}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span className="rounded-lg bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-slate-400">
                  {filteredOrders.length} orders shown
                </span>

                <span className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400">
                  {totals.completedCount} completed
                </span>

                <span className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400">
                  {totals.pendingOrders} need costs
                </span>
                <span className="rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-400">
                  {totals.refundedCount} refunded
                </span>
              </div>
            </div>

            {/* =================================================
                ORDERS TABLE
            ================================================= */}

            {loading ? (
              <div className="py-20 text-center text-sm text-slate-400">
                Loading your eBay orders...
              </div>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[1200px] table-fixed">
                  <colgroup>
                    <col className="w-[36%]" />
                    <col className="w-[11%]" />
                    <col className="w-[11%]" />
                    <col className="w-[15%]" />
                    <col className="w-[11%]" />
                    <col className="w-[12%]" />
                    <col className="w-[4%]" />
                  </colgroup>

                  <thead className="bg-[#111827]">
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-6 py-4">
                        Product
                      </th>

                      <th className="px-3 py-4">
                        Sale Price
                      </th>

                      <th className="px-3 py-4">
                        Fees · Shipping
                      </th>

                      <th className="px-3 py-4">
                        Product Cost
                      </th>

                      <th className="px-3 py-4">
                        Profit
                      </th>

                      <th className="px-3 py-4">
                        Status
                      </th>

                      <th className="px-3 py-4">
                        <span className="sr-only">
                          Details
                        </span>
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-white/[0.06]">
                    {filteredOrders.map((order) => {
                      const refunded = isFullyRefunded(order);
                      const partialRefund = isPartiallyRefunded(order);
                      const hasSavedCost = isValidCost(
                        order.savedProductCost
                      );

                      const hasValidDraft = isValidCost(
                        order.productCost
                      );

                      const profit =
                        order.salePrice - order.refundAmount -
                        order.ebayFees - order.otherFees - getShippingCost(order) - Number(order.productCost);

                      const isSaving =
                        savingId === order.id;

                      const draftChanged = order.productCost !== order.savedProductCost;
                      const draftValid = order.productCost.trim() === "" || isValidCost(order.productCost);
                      const suggestion = !refunded && order.savedProductCost === "" ? suggestedCost(order) : null;

                      return (
                        <tr
                          key={order.id}
                          className="transition hover:bg-white/[0.025]"
                        >
                          {/* Product */}

                          <td className="px-6 py-4">
                            <div className="flex items-center gap-4">
                              <ListingImage
                                imageUrl={order.imageUrl}
                                item={order.item}
                              />

                              <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedOrderId(
                                      order.id
                                    )
                                  }
                                  className="break-words text-left text-sm font-medium leading-6 text-slate-200 transition hover:text-blue-400"
                                >
                                  {order.item}
                                </button>

                                <p className="mt-1 text-[11px] text-blue-300/80">
                                  Buyer: {order.ebayBuyerId || "Unavailable"}
                                </p>
                                <p className="mt-1 text-[11px] text-slate-500">
                                  {formatOrderDate(
                                    order.orderDate
                                  )}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Sale price */}

                          <td className="px-3 py-4 text-sm font-medium text-slate-200">
                            {refunded ? (
                              <span className="text-slate-500 line-through">{money(order.salePrice)}</span>
                            ) : (
                              <div>{money(Math.max(0, order.salePrice - order.refundAmount))}
                                {partialRefund && <p className="text-[11px] text-orange-400">Refund: {money(order.refundAmount)}</p>}
                              </div>
                            )}
                          </td>

                          {/* eBay fees */}

                          <td className="px-3 py-4 text-sm text-slate-400">
                            {money(order.ebayFees)}
                            {order.otherFees > 0 && (
                              <p className="mt-0.5 text-[11px] text-slate-500" title="Other eBay charges for this order, e.g. promoted-listing ad fees">
                                + {money(order.otherFees)} other eBay fees
                              </p>
                            )}
                            {!refunded && (
                              <ShippingInput
                                order={order}
                                enabled={shippingEnabled}
                                onSave={saveShippingCost}
                                className="mt-1.5 w-28"
                              />
                            )}
                          </td>

                          {/* Product cost */}

                          <td className="px-3 py-4">
                            {refunded ? <span className="text-xs text-slate-500">Not required</span> : (
                                <div className="w-32">
                                  <div className="relative">
                                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={order.productCost}
                                      placeholder="0.00"
                                      aria-label={`Product cost for ${order.item}`}
                                      data-cost-input
                                      data-needs-cost={order.savedProductCost === "" ? "true" : undefined}
                                      disabled={isSaving || syncing || loggingOut}
                                      onChange={(event) => updateProductCost(order.id, event.target.value)}
                                      onBlur={(event) => saveProductCost(order.id, event.target.value)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                          event.preventDefault();
                                          focusNextCostInput(event.currentTarget);
                                        }
                                        if (event.key === "Escape") {
                                          updateProductCost(order.id, order.savedProductCost);
                                        }
                                      }}
                                      className={`w-full rounded-lg border bg-[#0b1120] py-2 pl-6 pr-7 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-50 ${
                                        draftValid ? (order.savedProductCost === "" ? "border-amber-500/30" : "border-white/10") : "border-red-500/60"
                                      }`}
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2" aria-live="polite">
                                      {isSaving ? (
                                        <span className="block h-3 w-3 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" aria-label="Saving" />
                                      ) : recentlySavedId === order.id ? (
                                        <Icon name="check" size={14} className="text-emerald-400" />
                                      ) : null}
                                    </span>
                                  </div>
                                  {draftChanged && draftValid && order.productCost.trim() !== "" ? (
                                    <p className={`mt-1 text-[11px] font-medium ${profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                      = {money(profit)} profit · Enter to save
                                    </p>
                                  ) : !draftValid ? (
                                    <p className="mt-1 text-[11px] text-red-400">Like 8 or 8.50</p>
                                  ) : suggestion !== null ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const cost = (suggestion * order.quantity).toFixed(2);
                                        updateProductCost(order.id, cost);
                                        void saveProductCost(order.id, cost);
                                      }}
                                      className="mt-1 text-[11px] font-semibold text-blue-400 transition hover:text-blue-300"
                                    >
                                      Use {money(suggestion * order.quantity)}{order.quantity > 1 ? ` (${order.quantity}×)` : ""} · last time
                                    </button>
                                  ) : null}
                                </div>
                            )}
                          </td>

                          {/* Profit */}

                          <td className="px-3 py-4">
                            {refunded ? (
                              <span className={`text-sm font-semibold ${getRefundLoss(order) > 0 ? "text-red-400" : "text-slate-500"}`}>
                                {money(-getRefundLoss(order))}
                              </span>
                            ) : hasValidDraft ? (
                              <span
                                className={`text-sm font-semibold ${
                                  profit >= 0
                                    ? "text-emerald-400"
                                    : "text-red-400"
                                }`}
                              >
                                {money(profit)}
                              </span>
                            ) : (
                              <span className="text-sm text-slate-600">
                                Pending
                              </span>
                            )}
                          </td>

                          {/* Status */}

                          <td className="px-3 py-4">
                            {refunded ? (
                              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-400">Refunded</span>
                            ) : partialRefund ? (
                              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-400">Partially Refunded</span>
                            ) : hasSavedCost ? (
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-500/10 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                Completed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-500/10 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                                Cost Needed
                              </span>
                            )}
                          </td>

                          {/* Details button */}

                          <td className="px-3 py-4">
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedOrderId(order.id)
                              }
                              aria-label={`View details for ${order.item}`}
                              className="rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-white"
                            >
                              <Icon
                                name="chevron"
                                size={18}
                              />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Empty state */}

                {filteredOrders.length === 0 && (
                  <div className="py-16 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.04] text-slate-500">
                      <Icon name="search" size={22} />
                    </div>

                    <p className="text-sm font-medium text-slate-300">
                      No orders found
                    </p>

                    <p className="mt-2 text-xs text-slate-500">
                      {orders.length === 0
                        ? "Sync your eBay account to import orders."
                        : "Try changing your date range, search, or status filter."}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* =================================================
                TABLE FOOTER
            ================================================= */}

            {!loading && filteredOrders.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-white/[0.07] bg-[#111827] px-6 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Showing {filteredOrders.length} of{" "}
                  {periodOrders.length} orders in the
                  selected period
                </span>

                <span>
                  Click a product to view details.
                  Costs save when you leave an input.
                </span>
              </div>
            )}
          </section>
          </>
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
              message={listingsMessage}
              messageIsError={listingsError}
              range={listingRange}
              onRangeChange={setListingRange}
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

          <footer className="mt-8 flex flex-col gap-2 border-t border-white/[0.06] pt-6 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <span>
              © {new Date().getFullYear()} ProfitSync
            </span>

            <span>
              Built for smarter eBay selling.
            </span>
          </footer>
        </div>
      </main>

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