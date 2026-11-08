"use client";

// Moved out of page.tsx unchanged (redesign phase 1).
import { type IconName, Icon } from "./Icon";

// ============================================================
// METRIC CARD
// ============================================================

export function MetricCard({
  title,
  value,
  description,
  icon,
  accent = "blue",
  featured = false,
}: {
  title: string;
  value: string;
  description: string;
  icon: IconName;
  accent?: "blue" | "green" | "amber" | "purple" | "rose";
  featured?: boolean;
}) {
  const accents = {
    blue: "bg-blue-500/10 text-blue-400",
    green: "bg-emerald-500/10 text-emerald-400",
    amber: "bg-amber-500/10 text-amber-400",
    purple: "bg-violet-500/10 text-violet-400",
    rose: "bg-rose-500/10 text-rose-400",
  };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-5 transition hover:border-white/20 ${
        featured
          ? "border-emerald-500/20 bg-gradient-to-br from-[#152b2b] to-[#151d2d]"
          : "border-white/[0.07] bg-[#151d2d]"
      }`}
    >
      {featured && (
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-500/[0.06] blur-2xl" />
      )}

      <div className="relative mb-6 flex items-start justify-between">
        <span className="text-sm font-medium text-slate-400">
          {title}
        </span>

        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${accents[accent]}`}
        >
          <Icon name={icon} size={19} />
        </div>
      </div>

      <div
        className={`relative text-2xl font-bold tracking-tight sm:text-3xl ${
          featured ? "text-emerald-400" : accent === "rose" ? "text-rose-400" : "text-white"
        }`}
      >
        {value}
      </div>

      <p className="relative mt-2 text-xs leading-5 text-slate-500">
        {description}
      </p>
    </div>
  );
}
