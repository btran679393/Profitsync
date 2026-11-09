"use client";

import type { ReactNode } from "react";
import { Button, Card, cn } from "@/components/ui";

// The written guide: what every part of ProfitSync does, in plain language.
// Opened from "Help & guide" in the sidebar and the Get started checklist.

const SECTIONS: ReadonlyArray<readonly [string, string]> = [
  ["guide-start", "Getting started"],
  ["guide-profit", "How profit is worked out"],
  ["guide-dashboard", "Dashboard"],
  ["guide-orders", "Orders"],
  ["guide-listings", "Listings"],
  ["guide-expenses", "Expenses"],
  ["guide-taxes", "Taxes"],
  ["guide-stores", "Several stores"],
  ["guide-settings", "Plans and settings"],
  ["guide-faq", "Questions"],
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-24 p-5 sm:p-6">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-6 text-ink-2">{children}</div>
    </Card>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="ps-num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink">
            {i + 1}
          </span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Term({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3.5 py-2.5">
      <dt className="text-sm font-semibold text-ink">{name}</dt>
      <dd className="mt-0.5 text-sm text-muted">{children}</dd>
    </div>
  );
}

function Q({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg border border-line bg-surface-2 px-4 py-3 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-ink">
        {q}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-subtle transition-transform group-open:rotate-180" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="mt-2 text-sm leading-6 text-muted">{children}</div>
    </details>
  );
}

const B = ({ children }: { children: ReactNode }) => <strong className="font-semibold text-ink">{children}</strong>;

export default function HelpGuide({
  onGo,
  checklistHidden,
  onShowChecklist,
}: {
  onGo: (view: "dashboard" | "orders" | "listings" | "expenses" | "settings") => void;
  checklistHidden: boolean;
  onShowChecklist: () => void;
}) {
  return (
    <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-8">
      <nav aria-label="Guide sections" className="hidden lg:block">
        <ul className="sticky top-20 space-y-0.5">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 space-y-5">
        <Section id="guide-start" title="Getting started (about 5 minutes)">
          <p>ProfitSync shows what you really keep from each eBay sale, after eBay&apos;s fees, shipping and what you paid for the item.</p>
          <Steps
            items={[
              <>
                <B>Connect your eBay store.</B> Use the store button in the top right, then <B>Connect eBay store</B>. eBay asks you to sign in and
                allow ProfitSync to read your orders, fees and listings. ProfitSync can only read; it never changes anything on eBay.
              </>,
              <>
                <B>Sync your orders.</B> Press <B>Sync</B> in the top right. The first sync brings in a year of orders, eBay fees, shipping labels
                and refunds, and can take a minute for a big store.
              </>,
              <>
                <B>Set your usual shipping cost.</B> On the Orders page, <B>Shipping per order</B> is what you normally pay to ship. It&apos;s used
                for any sale that doesn&apos;t have its own shipping cost. Labels you buy on eBay are counted automatically.
              </>,
              <>
                <B>Add what you paid for your items.</B> Type a product cost on each order (press Enter to jump to the next one), or set a cost
                once per listing on the Listings page and it fills in every sale of that item.
              </>,
              <>
                <B>Set a monthly profit goal</B> on the Dashboard to see whether you&apos;re on track this month.
              </>,
            ]}
          />
          <div className="flex flex-wrap gap-2 pt-1">
            {checklistHidden && (
              <Button variant="primary" size="sm" onClick={onShowChecklist}>
                Show the Get started checklist
              </Button>
            )}
            <Button variant={checklistHidden ? "secondary" : "primary"} size="sm" onClick={() => onGo("orders")}>
              Go to Orders
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onGo("listings")}>
              Go to Listings
            </Button>
          </div>
        </Section>

        <Section id="guide-profit" title="How profit is worked out">
          <p className="rounded-lg bg-surface-2 px-4 py-3 font-medium text-ink">
            Profit on an order = sale price − refunds − eBay fees − other eBay charges − shipping − product cost
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <B>Other eBay charges</B> are things like promoted-listing ad fees tied to that order.
            </li>
            <li>
              <B>Shipping</B> is what you typed for the order, otherwise an eBay label you bought, otherwise your store&apos;s shipping per order.
            </li>
            <li>
              Orders without a product cost show <B>Pending</B> and aren&apos;t counted in profit until you add one.
            </li>
            <li>
              <B>Net profit</B> on the Dashboard also takes off your expenses and any losses you recorded on refunded orders.
            </li>
          </ul>
        </Section>

        <Section id="guide-dashboard" title="Dashboard">
          <p>Pick a time range (7 days, 30 days, 90 days or All time) at the top right. Every number follows it.</p>
          <dl className="grid gap-2 sm:grid-cols-2">
            <Term name="Revenue">What buyers paid, not counting refunded orders.</Term>
            <Term name="Net profit">What you kept after everything above. The arrow shows the change from the period before.</Term>
            <Term name="Margin">How much of each dollar of sales you keep as profit.</Term>
            <Term name="Avg profit / order">Average profit of the orders that have a product cost.</Term>
            <Term name="Needs attention">Orders missing a cost, listings running low or not selling, and stores to reconnect. Click one to fix it.</Term>
            <Term name="Where the money went">Your costs for the period, by type.</Term>
          </dl>
        </Section>

        <Section id="guide-orders" title="Orders">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Use the tabs to see <B>Needs cost</B>, <B>Complete</B> or <B>Refunded</B> orders, and search by item, order number or buyer.
            </li>
            <li>
              Type a <B>product cost</B> right in the table. It saves when you leave the box; Enter saves and moves to the next order. When
              you&apos;ve sold the item before, a <B>Use $X · last time</B> shortcut appears.
            </li>
            <li>
              Click an order to open its <B>details</B>: the full breakdown, shipping, and for refunds, what happened to the item so any loss is
              counted. If you close it with unsaved changes, ProfitSync asks first.
            </li>
            <li>
              <B>Import / export</B> downloads your orders as a spreadsheet, or fills in shipping costs from a Pirate Ship (or similar) export.
            </li>
            <li>
              <B>Import / export → Check against eBay</B> compares a month with eBay&apos;s own payment records and points out any order whose
              sale, fees or refund don&apos;t match. Nothing is changed; a sync usually fixes what it finds.
            </li>
          </ul>
        </Section>

        <Section id="guide-listings" title="Listings">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              The first time, press <B>Load my eBay listings</B>. Use <B>Refresh listings</B> any time after.
            </li>
            <li>
              Set an <B>Item</B> cost and a <B>Ship</B> cost once per listing. Future sales use them automatically, and you can choose to fill in
              past sales that don&apos;t have one yet.
            </li>
            <li>
              Tick several listings to set a cost for all of them at once (tip: search first, e.g. “1998”, then tick the box at the top).
            </li>
            <li>
              <B>Running low</B> and <B>Not selling</B> flag listings that need restocking or a price change. Change when they show in Settings.
            </li>
          </ul>
        </Section>

        <Section id="guide-expenses" title="Expenses">
          <p>
            For costs that aren&apos;t tied to one sale: packing supplies, your eBay Store subscription, software, sourcing trips. Press{" "}
            <B>Add expense</B>, pick a category (or type your own) and the amount. Expenses come off your net profit and show on your tax
            summary. Some, like a subscription, can be set to repeat every month.
          </p>
        </Section>

        <Section id="guide-taxes" title="Taxes">
          <p>
            A clear profit and loss summary for the whole year. Print it, save it as a PDF or download a
            spreadsheet for your accountant. It&apos;s a guide, not tax advice: check it with a tax professional before you file.
          </p>
          <p>
            With several stores, it covers <B>all of them</B> by default, since you file one return; you can switch to one store. A{" "}
            <B>Before you file</B> box lists anything missing, like orders without a product cost or no shipping recorded, with a button to
            fix each.
          </p>
        </Section>

        <Section id="guide-stores" title="Several stores">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Add another eBay account from the store button in the top right: <B>Add a store</B>.
            </li>
            <li>Switch between stores there; every page shows the store you pick.</li>
            <li>
              <B>All stores</B> combines them into one set of numbers.
            </li>
            <li>Removing a store deletes its data from ProfitSync only. Nothing changes on eBay, and you can add it again later.</li>
          </ul>
        </Section>

        <Section id="guide-settings" title="Plans and settings">
          <p>
            <B>Plan &amp; billing</B> shows your plan and what&apos;s included. <B>Settings</B> is where you choose light or dark mode, the page
            ProfitSync opens on, your default date range and when listing alerts show. You can also delete your account there.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => onGo("settings")}>
              Open Settings
            </Button>
          </div>
        </Section>

        <Section id="guide-faq" title="Questions">
          <div className="space-y-2">
            <Q q="Why does an order say Pending?">It has no product cost yet. Add what you paid for the item and its profit appears.</Q>
            <Q q="How often do my orders update?">
              Press Sync any time. On paid plans ProfitSync also syncs by itself when you open it (at most every 6 hours).
            </Q>
            <Q q="Does ProfitSync change anything on eBay?">
              No. It only reads your orders, fees and listings. It never edits listings, messages buyers or moves money.
            </Q>
            <Q q="It says to reconnect my store. Why?">
              eBay sign-ins expire after about 18 months. Use Reconnect in the store menu; your data stays where it is.
            </Q>
            <Q q="Are shipping labels I buy on eBay counted?">Yes, automatically, on the order they belong to.</Q>
            <Q q="Are there keyboard shortcuts?">
              <B>Enter</B> saves a product cost and moves to the next order. <B>Escape</B> undoes what you were typing and leaves the box;
              press it again to go back to the Dashboard. Escape also closes panels, menus and pop-ups.
            </Q>
            <Q q="Who can see my data?">Only you. Each account&apos;s data is kept separate, and you can delete it all from Settings.</Q>
          </div>
        </Section>

        <p className={cn("pb-2 text-center text-xs text-subtle")}>
          Still stuck? Open the Dashboard&apos;s <B>Needs attention</B> card. It points to whatever needs fixing first.
        </p>
      </div>
    </div>
  );
}
