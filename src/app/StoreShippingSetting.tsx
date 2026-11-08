"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

// One store-wide "what I usually pay to ship an order" setting. Used for any
// sale that has no shipping of its own (typed, listing default or eBay label).
export default function StoreShippingSetting({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  const valid = draft.trim() === "" || /^\d+(\.\d{1,2})?$/.test(draft.trim());

  async function save() {
    if (!valid) return;
    setState("saving");
    try {
      await onSave(draft.trim());
      setEditing(false);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value === null ? "" : value.toFixed(2));
          setEditing(true);
          setState("idle");
        }}
        className="group inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-left text-xs transition-colors hover:bg-surface-2"
        title="Used for every sale that doesn't have its own shipping cost"
      >
        <span className="text-muted">Shipping per order</span>
        {value === null ? (
          <span className="font-semibold text-accent-ink">Set default</span>
        ) : (
          <span className="ps-num font-semibold text-ink">${value.toFixed(2)}</span>
        )}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-subtle group-hover:text-accent-ink" aria-hidden="true">
          <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-accent/50 bg-surface px-2 text-xs"
    >
      <label htmlFor="store-shipping" className="pl-1 text-muted">
        Shipping per order
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-subtle">$</span>
        <input
          id="store-shipping"
          autoFocus
          inputMode="decimal"
          value={draft}
          placeholder="4.50"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setEditing(false);
          }}
          className={`ps-num h-7 w-20 rounded-md border bg-surface-2 pl-5 pr-2 text-ink outline-none focus:border-accent ${valid ? "border-line-strong" : "border-loss/60"}`}
        />
      </div>
      <Button type="submit" size="sm" variant="primary" className="h-7" disabled={!valid} loading={state === "saving"}>
        Save
      </Button>
      <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(false)}>
        Cancel
      </Button>
      {state === "error" && <span className="text-loss">Couldn&apos;t save</span>}
    </form>
  );
}
