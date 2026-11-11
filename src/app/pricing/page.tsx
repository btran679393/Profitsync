import type { Metadata } from "next";
import Link from "next/link";
import { SitePage } from "@/components/site/SiteChrome";
import { AppStructuredData, FaqStructuredData } from "@/components/site/StructuredData";
import PricingCards from "./PricingCards";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Start free with one eBay store. Upgrade for more stores, unlimited orders and a tax-ready profit report.",
  alternates: { canonical: "/pricing" },
};

const PRICING_FAQ: Array<[string, string]> = [
  ["Do I need a card for the Free plan?", "No. Sign up, connect one eBay store and use the full dashboard for free, for as long as you like."],
  ["Can I cancel any time?", "Yes. Cancel from Plan & billing and keep your plan until the end of the period you paid for."],
  ["What happens on the Free plan?", "You get one eBay store and up to 50 orders a month from the last 90 days, with the full dashboard."],
  ["Can I switch between monthly and yearly?", "Any time. Stripe charges or credits the difference for you."],
  ["Is my payment information safe?", "Payments go through Stripe. ProfitSync never sees or stores your card number."],
  ["Can I get a refund?", "If you buy a yearly plan for the first time, you can ask for a full refund within 14 days. See the refund policy for the details."],
];

export default function PricingPage() {
  return (
    <SitePage>
      <AppStructuredData />
      <FaqStructuredData items={PRICING_FAQ} />
      <div className="mx-auto max-w-6xl px-4 py-12 text-center sm:px-6 sm:py-16">
        <h1 className="text-4xl font-bold tracking-tight text-ink sm:text-5xl">Simple pricing for eBay sellers</h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted">
          See your real profit after eBay fees, shipping and product costs. Start free, and upgrade when you need more stores,
          unlimited orders or your tax report.
        </p>

        <PricingCards />

        <div className="mx-auto mt-14 grid max-w-4xl gap-4 text-left sm:grid-cols-2">
          {PRICING_FAQ.map(([question, answer]) => (
            <div key={question} className="rounded-xl border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">{question}</h2>
              <p className="mt-2 text-sm text-muted">{answer}</p>
            </div>
          ))}
        </div>

        <p className="mt-12 text-xs text-subtle">
          Prices in US dollars. Paid plans renew automatically until cancelled. See the{" "}
          <Link href="/refunds" className="text-muted underline underline-offset-2 hover:text-ink">refund policy</Link> and{" "}
          <Link href="/terms" className="text-muted underline underline-offset-2 hover:text-ink">terms</Link>.
        </p>
      </div>
    </SitePage>
  );
}
