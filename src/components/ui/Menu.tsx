"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

export type MenuItem = {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  badge?: ReactNode;
};

// A button that opens a short list of actions ("⋯ More"). Arrow keys move,
// Enter picks, Escape or a click outside closes.
export function Menu({
  trigger,
  label,
  items,
  align = "right",
}: {
  trigger: (props: { open: boolean; toggle: () => void; id: string; "aria-expanded": boolean; "aria-haspopup": "menu" }) => ReactNode;
  label: string;
  items: MenuItem[];
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    itemRefs.current.find((el) => el && !el.disabled)?.focus();
    const onPointer = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      setOpen(false);
      boxRef.current?.querySelector<HTMLElement>("[aria-haspopup]")?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const enabled = itemRefs.current.filter((el): el is HTMLButtonElement => Boolean(el && !el.disabled));
    const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? (index + 1) % enabled.length : (index - 1 + enabled.length) % enabled.length;
    enabled[next]?.focus();
  }

  return (
    <div ref={boxRef} className="relative inline-flex" onKeyDown={onKeyDown}>
      {trigger({ open, toggle: () => setOpen((v) => !v), id, "aria-expanded": open, "aria-haspopup": "menu" })}
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={cn(
            "animate-ps-in absolute top-full z-50 mt-1.5 min-w-56 overflow-hidden rounded-xl border border-line bg-elevated p-1 shadow-pop",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors focus:outline-none disabled:opacity-50",
                item.danger ? "text-loss hover:bg-loss-soft focus:bg-loss-soft" : "text-ink-2 hover:bg-surface-2 focus:bg-surface-2"
              )}
            >
              {item.icon && <span className="shrink-0 text-muted">{item.icon}</span>}
              <span className="min-w-0 flex-1">
                <span className="block">{item.label}</span>
                {item.hint && <span className="block text-xs text-subtle">{item.hint}</span>}
              </span>
              {item.badge}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
