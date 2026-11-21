"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/reportClientError";

// Reports errors that happen in the browser outside a page's own error
// screen (a crash in a click handler, a failed promise) so they show up in
// the Vercel logs.
export function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      // Ignore errors from browser extensions and other sites' scripts.
      if (event.filename && !event.filename.startsWith(window.location.origin)) return;
      reportClientError(event.error ?? event.message, "window");
    };
    const onRejection = (event: PromiseRejectionEvent) => reportClientError(event.reason, "promise");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
