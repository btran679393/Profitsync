"use client";

import { useId, useState } from "react";
import type { ReturnPolicy } from "./dashboard/model";

// The store's return policy. Until a refund is reviewed, its loss follows
// this: no returns = the item and shipping are lost; returns accepted = the
// item comes back, so only shipping is lost.
export default function StoreReturnPolicySetting({
  value,
  onSave,
}: {
  value: ReturnPolicy | null;
  onSave: (value: ReturnPolicy | null) => Promise<void>;
}) {
  const id = useId();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  async function change(raw: string) {
    setState("saving");
    try {
      await onSave(raw === "none" || raw === "accepted" ? raw : null);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <span
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-xs"
      title="Used to count what a refund cost you until you review it"
    >
      <label htmlFor={id} className="text-muted">
        Returns
      </label>
      <select
        id={id}
        value={value ?? ""}
        disabled={state === "saving"}
        onChange={(event) => void change(event.target.value)}
        className={`cursor-pointer bg-transparent font-semibold outline-none focus-visible:underline ${value ? "text-ink" : "text-accent-ink"}`}
      >
        <option value="">Set policy</option>
        <option value="none">Not accepted</option>
        <option value="accepted">Accepted</option>
      </select>
      {state === "error" && <span className="text-loss">Couldn&apos;t save</span>}
    </span>
  );
}
