"use client";

import { useMemo, useState } from "react";

type Order = {
  id: number;
  item: string;
  salePrice: number;
  ebayFees: number;
  productCost: string;
};

const startingOrders: Order[] = [
  {
    id: 1,
    item: "Real Madrid Ronaldo #7 Jersey",
    salePrice: 54.99,
    ebayFees: 8.17,
    productCost: "18.00",
  },
  {
    id: 2,
    item: "Barcelona Messi #10 Jersey",
    salePrice: 49.99,
    ebayFees: 7.42,
    productCost: "17.50",
  },
  {
    id: 3,
    item: "Arsenal Henry #14 Jersey",
    salePrice: 59.99,
    ebayFees: 8.85,
    productCost: "",
  },
];

function money(value: number) {
  return `$${value.toFixed(2)}`;
}

export default function Home() {
  const [orders, setOrders] = useState<Order[]>(startingOrders);

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
        order.productCost === "" ? 0 : Number(order.productCost);

      return total + (Number.isFinite(cost) ? cost : 0);
    }, 0);

    const netProfit = totalRevenue - totalFees - totalProductCosts;

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
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold tracking-tight">
            ProfitSync
          </h1>

          <p className="mt-2 text-lg text-slate-600">
            Track your eBay sales, costs, and profits.
          </p>
        </div>

        {/* Summary Cards */}
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
          </div>
        </div>

        {/* Recent Orders */}
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
              className="rounded-xl bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700"
            >
              Sync eBay Orders
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-slate-400 text-left text-slate-500">
                  <th className="pb-4 font-semibold">Item</th>
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

                  const parsedCost = Number(order.productCost);

                  const productCost =
                    hasCost && Number.isFinite(parsedCost)
                      ? parsedCost
                      : 0;

                  const profit =
                    order.salePrice -
                    order.ebayFees -
                    productCost;

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
                        <div className="flex items-center gap-2">
                          <span>$</span>

                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={order.productCost}
                            placeholder="0.00"
                            onChange={(event) =>
                              updateProductCost(
                                order.id,
                                event.target.value
                              )
                            }
                            className="w-28 rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          />
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
          </div>
        </div>
      </div>
    </main>
  );
}