import Link from "next/link";
import type { ReactNode } from "react";
import { SITE_NAME } from "@/lib/site";
import HeaderActions from "./HeaderActions";

// Header, footer and page frame for the public website pages
// (home, pricing, contact, terms, refunds, privacy).

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 text-sm font-semibold text-ink">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-on-accent" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 17l6-6 4 4 8-8" />
          <path d="M14 7h7v7" />
        </svg>
      </span>
      {SITE_NAME}
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          <Link href="/pricing" className="hidden rounded-lg px-3 py-2 text-sm text-muted hover:text-ink sm:inline-block">
            Pricing
          </Link>
          <Link href="/contact" className="hidden rounded-lg px-3 py-2 text-sm text-muted hover:text-ink sm:inline-block">
            Contact
          </Link>
          <HeaderActions />
        </nav>
      </div>
    </header>
  );
}

const FOOTER_LINKS = [
  ["Pricing", "/pricing"],
  ["Contact", "/contact"],
  ["Terms", "/terms"],
  ["Refunds", "/refunds"],
  ["Privacy", "/privacy"],
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <Logo />
          <p className="mt-2 text-xs text-subtle">
            © {new Date().getFullYear()} {SITE_NAME}. Not affiliated with or endorsed by eBay.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          {FOOTER_LINKS.map(([label, href]) => (
            <Link key={href} href={href} className="text-muted hover:text-ink">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

export function SitePage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

// A readable long-form page (terms, policies).
export function LegalPage({ title, updated, intro, children }: { title: string; updated: string; intro: ReactNode; children: ReactNode }) {
  return (
    <SitePage>
      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-subtle">Last updated {updated}</p>
        <div className="mt-6 text-base leading-7 text-ink-2">{intro}</div>
        <div
          className="mt-10 space-y-4 text-[15px] leading-7 text-ink-2 [&_a]:font-medium [&_a]:text-accent-ink [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_li]:mt-1.5 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-6"
        >
          {children}
        </div>
      </article>
    </SitePage>
  );
}
