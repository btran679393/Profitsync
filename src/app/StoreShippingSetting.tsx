"use client";

import { useState } from "react";

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
        className="group inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#0b1120] px-3 py-2 text-left text-xs transition hover:border-blue-500/40"
        title="Used for every sale that doesn't have its own shipping cost"
      >
        <span className="text-slate-500">Shipping per order</span>
        {value === null ? (
          <span className="font-semibold text-blue-400 group-hover:text-blue-300">Set default</span>
        ) : (
          <span className="font-semibold text-white">${value.toFixed(2)}</span>
        )}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500 group-hover:text-blue-400" aria-hidden="true">
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
      className="inline-flex items-center gap-2 rounded-xl border border-blue-500/40 bg-[#0b1120] px-3 py-1.5 text-xs"
    >
      <label htmlFor="store-shipping" className="text-slate-400">
        Shipping per order
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-500">$</span>
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
          className={`w-20 rounded-lg border bg-[#151d2d] py-1 pl-5 pr-2 text-white outline-none focus:border-blue-500 ${valid ? "border-white/10" : "border-rose-500/60"}`}
        />
      </div>
      <button
        type="submit"
        disabled={!valid || state === "saving"}
        className="rounded-lg bg-blue-600 px-2.5 py-1 font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
      >
        {state === "saving" ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-slate-500 hover:text-slate-300">
        Cancel
      </button>
      {state === "error" && <span className="text-rose-400">Couldn&apos;t save</span>}
    </form>
  );
}
