"use client";

import Link from "next/link";
import { buttonClasses } from "@/components/ui";
import { installDemoShim } from "@/lib/demo/shim";
import Home from "../page";

// Set up the sample data before the app below loads anything.
if (typeof window !== "undefined") installDemoShim();

// The real ProfitSync app, running on sample data, with a banner on top.
export default function DemoApp() {
  return (
    <>
      <div role="region" aria-label="Demo notice" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-accent/30 bg-accent px-4 py-2 text-center text-sm text-on-accent lg:pl-[calc(var(--ps-sidebar-w)+1rem)]">
        <span>
          <strong className="font-semibold">You&apos;re trying a demo</strong> with a made-up eBay store. Changes aren&apos;t saved.
        </span>
        <span className="flex items-center gap-2">
          <Link href="/login?mode=signup" className={buttonClasses("secondary", "sm")}>
            Start free with your store
          </Link>
          <Link href="/" className="text-sm font-medium underline underline-offset-2">
            Back to home
          </Link>
        </span>
      </div>
      <Home />
    </>
  );
}
