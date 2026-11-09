// Reads an order sync response. The sync streams short progress lines
// (newline-separated JSON) and then one "result" line; older or error
// responses are plain JSON. Either way you get the final status and body.

export type SyncProgress =
  | { stage: "orders"; found: number }
  | { stage: "fees" }
  | { stage: "saving"; done: number; total: number };

export async function readSyncResponse<T>(
  response: Response,
  onProgress: (progress: SyncProgress) => void
): Promise<{ status: number; body: T }> {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("application/x-ndjson") || !response.body) {
    return { status: response.status, body: (await response.json()) as T };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: { status: number; body: T } | null = null;

  const handle = (line: string) => {
    if (!line.trim()) return;
    const message = JSON.parse(line) as { type: string; status?: number; body?: T } & Record<string, unknown>;
    if (message.type === "progress") onProgress(message as unknown as SyncProgress);
    if (message.type === "result") result = { status: message.status ?? 500, body: message.body as T };
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      handle(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  handle(buffer);
  if (!result) throw new Error("The sync stopped before it finished. Please try again.");
  return result;
}

// Plain-language progress for the screen.
export function describeProgress(progress: SyncProgress): string {
  if (progress.stage === "orders") {
    return progress.found === 0 ? "Connecting to eBay…" : `Bringing in your orders… ${progress.found.toLocaleString()} so far`;
  }
  if (progress.stage === "fees") return "Matching eBay fees, labels and refunds…";
  return `Saving orders… ${progress.done.toLocaleString()} of ${progress.total.toLocaleString()}`;
}
