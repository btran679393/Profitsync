import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

// Shared look for text boxes, selects and text areas.
export const fieldClasses =
  "h-9 w-full rounded-lg border border-line-strong bg-surface-2 px-3 text-sm text-ink outline-none transition-colors " +
  "placeholder:text-subtle hover:border-muted/40 focus:border-accent focus:ring-2 focus:ring-accent/20 " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-loss/60";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClasses, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClasses, "h-auto min-h-20 py-2", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative inline-flex w-full">
      <select className={cn(fieldClasses, "appearance-none pr-8", className)} {...rest}>
        {children}
      </select>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}

// A $ box for money amounts.
export function MoneyInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className="relative inline-flex w-full">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle">$</span>
      <input inputMode="decimal" className={cn(fieldClasses, "ps-num pl-6", className)} {...rest} />
    </span>
  );
}

// Label + control + optional hint/error, stacked.
export function Field({
  label,
  hint,
  error,
  optional,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1.5 block text-xs font-medium text-ink-2">
        {label}
        {optional && <span className="ml-1 font-normal text-subtle">(optional)</span>}
      </span>
      {children}
      {error ? (
        <span role="alert" className="mt-1 block text-xs text-loss">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-subtle">{hint}</span>
      )}
    </label>
  );
}

export function Checkbox({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm text-ink-2", className)}>
      <input type="checkbox" className="h-4 w-4 rounded border-line-strong accent-[var(--ps-accent)]" {...rest} />
      {label}
    </label>
  );
}
