"use client";

import { useRef } from "react";
import { cn } from "./cn";

// A row of options where exactly one is chosen (date ranges, tabs, filters).
// Arrow keys move between options, like native radio buttons.
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
  className,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string; count?: number }>;
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-line bg-surface-2 p-0.5", className)}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors duration-150",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-xs sm:text-[13px]",
              active ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink"
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span className={cn("ps-num rounded px-1 text-[10px] font-semibold", active ? "bg-accent-soft text-accent-ink" : "bg-line text-subtle")}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
