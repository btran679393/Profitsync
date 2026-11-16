import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tryAcquireSyncLock } from "@/lib/db/syncLock";
import { syncOrders } from "@/lib/ebay/orderSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Big stores take a while on their first sync (Vercel's limit for all plans).
export const maxDuration = 300;

// The sync itself lives in src/lib/ebay/orderSync.ts, shared with the daily
// background sync (src/app/api/cron/sync/route.ts).
// Only one orders sync per account at a time (see syncLock.ts).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const lock = await tryAcquireSyncLock(`orders:${user.id}`);
  if (lock === "busy") {
    return NextResponse.json(
      { error: "A sync is already running.", message: "Your orders are already syncing. Give it a minute.", busy: true },
      { status: 409 }
    );
  }
  // Without a streaming request, answer once at the end (as before).
  if (!request.headers.get("accept")?.includes("application/x-ndjson")) {
    try {
      return await syncOrders(request);
    } finally {
      await lock.release();
    }
  }

  // Streaming: send short progress lines while the sync runs, then the
  // result, so a long first sync can show "Bringing in your orders…
  // 1,200 so far" instead of a spinner.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (line: object) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
        } catch {
          // The browser went away; the sync still finishes.
        }
      };
      try {
        const response = await syncOrders(request, (progress) => send({ type: "progress", ...progress }));
        send({ type: "result", status: response.status, body: await response.json() });
      } catch (error) {
        console.error("Streaming sync failed:", error);
        send({ type: "result", status: 500, body: { error: "Something went wrong syncing eBay orders." } });
      } finally {
        await lock.release();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

