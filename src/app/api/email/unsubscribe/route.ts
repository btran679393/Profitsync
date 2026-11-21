import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { verifyUnsubscribe } from "@/lib/email/unsubscribe";
import { escapeHtml } from "@/lib/email/weekly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The link at the bottom of the weekly email. Opening it (GET) only shows a
// button, because email scanners open links on their own; the button (or an
// email app's built-in "Unsubscribe", which POSTs) turns the emails off.

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · ProfitSync</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0e17;color:#e6ebf2;font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:24px;text-align:center;">
<div style="max-width:420px;"><p style="font-weight:700;font-size:18px;">ProfitSync</p><h1 style="font-size:24px;margin:24px 0 12px;">${escapeHtml(title)}</h1>${body}</div></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

const invalid = () =>
  page("This link doesn't work", `<p style="color:#9aa7ba;line-height:1.6;">You can turn off weekly emails in ProfitSync under Settings → Account.</p>`, 400);

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const u = params.get("u");
  const t = params.get("t");
  if (!verifyUnsubscribe(u, t)) return invalid();
  const action = `/api/email/unsubscribe?${new URLSearchParams({ u: u!, t: t! })}`;
  return page(
    "Stop weekly emails?",
    `<p style="color:#9aa7ba;line-height:1.6;">You'll stop getting the weekly ProfitSync summary. You can turn it back on any time in Settings.</p>
<form method="post" action="${escapeHtml(action)}" style="margin-top:24px;"><button type="submit" style="background:#6366f1;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-size:15px;font-weight:600;cursor:pointer;">Stop weekly emails</button></form>`
  );
}

export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;
  const u = params.get("u");
  if (!verifyUnsubscribe(u, params.get("t"))) return invalid();
  if (!process.env.DATABASE_URL) return page("Something went wrong", "<p>Please try again later.</p>", 503);
  try {
    await getPool().query(
      `INSERT INTO public."emailPreference" ("userId", "weeklySummary") VALUES ($1, false)
       ON CONFLICT ("userId") DO UPDATE SET "weeklySummary" = false, "updatedAt" = now()`,
      [u]
    );
  } catch (e) {
    console.error("Unsubscribe failed:", e);
    return page("Something went wrong", `<p style="color:#9aa7ba;">Please try again, or turn it off in Settings.</p>`, 500);
  }
  return page("You're unsubscribed", `<p style="color:#9aa7ba;line-height:1.6;">No more weekly emails. Changed your mind? Turn them back on in ProfitSync under Settings → Account.</p>`);
}
