"use client";

import { Button, Modal } from "@/components/ui";
import { useIsMac } from "./useIsMac";

const GROUPS: Array<{ title: string; rows: Array<[string[], string]> }> = [
  {
    title: "Anywhere",
    rows: [
      [["Ctrl", "K"], "Quick jump: pages, actions and orders"],
      [["?"], "Show this list"],
      [["Esc"], "Close a panel, leave a box, or go back to the Dashboard"],
    ],
  },
  {
    title: "Go to (press G, then the letter)",
    rows: [
      [["G", "D"], "Dashboard"],
      [["G", "O"], "Orders"],
      [["G", "L"], "Listings"],
      [["G", "E"], "Expenses"],
      [["G", "T"], "Taxes"],
      [["G", "B"], "Plan & billing"],
      [["G", "S"], "Settings"],
      [["G", "H"], "Help & guide"],
    ],
  },
  {
    title: "Typing a cost on the Orders page",
    rows: [
      [["Enter"], "Save and move to the next order"],
      [["Esc"], "Undo what you typed"],
    ],
  },
];

// "?": every keyboard shortcut in one place.
export default function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const isMac = useIsMac();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      description="Move around ProfitSync without the mouse."
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-5">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-subtle">{group.title}</h3>
            <dl className="mt-2 divide-y divide-line">
              {group.rows.map(([keys, label]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-sm text-ink-2">{label}</dt>
                  <dd className="flex shrink-0 items-center gap-1">
                    {keys.map((key, i) => (
                      <kbd key={i} className="min-w-[1.75rem] rounded-md border border-line-strong bg-surface-2 px-1.5 py-0.5 text-center text-xs font-medium text-ink">
                        {key === "Ctrl" && isMac ? "⌘" : key}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
