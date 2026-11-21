// Sends a browser error to ProfitSync's server so it shows up in the
// Vercel logs (Logs and Observability), next to server errors. Only the
// error message, where it happened and the page address are sent; no
// personal data. At most a few reports per page load.

const MAX_REPORTS = 5;
let sent = 0;
const seen = new Set<string>();

export function reportClientError(error: unknown, where: string) {
  if (typeof window === "undefined" || sent >= MAX_REPORTS) return;
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
  const message = (err.message || "Unknown error").slice(0, 500);
  const key = `${where}|${message}`;
  if (seen.has(key)) return;
  seen.add(key);
  sent++;
  const body = JSON.stringify({
    message,
    where: where.slice(0, 40),
    stack: (err.stack ?? "").slice(0, 2000),
    digest: (err as { digest?: string }).digest?.slice(0, 100),
    // The page, without the query string (it can hold sign-in codes).
    page: window.location.pathname + window.location.hash,
  });
  try {
    if (navigator.sendBeacon?.(`/api/client-error`, new Blob([body], { type: "application/json" }))) return;
  } catch {
    // Fall back to fetch below.
  }
  fetch("/api/client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
}
