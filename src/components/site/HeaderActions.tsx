"use client";

import Link from "next/link";
import { buttonClasses } from "@/components/ui";
import { useSignedIn } from "./useSignedIn";

// "Sign in" + "Start free" for visitors; "Open ProfitSync" once signed in.
export default function HeaderActions() {
  const signedIn = useSignedIn();
  if (signedIn) {
    return (
      <Link href="/" className={buttonClasses("primary", "sm")}>
        Open ProfitSync
      </Link>
    );
  }
  return (
    <>
      <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-ink-2 hover:text-ink">
        Sign in
      </Link>
      <Link href="/login?mode=signup" className={buttonClasses("primary", "sm")}>
        Start free
      </Link>
    </>
  );
}
