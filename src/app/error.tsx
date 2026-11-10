"use client"; // Error boundaries must be Client Components

import Link from "next/link";
import { useEffect } from "react";
import { ProblemPage } from "@/components/site/ProblemPage";
import { Button, buttonClasses } from "@/components/ui";

// Shown when a page hits an unexpected error.
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ProblemPage
      code="Something went wrong"
      title="This page didn't load"
      actions={
        <>
          <Button variant="primary" onClick={() => retry()}>
            Try again
          </Button>
          <Link href="/" className={buttonClasses("secondary", "md")}>
            Go to ProfitSync
          </Link>
        </>
      }
    >
      <p>Something unexpected happened on our side. Your data is safe. Try again, and if it keeps happening, let us know.</p>
    </ProblemPage>
  );
}
