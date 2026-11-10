"use client";

import { useId, useMemo, useRef, useState } from "react";
import { CommandDialog, cn } from "@/components/ui";
import { Icon, type IconName } from "../dashboard/Icon";
import { money, type Order, type View } from "../dashboard/model";
import { ACCOUNT_ITEMS, NAV_GROUPS } from "./nav";

export type PaletteAction = { id: string; label: string; hint?: string; icon: IconName; run: () => void };

type Entry = { key: string; group: string; label: string; hint?: string; icon: IconName; run: () => void };

const PAGE_HINTS: Partial<Record<View, string>> = {
  dashboard: "G then D",
  orders: "G then O",
  listings: "G then L",
  expenses: "G then E",
  taxes: "G then T",
  billing: "G then B",
  settings: "G then S",
  help: "G then H",
};

// Ctrl+K / ⌘K: type to jump to a page, run an action or open an order.
export default function CommandPalette({
  open,
  onClose,
  orders,
  actions,
  onNavigate,
  onOpenOrder,
}: {
  open: boolean;
  onClose: () => void;
  orders: Order[];
  actions: PaletteAction[];
  onNavigate: (view: View) => void;
  onOpenOrder: (id: number) => void;
}) {
  return (
    <CommandDialog open={open} onClose={onClose} label="Quick jump">
      {/* Remounts each time it opens, so the search starts empty. */}
      {open && <PaletteBody onClose={onClose} orders={orders} actions={actions} onNavigate={onNavigate} onOpenOrder={onOpenOrder} />}
    </CommandDialog>
  );
}

function PaletteBody({
  onClose,
  orders,
  actions,
  onNavigate,
  onOpenOrder,
}: {
  onClose: () => void;
  orders: Order[];
  actions: PaletteAction[];
  onNavigate: (view: View) => void;
  onOpenOrder: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const entries = useMemo<Entry[]>(() => {
    const q = query.trim().toLowerCase();
    const matches = (text: string) => !q || text.toLowerCase().includes(q);
    const pages: Entry[] = [...NAV_GROUPS.flatMap((g) => g.items), ...ACCOUNT_ITEMS]
      .filter((item) => matches(item.label))
      .map((item) => ({
        key: `page-${item.id}`,
        group: "Pages",
        label: item.label,
        hint: PAGE_HINTS[item.id],
        icon: item.icon,
        run: () => onNavigate(item.id),
      }));
    const acts: Entry[] = actions
      .filter((a) => matches(a.label))
      .map((a) => ({ key: `action-${a.id}`, group: "Actions", label: a.label, hint: a.hint, icon: a.icon, run: a.run }));
    const found: Entry[] =
      q.length < 2
        ? []
        : orders
            .filter((o) => [o.item, o.ebayOrderId ?? "", o.ebayBuyerId ?? "", o.ebayItemId ?? ""].some((t) => t.toLowerCase().includes(q)))
            .slice(0, 8)
            .map((o) => ({
              key: `order-${o.id}`,
              group: "Orders",
              label: o.item,
              hint: `${money(o.salePrice)}${o.orderDate ? ` · ${new Date(o.orderDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}`,
              icon: "orders" as IconName,
              run: () => onOpenOrder(o.id),
            }));
    return [...pages, ...acts, ...found];
  }, [query, orders, actions, onNavigate, onOpenOrder]);

  const current = Math.min(active, Math.max(0, entries.length - 1));

  function choose(entry: Entry | undefined) {
    if (!entry) return;
    onClose();
    entry.run();
  }

  function move(step: number) {
    if (entries.length === 0) return;
    const next = (current + step + entries.length) % entries.length;
    setActive(next);
    listRef.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Icon name="search" size={18} className="shrink-0 text-subtle" />
        <input
          data-autofocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              move(1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              move(-1);
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(entries[current]);
            }
          }}
          placeholder="Jump to a page, run an action, or find an order…"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={entries[current] ? `${listId}-${current}` : undefined}
          aria-label="Search pages, actions and orders"
          className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-subtle"
        />
        <kbd className="hidden rounded border border-line-strong px-1.5 py-0.5 text-[11px] text-subtle sm:inline">Esc</kbd>
      </div>

      <ul ref={listRef} id={listId} role="listbox" aria-label="Results" className="overflow-y-auto p-2">
        {entries.length === 0 && (
          <li className="px-3 py-8 text-center text-sm text-muted">Nothing matches “{query}”. Try an item name or order number.</li>
        )}
        {entries.map((entry, index) => (
          <li key={entry.key} role="presentation">
            {(index === 0 || entries[index - 1].group !== entry.group) && (
              <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-subtle first:pt-1">{entry.group}</p>
            )}
            <div
              id={`${listId}-${index}`}
              data-index={index}
              role="option"
              aria-selected={index === current}
              onMouseMove={() => setActive(index)}
              onClick={() => choose(entry)}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                index === current ? "bg-accent-soft text-ink" : "text-ink-2"
              )}
            >
              <Icon name={entry.icon} size={16} className={index === current ? "text-accent-ink" : "text-subtle"} />
              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
              {entry.hint && <span className="shrink-0 text-xs text-subtle">{entry.hint}</span>}
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-subtle sm:flex">
        <span>↑ ↓ to move</span>
        <span>Enter to open</span>
        <span className="ml-auto">Press ? for all shortcuts</span>
      </div>
    </>
  );
}
