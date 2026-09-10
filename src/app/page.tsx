export default function Home() {
  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">
            ProfitSync
          </h1>
          <p className="mt-2 text-gray-600">
            Track your eBay sales, costs, and profits.
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-6 md:grid-cols-4">

          <div className="rounded-xl bg-white p-6 shadow">
            <p className="text-sm text-gray-500">Total Revenue</p>
            <h2 className="mt-2 text-3xl font-bold text-gray-900">
              $1,482.50
            </h2>
          </div>

          <div className="rounded-xl bg-white p-6 shadow">
            <p className="text-sm text-gray-500">eBay Fees</p>
            <h2 className="mt-2 text-3xl font-bold text-gray-900">
              $211.35
            </h2>
          </div>

          <div className="rounded-xl bg-white p-6 shadow">
            <p className="text-sm text-gray-500">Product Costs</p>
            <h2 className="mt-2 text-3xl font-bold text-gray-900">
              $487.00
            </h2>
          </div>

          <div className="rounded-xl bg-white p-6 shadow">
            <p className="text-sm text-gray-500">Net Profit</p>
            <h2 className="mt-2 text-3xl font-bold text-green-600">
              $784.15
            </h2>
          </div>

        </div>

        {/* Orders */}
        <div className="mt-10 rounded-xl bg-white p-6 shadow">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Recent Orders
              </h2>
              <p className="text-sm text-gray-500">
                Your latest eBay sales
              </p>
            </div>

            <button className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700">
              Sync eBay Orders
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b text-sm text-gray-500">
                  <th className="py-3">Item</th>
                  <th>Sale Price</th>
                  <th>eBay Fees</th>
                  <th>Product Cost</th>
                  <th>Profit</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                <tr className="border-b text-gray-800">
                  <td className="py-5 font-medium">
                    Real Madrid Ronaldo #7 Jersey
                  </td>
                  <td>$54.99</td>
                  <td>$8.17</td>
                  <td>$18.00</td>
                  <td className="font-semibold text-green-600">
                    $28.82
                  </td>
                  <td>
                    <span className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-700">
                      Completed
                    </span>
                  </td>
                </tr>

                <tr className="text-gray-800">
                  <td className="py-5 font-medium">
                    Barcelona Messi #10 Jersey
                  </td>
                  <td>$49.99</td>
                  <td>$7.42</td>
                  <td className="text-gray-400">Not entered</td>
                  <td className="text-gray-400">Pending</td>
                  <td>
                    <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm text-yellow-700">
                      Cost Needed
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </main>
  );
}