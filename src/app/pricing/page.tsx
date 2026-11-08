import type { Metadata } from "next";
import Link from "next/link";
import PricingCards from "./PricingCards";

export const metadata: Metadata = {
  title: "Pricing · ProfitSync",
  description: "Start free with one eBay store. Upgrade for more stores, unlimited orders and a tax-ready profit report.",
};

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#0b1120] px-5 py-12 text-center sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold">PS</span>
          ProfitSync
        </Link>
        <h1 className="mt-10 text-4xl font-bold tracking-tight text-white sm:text-5xl">Simple pricing for eBay sellers</h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-slate-400">
          See your real profit after eBay fees, shipping and product costs. Start free, and upgrade when you need more
          stores, unlimited orders or your tax report.
        </p>

        <PricingCards />

        <div className="mx-auto mt-14 grid max-w-4xl gap-6 text-left sm:grid-cols-2">
          {[
            ["Can I cancel any time?", "Yes. Cancel from Plan & billing and keep your plan until the end of the period you paid for."],
            ["What happens on the Free plan?", "You get one eBay store and up to 50 orders a month from the last 90 days, with the full dashboard."],
            ["Can I switch between monthly and yearly?", "Any time. Stripe charges or credits the difference for you."],
            ["Is my payment information safe?", "Payments go through Stripe. ProfitSync never sees or stores your card number."],
          ].map(([question, answer]) => (
            <div key={question} className="rounded-2xl border border-white/[0.07] bg-[#151d2d] p-5">
              <h2 className="text-sm font-semibold text-white">{question}</h2>
              <p className="mt-2 text-sm text-slate-400">{answer}</p>
            </div>
          ))}
        </div>

        <p className="mt-12 text-xs text-slate-600">
          Prices in US dollars. <Link href="/privacy" className="text-slate-400 hover:text-white">Privacy policy</Link>
        </p>
      </div>
    </main>
  );
}
