import type { Metadata } from "next";
import Link from "next/link";
import { SitePage } from "@/components/site/SiteChrome";
import { buttonClasses } from "@/components/ui";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact and support",
  description: "Get help with ProfitSync: questions, billing, refunds and data requests.",
  alternates: { canonical: "/contact" },
};

const TOPICS = [
  {
    title: "Using ProfitSync",
    body: "Connecting eBay, adding costs, syncing, or a number that doesn't look right. Tell us which page and what you expected to see.",
  },
  {
    title: "Billing and refunds",
    body: "Charges, receipts, changing or cancelling your plan. Include the date and amount of the charge.",
    link: { label: "Refund policy", href: "/refunds" },
  },
  {
    title: "Your data",
    body: "Download, correct or delete your information, or ask what we hold about you.",
    link: { label: "Privacy policy", href: "/privacy" },
  },
];

export default function ContactPage() {
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("ProfitSync help")}`;
  return (
    <SitePage>
      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">Contact and support</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-ink-2">
          A real person reads every message. Email us and we&apos;ll reply within 2 business days, usually sooner.
        </p>

        <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-accent/30 bg-accent-soft p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted">Email support</p>
            <p className="mt-1 break-all text-lg font-semibold text-ink">{SUPPORT_EMAIL}</p>
            <p className="mt-1 text-xs text-subtle">Please write from the email address you use for ProfitSync.</p>
          </div>
          <a href={mailto} className={buttonClasses("primary", "md", "shrink-0")}>
            Send an email
          </a>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {TOPICS.map((topic) => (
            <div key={topic.title} className="rounded-xl border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">{topic.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{topic.body}</p>
              {topic.link && (
                <Link href={topic.link.href} className="mt-3 inline-block text-sm font-medium text-accent-ink hover:underline">
                  {topic.link.label} →
                </Link>
              )}
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-line bg-surface-2 p-5 text-sm leading-6 text-ink-2">
          <p className="font-semibold text-ink">Already using ProfitSync?</p>
          <p className="mt-1">
            The <strong className="text-ink">Help &amp; guide</strong> page in the app walks through connecting eBay, adding costs,
            expenses and taxes step by step. Many answers are there.
          </p>
          <Link href="/#help" className={buttonClasses("secondary", "sm", "mt-3")}>
            Open Help &amp; guide
          </Link>
        </div>
      </section>
    </SitePage>
  );
}
