import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SitePage } from "@/components/site/SiteChrome";
import { buttonClasses } from "@/components/ui";
import { PreviewCard } from "../login/BrandPanel";
import PricingCards from "../pricing/PricingCards";
import { SITE_DESCRIPTION } from "@/lib/site";

// The public home page. Visitors who aren't signed in see this at "/"
// (the proxy shows it in place of the dashboard).
export const metadata: Metadata = {
  title: { absolute: "ProfitSync · Know your real eBay profit" },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-profit" aria-hidden="true">
      <path d="M5 12l4 4L19 6" />
    </svg>
  );
}

function FeatureIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-ink" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}

const STEPS = [
  {
    title: "Connect your eBay store",
    text: "Sign in with eBay in a few clicks. ProfitSync brings in your orders, fees, shipping labels and refunds. It only reads; it never changes anything on eBay.",
  },
  {
    title: "Add what you paid",
    text: "Type a product cost once per listing and every future sale of it is filled in for you. Add expenses like supplies and subscriptions too.",
  },
  {
    title: "See what you really made",
    text: "Profit per order, per listing and per month, after every fee and cost. Plus a yearly summary that's ready for tax time.",
  },
];

const FEATURES: Array<{ title: string; text: string; icon: ReactNode }> = [
  {
    title: "Real profit on every order",
    text: "Sale price minus eBay fees, ad fees, shipping and product cost, worked out for you.",
    icon: <><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></>,
  },
  {
    title: "All your stores together",
    text: "Connect several eBay accounts and see them one at a time or combined.",
    icon: <><path d="M3 9l1.5-5h15L21 9" /><path d="M4 9v11h16V9" /><path d="M9 20v-6h6v6" /></>,
  },
  {
    title: "Listings and stock",
    text: "Set costs per listing, spot items running low, and see which listings aren't selling.",
    icon: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h10M7 13h10M7 17h6" /></>,
  },
  {
    title: "Expenses",
    text: "Packing supplies, subscriptions and sourcing trips, including ones that repeat every month.",
    icon: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
  },
  {
    title: "Tax-ready yearly summary",
    text: "Income, costs and net profit for the year across all stores. Print it, save a PDF or download a spreadsheet.",
    icon: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /><path d="M8 13h8M8 17h5" /></>,
  },
  {
    title: "Checked against eBay",
    text: "Compare any month with eBay's own payment records, so you can trust the numbers.",
    icon: <><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /><path d="M9 12l2 2 4-4" /></>,
  },
];

const FAQ: Array<[string, string]> = [
  ["Is my eBay account safe?", "You connect through eBay's own sign-in, so ProfitSync never sees your eBay password. ProfitSync only reads your information; it can't change listings, orders, refunds or payouts. You can disconnect any time."],
  ["Do I need a credit card to start?", "No. The Free plan covers one eBay store and up to 50 orders a month, with the full dashboard. Upgrade only if you need more."],
  ["Where do the numbers come from?", "Sales, fees, shipping labels and refunds come straight from eBay. You add what you paid for your items and any other business expenses."],
  ["Can I cancel a paid plan?", "Yes, any time, in a couple of clicks. You keep your plan until the end of the period you paid for and won't be charged again."],
  ["Is the tax summary tax advice?", "No. It's a clear profit and loss summary to give your accountant or use when you file. Always check with a tax professional."],
  ["What happens to my data if I leave?", "You can download your orders as a spreadsheet, and deleting your account removes your data from ProfitSync."],
];

export default function WelcomePage() {
  return (
    <SitePage>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full bg-accent/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent-soft px-3.5 py-1 text-xs font-semibold text-accent-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-profit" aria-hidden="true" />
              Built for eBay sellers
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-[3.4rem]">
              Know what you <span className="text-profit">really</span> made on eBay.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-ink-2">
              ProfitSync pulls in your eBay sales, fees, shipping and refunds, then shows your true profit after product costs and
              expenses. No more spreadsheets.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/login?mode=signup" className={buttonClasses("primary", "lg")}>
                Start free
              </Link>
              <Link href="#pricing" className={buttonClasses("secondary", "lg")}>
                See pricing
              </Link>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              <li className="flex gap-1.5"><Check />Free for one store</li>
              <li className="flex gap-1.5"><Check />No card needed</li>
              <li className="flex gap-1.5"><Check />Read-only eBay access</li>
            </ul>
          </div>

          {/* Product preview (example numbers), always on a dark panel */}
          <div className="ps-motion relative rounded-3xl border border-line bg-[#071120] p-5 pt-1 text-white shadow-pop sm:p-8 sm:pt-3">
            <PreviewCard />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-line bg-surface/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-ink">Set up in five minutes</h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="rounded-2xl border border-line bg-surface p-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-on-accent">{i + 1}</span>
                <h3 className="mt-4 text-base font-semibold text-ink">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-ink">Everything a seller needs to know</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-base text-muted">
            Your eBay payouts don&apos;t tell you what you kept. ProfitSync counts every fee and cost so you can price, restock and plan
            with confidence.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-2xl border border-line bg-surface p-6">
                <FeatureIcon>{feature.icon}</FeatureIcon>
                <h3 className="mt-4 text-base font-semibold text-ink">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{feature.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-16 border-t border-line bg-surface/40">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight text-ink">Simple pricing</h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-muted">Start free. Upgrade when you need more stores, unlimited orders or your tax summary.</p>
          <PricingCards />
          <p className="mt-8 text-xs text-subtle">
            Prices in US dollars. Paid plans renew automatically until cancelled.{" "}
            <Link href="/refunds" className="underline underline-offset-2 hover:text-ink">Refund policy</Link>
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-ink">Questions</h2>
          <div className="mt-8 divide-y divide-line rounded-2xl border border-line bg-surface">
            {FAQ.map(([question, answer]) => (
              <details key={question} className="group px-5 py-4 sm:px-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-ink">
                  {question}
                  <span className="text-xl leading-none text-subtle transition group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <p className="mt-3 text-sm leading-6 text-muted">{answer}</p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-muted">
            Something else? <Link href="/contact" className="font-medium text-accent-ink hover:underline">Contact us</Link>
          </p>
        </div>
      </section>

      {/* Final call to action */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="rounded-3xl border border-accent/30 bg-gradient-to-br from-accent-soft to-surface px-6 py-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-ink">See your real profit today</h2>
            <p className="mx-auto mt-3 max-w-lg text-base text-muted">Free for one store. Connect eBay and your numbers are ready in minutes.</p>
            <Link href="/login?mode=signup" className={buttonClasses("primary", "lg", "mt-7")}>
              Start free
            </Link>
          </div>
        </div>
      </section>
    </SitePage>
  );
}
