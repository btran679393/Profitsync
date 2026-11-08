"use client";

import { useEffect, useState } from "react";
import type { User, UserIdentity } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type Account = {
  name: string;
  email: string;
  picture: string | null;
  provider: string;
};

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  azure: "Microsoft",
  facebook: "Facebook",
  email: "email",
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// Google and Facebook send a profile picture; Microsoft doesn't, so those
// users (and email/password users) get their initials instead.
function pictureFrom(data: Record<string, unknown> | undefined): string | null {
  const url = text(data?.avatar_url) || text(data?.picture);
  return url.startsWith("https://") ? url : null;
}

function toAccount(user: User): Account {
  // The identity used most recently is the button they signed in with.
  const identities = [...(user.identities ?? [])].sort(
    (a: UserIdentity, b: UserIdentity) =>
      (b.last_sign_in_at ?? "").localeCompare(a.last_sign_in_at ?? "")
  );
  const latest = identities[0];
  const meta = user.user_metadata ?? {};

  const picture =
    pictureFrom(latest?.identity_data) ??
    identities.map((i) => pictureFrom(i.identity_data)).find(Boolean) ??
    pictureFrom(meta);

  const email = user.email ?? text(latest?.identity_data?.email);
  const name =
    text(meta.full_name) ||
    text(meta.name) ||
    text(latest?.identity_data?.full_name) ||
    text(latest?.identity_data?.name) ||
    email.split("@")[0];

  return {
    name,
    email,
    picture: picture ?? null,
    provider: latest?.provider ?? text(user.app_metadata?.provider),
  };
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

// The signed-in person: avatar, name and email. "sidebar" is the compact
// version at the bottom of the sidebar (just the avatar when it's collapsed).
export default function AccountBadge({ variant = "card" }: { variant?: "card" | "sidebar" }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [pictureFailed, setPictureFailed] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active && data.user) setAccount(toAccount(data.user));
    });
    return () => {
      active = false;
    };
  }, []);

  if (!account) {
    return variant === "sidebar" ? <div className="h-10" aria-hidden="true" /> : null;
  }

  const label = PROVIDER_LABELS[account.provider];
  const small = variant === "sidebar";
  const size = small ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  const avatar =
    account.picture && !pictureFailed ? (
      // eslint-disable-next-line @next/next/no-img-element -- avatar comes from Google/Facebook, not a static asset
      <img
        src={account.picture}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setPictureFailed(true)}
        className={`${size} shrink-0 rounded-full object-cover ring-1 ring-line`}
      />
    ) : (
      <div className={`${size} flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-on-accent`}>
        {initials(account.name || account.email || "?")}
      </div>
    );

  if (small) {
    return (
      <div className="ps-nav-item flex items-center gap-2.5 rounded-lg px-1.5 py-1" title={`${account.name} · ${account.email}`}>
        {avatar}
        <div className="ps-hide-collapsed min-w-0">
          <p className="truncate text-[13px] font-semibold text-ink">{account.name}</p>
          <p className="truncate text-xs text-subtle">{account.email}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-3">
      {avatar}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink" title={account.name}>
          {account.name}
        </p>
        <p className="truncate text-xs text-muted" title={account.email}>
          {account.email}
        </p>
        {label && <p className="mt-0.5 text-[11px] text-subtle">Signed in with {label}</p>}
      </div>
    </div>
  );
}
