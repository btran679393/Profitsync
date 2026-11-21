import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import type { Pool } from "pg";

// eBay access and refresh tokens are saved encrypted, so a copy of the
// database alone can't be used to get into anyone's eBay account. The key
// lives only in the server's environment (EBAY_TOKEN_ENCRYPTION_KEY), never
// in the database.
//
// Make a key with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
//
// Saved form: "enc:v1:<iv>:<auth tag>:<encrypted token>" (base64url parts),
// using AES-256-GCM, which also detects any tampering.
//
// Tokens saved before encryption was added are plain text. Reading still
// works for those, and encryptStoredTokens() below converts them.

const PREFIX = "enc:v1:";

function key(): Buffer {
  const raw = process.env.EBAY_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("EBAY_TOKEN_ENCRYPTION_KEY is not set.");
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32) throw new Error("EBAY_TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return bytes;
}

export function isEncryptedToken(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, encrypted].map((part) => part.toString("base64url")).join(":");
}

export function decryptToken(stored: string): string {
  // Saved before encryption was added.
  if (!isEncryptedToken(stored)) return stored;
  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("Saved eBay token is damaged.");
  const [iv, tag, encrypted] = parts.map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

// Encrypts any tokens still saved as plain text. Safe to run again and
// again; run by the daily background sync. Does nothing without a key.
export async function encryptStoredTokens(pool: Pool): Promise<number> {
  if (!process.env.EBAY_TOKEN_ENCRYPTION_KEY?.trim()) return 0;
  const { rows } = await pool.query<{ id: number; accessToken: string | null; refreshToken: string | null }>(
    `SELECT id, "accessToken", "refreshToken" FROM public."ebayConnection"
     WHERE ("accessToken" IS NOT NULL AND "accessToken" NOT LIKE 'enc:v1:%')
        OR ("refreshToken" IS NOT NULL AND "refreshToken" NOT LIKE 'enc:v1:%')`
  );
  for (const row of rows) {
    const access = row.accessToken && !isEncryptedToken(row.accessToken) ? encryptToken(row.accessToken) : row.accessToken;
    const refresh = row.refreshToken && !isEncryptedToken(row.refreshToken) ? encryptToken(row.refreshToken) : row.refreshToken;
    // Only replace values that are still the plain text read above, so a
    // token renewed in the meantime is never overwritten with an old one.
    await pool.query(
      `UPDATE public."ebayConnection"
       SET "accessToken" = CASE WHEN "accessToken" = $2 THEN $3 ELSE "accessToken" END,
           "refreshToken" = CASE WHEN "refreshToken" = $4 THEN $5 ELSE "refreshToken" END
       WHERE id = $1`,
      [row.id, row.accessToken, access, row.refreshToken, refresh]
    );
  }
  return rows.length;
}
