"use client"; // Error boundaries must be Client Components

// Last-resort error page, used only if the whole site layout fails.
// It can't use the site's styles, so it's styled inline.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0e17",
          color: "#e6ebf2",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <title>Something went wrong · ProfitSync</title>
        <div style={{ maxWidth: 440 }}>
          <p style={{ fontWeight: 700, fontSize: 18 }}>ProfitSync</p>
          <h1 style={{ fontSize: 28, margin: "32px 0 12px" }}>Something went wrong</h1>
          <p style={{ color: "#9aa7ba", lineHeight: 1.6 }}>
            ProfitSync hit an unexpected problem. Your data is safe. Please try again in a moment.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 28 }}>
            <button
              type="button"
              onClick={() => retry()}
              style={{ background: "#5f5bf1", color: "#fff", border: 0, borderRadius: 10, padding: "10px 18px", fontWeight: 600, cursor: "pointer" }}
            >
              Try again
            </button>
            {/* A plain link on purpose: this page replaces the whole app. */}
            <a href="/contact" style={{ color: "#c7c5ff", padding: "10px 18px", fontWeight: 600 }}>
              Contact support
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
