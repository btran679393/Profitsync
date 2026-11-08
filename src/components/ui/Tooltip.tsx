import { useId, type ReactNode } from "react";
import { cn } from "./cn";

// A small explanation that shows on hover and on keyboard focus (unlike the
// browser's title text). Wrap the thing it explains.
export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
}) {
  const id = useId();
  return (
    <span className={cn("group/tip relative inline-flex", className)} aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 w-max max-w-64 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium leading-5 text-bg opacity-0 shadow-pop transition-opacity duration-150",
          "group-hover/tip:opacity-100 group-focus-within/tip:opacity-100",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2"
        )}
      >
        {content}
      </span>
    </span>
  );
}

// A small (i) that explains a number or term.
export function InfoTip({ content, label = "More info" }: { content: ReactNode; label?: string }) {
  return (
    <Tooltip content={content}>
      <button type="button" aria-label={label} className="inline-flex h-4 w-4 items-center justify-center rounded-full text-subtle hover:text-ink">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
      </button>
    </Tooltip>
  );
}
