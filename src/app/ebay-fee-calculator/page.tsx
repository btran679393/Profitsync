import type { Metadata } from "next";
import Link from "next/link";
import { SitePage } from "@/components/site/SiteChrome";
import { FaqStructuredData } from "@/components/site/StructuredData";
import { FEES_CHECKED, FEE_CATEGORIES, INTERNATIONAL_FEE_PERCENT } from "@/lib/feeCalculator";
import FeeCalculator from "./FeeCalculator";

// Free public tool: brings in sellers searching for an eBay fee calculator.
export const metadata: Metadata = {
  title: "eBay Fee Calculator: see your profit after fees",
  description:
    "Free eBay fee calculator for US sellers. Enter your sold price, shipping and costs to see eBay's final value fee, per-order fee, ad fee and your real profit.",
  alternates: { canonical: "/ebay-fee-calculator" },
};

const FAQ: Array<[string, string]> = [
  [
    "How much does eBay take from a sale?",
    "For most categories eBay charges a final value fee of 13.6% of the total sale up to $7,500, plus a per-order fee of $0.30 (orders of $10 or less) or $0.40 (over $10). Some categories, like trading cards, handbags, watches and sneakers, have different rates.",
  ],
  [
    "Does eBay charge fees on shipping and sales tax?",
    "Yes. The final value fee is worked out on the total amount the buyer pays: the item price, shipping, sales tax and any handling charges. That's why this calculator asks for the buyer's sales tax rate.",
  ],
  [
    "How do Promoted Listings fees work?",
    "With Promoted Listings General you pick an ad rate. If the item sells within 30 days of a click on your ad, eBay charges that percentage of the total sale, including shipping and tax.",
  ],
  [
    "Are there any other eBay fees?",
    `Possibly. Most sellers get 250 free listings a month, then pay $0.35 each. There's a ${INTERNATIONAL_FEE_PERCENT}% international fee when you ship abroad without eBay International Shipping, and eBay adds extra fees if your seller level drops to Below Standard.`,
  ],
];

export default function FeeCalculatorPage() {
  return (
    <SitePage>
      <FaqStructuredData items={FAQ} />
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-ink sm:text-5xl">eBay fee calculator</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted">
            See exactly what eBay takes and what you keep. Free, no sign-up, for US sellers.
          </p>
        </div>

        <div className="mt-10">
          <FeeCalculator />
        </div>

        <section className="mx-auto mt-16 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-ink">eBay final value fees by category</h2>
          <p className="mt-2 text-sm text-muted">
            Worked out on the total sale (item, shipping and sales tax), per item. Plus a per-order fee of $0.30 for orders of
            $10 or less, or $0.40 for orders over $10.
          </p>
          <div className="mt-5 overflow-hidden rounded-xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Category</th>
                  <th scope="col" className="px-4 py-3 font-medium">Final value fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {FEE_CATEGORIES.map((category) => (
                  <tr key={category.id}>
                    <td className="px-4 py-3 text-ink">{category.name}</td>
                    <td className="px-4 py-3 text-ink-2">{category.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-subtle">
            Rates from eBay&apos;s US selling fees page, checked {FEES_CHECKED}. eBay changes its fees from time to time, so check
            eBay&apos;s own page before big decisions. Store subscriptions and Top Rated discounts aren&apos;t included.
            ProfitSync isn&apos;t affiliated with eBay.
          </p>
        </section>

        <section className="mx-auto mt-14 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-ink">Questions</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {FAQ.map(([question, answer]) => (
              <div key={question} className="rounded-xl border border-line bg-surface p-5">
                <h3 className="text-sm font-semibold text-ink">{question}</h3>
                <p className="mt-2 text-sm text-muted">{answer}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-muted">
            Tired of working this out sale by sale?{" "}
            <Link href="/login?mode=signup" className="font-medium text-accent-ink hover:underline">
              ProfitSync does it for every order
            </Link>
            , free for one store.
          </p>
        </section>
      </div>
    </SitePage>
  );
}
