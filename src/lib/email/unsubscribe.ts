import { createHmac, timingSafeEqual } from "crypto";
import { siteUrl } from "@/lib/site";

// Unsubscribe links carry the account ID and a signature, so a link only
// works for the account it was sent to and can't be guessed or changed.
// The signing key is derived from EBAY_OAUTH_STATE_SECRET (already a
// server-only secret) with its own label, so the two uses never overlap.

function key(): Buffer | null {
  const secret = process.env.EBAY_OAUTH_STATE_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update("profitsync-email-unsubscribe-v1").digest();
}

function sign(userId: string): string | null {
  const k = key();
  return k ? createHmac("sha256", k).update(userId).digest("hex").slice(0, 40) : null;
}

export function unsubscribeUrl(userId: string): string {
  const token = sign(userId) ?? "";
  return `${siteUrl()}/api/email/unsubscribe?${new URLSearchParams({ u: userId, t: token })}`;
}

export function verifyUnsubscribe(userId: string | null, token: string | null): boolean {
  if (!userId || !token || userId.length > 100) return false;
  const expected = sign(userId);
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
