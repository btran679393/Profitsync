import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./SiteChrome";

// A calm, centred page for "not found" and "something went wrong".
export function ProblemPage({ code, title, children, actions }: { code: string; title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 py-16 text-center text-ink">
      <Logo />
      <p className="mt-12 text-sm font-semibold uppercase tracking-[0.18em] text-accent-ink">{code}</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">{title}</h1>
      <div className="mx-auto mt-4 max-w-md text-base leading-7 text-muted">{children}</div>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">{actions}</div>
      <p className="mt-10 text-sm text-subtle">
        Still stuck?{" "}
        <Link href="/contact" className="font-medium text-accent-ink hover:underline">
          Contact support
        </Link>
      </p>
    </main>
  );
}
