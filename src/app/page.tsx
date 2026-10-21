
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Order = {
  id: number;
  ebayOrderId: string | null;
  item: string;
  imageUrl: string | null;
  salePrice: number;
  ebayFees: number;
  productCost: string;
  savedProductCost: string;
  status: string;
};

type ApiOrder = {
  id: number;
  ebayOrderId: string | null;
  item: string;
  imageUrl?: string | null;
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
  feesUpdated?: number;
  imagesImported?: number;
  imagesUpdated?: number;
  error?: string;
  message?: string;
};

function money(value: number) {
  return `$${value.toFixed(2)}`;
}

function isValidCost(value: string) {
  if (value.trim() === "") {
    return false;
  }

  return (
    /^\d+(\.\d{1,2})?$/.test(value.trim()) &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0
  );
}

function formatOrders(data: ApiOrder[]): Order[] {
  return data.map((order) => {
    const cost =
      order.productCost === null
        ? ""
        : String(order.productCost);

    return {
      id: order.id,
      ebayOrderId: order.ebayOrderId,
      item: order.item,
      imageUrl: order.imageUrl ?? null,
      salePrice: Number(order.salePrice),
      ebayFees: Number(order.ebayFees),
      productCost: cost,
      savedProductCost: cost,
      status: order.status,
    };
  });
}

function ListingImage({
  imageUrl,
  item,
}: {
  imageUrl: string | null;
  item: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  if (!imageUrl || failed) {
    return (
      <div
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100"
        aria-label="No listing image available"
        title="No listing image available"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="25"
          height="25"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-slate-400"
          aria-hidden="true"
        >
          <rect
            x="3"
            y="3"
            width="18"
            height="18"
            rx="2"
          />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
      <img
        src={imageUrl}
        alt={item}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-full w-full object-contain"
      />
    </div>
  );
}

export default function Home() {
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(
    null
  );

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncError, setSyncError] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

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

  async function loadOrders() {
    const response = await fetch("/api/orders", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Failed to load orders.");
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
        console.error("Loading failed:", error);

        setLoadError(
          "Unable to load orders from the database."
        );
      } finally {
        setLoading(false);
      }
    }

    initialLoad();
  }, []);

  function updateProductCost(
    id: number,
    value: string
  ) {
    setOrders((currentOrders) =>
      currentOrders.map((order) =>
        order.id === id
          ? { ...order, productCost: value }
          : order
      )
    );
  }

  async function saveProductCost(
    id: number,
    value: string
  ) {
    const currentOrder = orders.find(
      (order) => order.id === id
    );

    if (!currentOrder || savingId !== null) {
      return;
    }

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

      setOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === id
            ? {
                ...order,
                productCost: formattedCost,
                savedProductCost: formattedCost,
                status: "COMPLETED",
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
      setSavingId(null);
    }
  }

  async function syncEbayOrders() {
    if (syncing || savingId !== null || loggingOut) {
      return;
    }

    try {
      setSyncing(true);
      setSyncMessage("");
      setSyncError(false);

      const response = await fetch(
        "/api/ebay/sync",
        {
          method: "POST",
          cache: "no-store",
        }
      );

      const data: SyncResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message ||
            data.error ||
            "Failed to sync eBay orders."
        );
      }

      await loadOrders();

      const found = data.found ?? 0;
      const imported = data.imported ?? 0;
      const skipped = data.skipped ?? 0;

      setSyncMessage(
        `Sync complete! Found ${found} eBay orders. ` +
          `Imported ${imported} new orders. ` +
          `Skipped ${skipped} existing or invalid orders.` +
          (data.feesUpdated !== undefined
            ? ` Updated fees on ${data.feesUpdated} orders.`
            : "") +
          (data.imagesImported !== undefined
            ? ` Added ${data.imagesImported} listing images.`
            : "") +
          (data.imagesUpdated !== undefined
            ? ` Updated ${data.imagesUpdated} listing images.`
            : "")
      );
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
    }
  }

  const totals = useMemo(() => {
    const totalRevenue = orders.reduce(
      (sum, order) => sum + order.salePrice,
      0
    );

    const totalFees = orders.reduce(
      (sum, order) => sum + order.ebayFees,
      0
    );

    const completedOrders = orders.filter(
      (order) => isValidCost(order.savedProductCost)
    );

    const totalProductCosts = completedOrders.reduce(
      (sum, order) =>
        sum + Number(order.savedProductCost),
      0
    );

    const netProfit = completedOrders.reduce(
      (sum, order) =>
        sum +
        order.salePrice -
        order.ebayFees -
        Number(order.savedProductCost),
      0
    );

    return {
      totalRevenue,
      totalFees,
      totalProductCosts,
      netProfit,
      completedCount: completedOrders.length,
      pendingOrders:
        orders.length - completedOrders.length,
    };
  }, [orders]);

  return (
    <main className="min-h-screen bg-gray-100 text-slate-900">
      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Header */}
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
            disabled={
              loggingOut ||
              syncing ||
              savingId !== null
            }
            className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
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

        {/* Dashboard totals */}
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-slate-500">
              Total Revenue
            </p>

            <p className="mt-2 text-3xl font-bold">
              {money(totals.totalRevenue)}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-slate-500">
              eBay Fees
            </p>

            <p className="mt-2 text-3xl font-bold">
              {money(totals.totalFees)}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-slate-500">
              Product Costs
            </p>

            <p className="mt-2 text-3xl font-bold">
              {money(totals.totalProductCosts)}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-slate-500">
              Net Profit
            </p>

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
              Based on {totals.completedCount} completed orders
            </p>

            {totals.pendingOrders > 0 && (
              <p className="mt-1 text-xs text-amber-600">
                {totals.pendingOrders} orders still need
                product costs
              </p>
            )}

            <p className="mt-1 text-xs text-slate-500">
              Excludes seller fees not yet imported
            </p>
          </div>
        </div>

        {/* Recent orders */}
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
              className="rounded-xl bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
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
              <table className="w-full min-w-[1150px] table-fixed">
                <colgroup>
                  <col className="w-[40%]" />
                  <col className="w-[11%]" />
                  <col className="w-[10%]" />
                  <col className="w-[16%]" />
                  <col className="w-[11%]" />
                  <col className="w-[12%]" />
                </colgroup>

                <thead>
                  <tr className="border-b border-slate-400 text-left text-slate-500">
                    <th className="pb-4 pr-5 font-semibold">
                      Item
                    </th>

                    <th className="pb-4 pr-5 font-semibold">
                      Sale Price
                    </th>

                    <th className="pb-4 pr-5 font-semibold">
                      eBay Fees
                    </th>

                    <th className="pb-4 pr-5 font-semibold">
                      Product Cost
                    </th>

                    <th className="pb-4 pr-5 font-semibold">
                      Profit
                    </th>

                    <th className="pb-4 font-semibold">
                      Status
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {orders.map((order) => {
                    const hasSavedCost = isValidCost(
                      order.savedProductCost
                    );

                    const hasValidDraft = isValidCost(
                      order.productCost
                    );

                    const profit =
                      order.salePrice -
                      order.ebayFees -
                      Number(order.productCost);

                    const isSaving = savingId === order.id;

                    return (
                      <tr
                        key={order.id}
                        className="border-b border-slate-300 last:border-b-0"
                      >
                        {/* Listing image and title */}
                        <td className="py-5 pr-6">
                          <div className="flex items-center gap-4">
                            <ListingImage
                              imageUrl={order.imageUrl}
                              item={order.item}
                            />

                            <div className="min-w-0">
                              <p className="break-words font-medium leading-relaxed text-slate-900">
                                {order.item}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Sale price */}
                        <td className="whitespace-nowrap py-5 pr-5">
                          {money(order.salePrice)}
                        </td>

                        {/* eBay fees */}
                        <td className="whitespace-nowrap py-5 pr-5">
                          {money(order.ebayFees)}
                        </td>

                        {/* Editable product cost */}
                        <td className="py-5 pr-5">
                          <div className="flex items-center gap-2">
                            <span>$</span>

                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={order.productCost}
                              placeholder="0.00"
                              aria-label={`Product cost for ${order.item}`}
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
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.currentTarget.blur();
                                }
                              }}
                              className="w-24 rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100"
                            />

                            {isSaving && (
                              <span className="text-xs text-slate-400">
                                Saving...
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Automatically calculated profit */}
                        <td className="whitespace-nowrap py-5 pr-5">
                          {hasValidDraft ? (
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

                        {/* Order status */}
                        <td className="py-5">
                          {hasSavedCost ? (
                            <span className="inline-block whitespace-nowrap rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
                              Completed
                            </span>
                          ) : (
                            <span className="inline-block whitespace-nowrap rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-700">
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
                  No orders found. Sync your eBay account
                  to import orders.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
