"use client";

// Moved out of page.tsx unchanged (redesign phase 1).
import { useState } from "react";
import { Icon } from "./Icon";

// ============================================================
// LISTING IMAGE
// ============================================================

export function ListingImage({
  imageUrl,
  item,
  size = "normal",
}: {
  imageUrl: string | null;
  item: string;
  size?: "normal" | "large";
}) {
  // Remember which picture failed, so a new picture gets a fresh try.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = failedUrl !== null && failedUrl === imageUrl;
  const setFailed = (value: boolean) => setFailedUrl(value ? imageUrl : null);

  const dimensions =
    size === "large" ? "h-20 w-20" : "h-12 w-12";

  if (!imageUrl || failed) {
    return (
      <div
        className={`flex ${dimensions} shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-800 text-slate-500`}
        aria-label="No listing image available"
      >
        <Icon
          name="box"
          size={size === "large" ? 28 : 21}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex ${dimensions} shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- eBay listing photo, already sized by eBay */}
      <img
        src={imageUrl}
        alt={item}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-full w-full object-contain"
      />
    </div>
  );
}
