import type { Metadata } from "next";
import Link from "next/link";
import { ProblemPage } from "@/components/site/ProblemPage";
import { buttonClasses } from "@/components/ui";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <ProblemPage
      code="404"
      title="We can't find that page"
      actions={
        <>
          <Link href="/" className={buttonClasses("primary", "md")}>
            Go to ProfitSync
          </Link>
          <Link href="/#help" className={buttonClasses("secondary", "md")}>
            Help &amp; guide
          </Link>
        </>
      }
    >
      <p>The link may be old or mistyped. Your data is safe; nothing has changed.</p>
    </ProblemPage>
  );
}
