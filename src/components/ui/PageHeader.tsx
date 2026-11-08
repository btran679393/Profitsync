import type { ReactNode } from "react";
import { cn } from "./cn";

// Every page starts the same way: title and description on the left,
// page actions on the right, then an optional row of filters.
export function PageHeader({
  title,
  description,
  actions,
  filters,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {filters && <div className="mt-4 flex flex-wrap items-center gap-2">{filters}</div>}
    </header>
  );
}
