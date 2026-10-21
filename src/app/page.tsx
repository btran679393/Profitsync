
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Order = {
  id: number;
  ebayOrderId: string | null;
  item: string;
  salePrice: number;
  ebayFees: number;
  productCost: string;
  status: string;
};

type ApiOrder = {
  id: number;
  ebayOrderId: string | null;
  item: string;
  salePrice: string | number;
  ebayFees: string | number;
  productCost: string | number | null;
  status: string;
};

type SyncResponse = {
  success?: boolean;
  found?: number;
  imported?: number;
  skipped?: number;
  error?: string;
  message?: string;
};

function money(value: number) {
  return `$${value.toFixed(2)}`;
}

function formatOrders(data: ApiOrder[]): Order[] {
  return data.map((order) => ({
    id: order.id,
    ebayOrderId: order.ebayOrderId,
    item: order.item,
    salePrice: Number(order.salePrice),
    ebayFees: Number(order.ebayFees),
    productCost:
      order.productCost === null
        ? ""
        : String(order.productCost),
    status: order.status,
  }));
}

export default function Home() {
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncError, setSyncError] = useState(false);
  const [loadError, setLoadError] = useState("");

  // Logout state
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  async function logout() {
    if (loggingOut) {
      return;
    }

    try {
      setLoggingOut(true);
      setLogoutError("");

      const supabase = createClient();

      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      // Clear this account's information from the screen.
      setOrders([]);
      setSyncMessage("");
      setLoadError("");

      // Redirect to the login page.
      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error("Error logging out:", error);

      setLogoutError(
        "Unable to log out. Please try again."
      );

      setLoggingOut(false);
    }
  }

  async function loadOrders() {
    const response = await fetch("/api/orders", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Failed to load orders from Supabase.");
    }

    const data: ApiOrder[] = await response.json();

    setOrders(formatOrders(data));
    setLoadError("");
  }

  useEffect(() => {
    async function initialLoad() {
      try {
        await loadOrders();
      } catch (error) {
        console.error("Error loading orders:", error);
        setLoadError("Unable to load orders from the database.");
      } finally {
        setLoading(false);
      }
    }

    initialLoad();
  }, []);

  function updateProductCost(id: number, value: string) {
    setOrders((currentOrders) =>
      currentOrders.map((order) =>
        order.id === id
          ? {
              ...order,
              productCost: value,
            }
          : order
      )
    );
  }

  async function saveProductCost(id: number, value: string) {
    if (value.trim() === "") {
      return;
    }

    const productCost = Number(value);

    if (!Number.isFinite(productCost) || productCost < 0) {
      return;
    }

    try {
      setSavingId(id);

      const response = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productCost,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save product cost");
      }

      setOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === id
            ? {
                ...order,
                productCost: productCost.toFixed(2),
                status: "COMPLETED",
              }
            : order
        )
      );

      console.log("Product cost saved successfully.");
    } catch (error) {
      console.error("Error saving product cost:", error);
      setLoadError(
        "Failed to save product cost. Please try again."
      );
    } finally {
      setSavingId(null);
    }
  }

  async function syncEbayOrders() {
    if (syncing || savingId !== null) {
      return;
    }

    try {
      setSyncing(true);
      setSyncMessage("");
      setSyncError(false);

      const response = await fetch("/api/ebay/sync", {
        method: "POST",
        cache: "no-store",
      });

      const data: SyncResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message ||
            data.error ||
            "Failed to sync eBay orders."
        );
      }

      // Reload the database orders after the import.
      await loadOrders();

      const imported = data.imported ?? 0;
      const found = data.found ?? 0;
      const skipped = data.skipped ?? 0;

      setSyncMessage(
        `Sync complete! Found ${found} eBay orders. ` +
          `Imported ${imported} new orders. ` +
          `Skipped ${skipped} existing or invalid orders.`
      );

      setSyncError(false);
    } catch (error) {
      console.error("Error syncing eBay orders:", error);

      setSyncError(true);
      setSyncMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong while syncing orders."
      );
    } finally {
      setSyncing(false);
    }
  }

  const totals = useMemo(() => {
    const totalRevenue = orders.reduce(
      (total, order) => total + order.salePrice,
      0
    );

    const totalFees = orders.reduce(
      (total, order) => total + order.ebayFees,
      0
    );

    const totalProductCosts = orders.reduce((total, order) => {
      const cost =
        order.productCost.trim() === ""
          ? 0
          : Number(order.productCost);

      return total + (Number.isFinite(cost) ? cost : 0);
    }, 0);

    const netProfit =
      totalRevenue - totalFees - totalProductCosts;

    return {
      totalRevenue,
      totalFees,
      totalProductCosts,
      netProfit,
    };
  }, [orders]);

  return (
    <main className="min-h-screen bg-gray-100 text-slate-900">
      <div className="mx-auto max-w-7xl px-6 py-10">

        {/* Header with Logout button */}
        <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">
              ProfitSync
            </h1>

            <p className="mt-2 text-lg text-slate-600">
              Track your eBay sales, costs, and profits.
            </p>
          </div>

          <button
            type="button"
            onClick={logout}
            disabled={loggingOut || syncing || savingId !== null}
            className={`rounded-xl px-5 py-3 font-medium transition ${
              loggingOut || syncing || savingId !== null
                ? "cursor-not-allowed bg-slate-200 text-slate-400"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            {loggingOut ? "Logging out..." : "Logout"}
          </button>
        </div>

        {logoutError && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {logoutError}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-slate-500">Total Revenue</p>

            <p className="mt-2 text-3xl font-bold">
              {money(totals.totalRevenue)}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-slate-500">eBay Fees</p>

            <p className="mt-2 text-3xl font-bold">
              {money(totals.totalFees)}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-slate-500">Product Costs</p>

            <p className="mt-2 text-3xl font-bold">
              {money(totals.totalProductCosts)}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-slate-500">Net Profit</p>

            <p
              className={`mt-2 text-3xl font-bold ${
                totals.netProfit >= 0
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {money(totals.netProfit)}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Excludes any seller fees not yet imported
            </p>
          </div>
        </div>

        <div className="mt-10 rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold">
                Recent Orders
              </h2>

              <p className="text-slate-500">
                Your latest eBay sales
              </p>
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
              className={`rounded-xl px-5 py-3 font-medium text-white transition ${
                syncing ||
                loading ||
                loggingOut ||
                savingId !== null
                  ? "cursor-not-allowed bg-blue-400"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {syncing ? "Syncing..." : "Sync eBay Orders"}
            </button>
          </div>

          {syncMessage && (
            <div
              role={syncError ? "alert" : "status"}
              className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
                syncError
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-green-200 bg-green-50 text-green-700"
              }`}
            >
              {syncMessage}
            </div>
          )}

          {loadError && (
            <div
              role="alert"
              className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {loadError}
            </div>
          )}

          {loading ? (
            <div className="py-10 text-center text-slate-500">
              Loading orders...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-slate-400 text-left text-slate-500">
                    <th className="pb-4 font-semibold">
                      Item
                    </th>

                    <th className="pb-4 font-semibold">
                      Sale Price
                    </th>

                    <th className="pb-4 font-semibold">
                      eBay Fees
                    </th>

                    <th className="pb-4 font-semibold">
                      Product Cost
                    </th>

                    <th className="pb-4 font-semibold">
                      Profit
                    </th>

                    <th className="pb-4 font-semibold">
                      Status
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {orders.map((order) => {
                    const hasCost =
                      order.productCost.trim() !== "";

                    const parsedCost =
                      Number(order.productCost);

                    const productCost =
                      hasCost &&
                      Number.isFinite(parsedCost)
                        ? parsedCost
                        : 0;

                    const profit =
                      order.salePrice -
                      order.ebayFees -
                      productCost;

                    const isSaving =
                      savingId === order.id;

                    return (
                      <tr
                        key={order.id}
                        className="border-b border-slate-300 last:border-b-0"
                      >
                        <td className="py-5 pr-6 font-medium">
                          {order.item}
                        </td>

                        <td className="py-5 pr-6">
                          {money(order.salePrice)}
                        </td>

                        <td className="py-5 pr-6">
                          {money(order.ebayFees)}
                        </td>

                        <td className="py-5 pr-6">
                          {money(order.productCost === "" ? 0 : order.ebayFees)}
                        </td>

                        <td className="py-5 pr-6">
                          <div className="flex items-center gap-2">
                            <span>$</span>

                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={order.productCost}
                              placeholder="0.00"
                              disabled={
                                isSaving ||
                                syncing ||
                                loggingOut
                              }
                              onChange={(event) =>
                                updateProductCost(
                                  order.id,
                                  event.target.value
                                )
                              }
                              onBlur={(event) =>
                                saveProductCost(
                                  order.id,
                                  event.target.value
                                )
                              }
                              className="w-28 rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100"
                            />

                            {isSaving && (
                              <span className="text-sm text-slate-400">
                                Saving...
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-5 pr-6">
                          {hasCost ? (
                            <span
                              className={
                                profit >= 0
                                  ? "font-bold text-green-600"
                                  : "font-bold text-red-600"
                              }
                            >
                              {money(profit)}
                            </span>
                          ) : (
                            <span className="text-slate-400">
                              Pending
                            </span>
                          )}
                        </td>

                        <td className="py-5">
                          {hasCost ? (
                            <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
                              Completed
                            </span>
                          ) : (
                            <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-700">
                              Cost Needed
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {orders.length === 0 && (
                <p className="py-10 text-center text-slate-500">
                  No orders found. Sync your eBay account to
                  import orders.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
