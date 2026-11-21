"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui";

// Phones only: a round "+" button in the bottom corner to log an expense or
// a mileage trip from anywhere in the app, without hunting through menus.
export function QuickAdd({ onAdd }: { onAdd: (kind: "expense" | "mileage") => void }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const onClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const choose = (kind: "expense" | "mileage") => {
    setOpen(false);
    onAdd(kind);
  };

  return (
    <div ref={panelRef} className="fixed bottom-5 right-5 z-30 flex flex-col items-end gap-2 lg:hidden print:hidden" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
      {open && (
        <div role="menu" aria-label="Quick add" className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-2 shadow-pop">
          <button role="menuitem" type="button" onClick={() => choose("expense")} className="flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-ink hover:bg-surface-2">
            <span aria-hidden="true" className="text-lg">🧾</span>
            Add an expense
          </button>
          <button role="menuitem" type="button" onClick={() => choose("mileage")} className="flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-ink hover:bg-surface-2">
            <span aria-hidden="true" className="text-lg">🚗</span>
            Log a mileage trip
          </button>
        </div>
      )}
      <button
        type="button"
        aria-label={open ? "Close quick add" : "Quick add an expense or mileage trip"}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl font-light text-white shadow-pop transition-transform active:scale-95",
          open && "rotate-45"
        )}
      >
        +
      </button>
    </div>
  );
}
