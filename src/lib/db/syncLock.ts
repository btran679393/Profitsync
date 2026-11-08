import { Client } from "pg";

export type SyncLock = { release: () => Promise<void> };

const NO_LOCK: SyncLock = { release: async () => {} };

// Makes sure only one sync of the same kind runs per account at a time
// (double-clicks, two open tabs, auto-sync while syncing). Two syncs at
// once would double the eBay API calls and race each other's writes.
//
// The lock is a Postgres transaction lock held on its own connection for
// as long as the sync runs. If the sync crashes or the server stops it,
// the connection drops and Postgres releases the lock by itself, so a
// store can never get stuck "locked".
//
// Returns "busy" if another sync holds the lock. If the lock itself can't
// be taken (database hiccup) the sync still runs, just unprotected.
export async function tryAcquireSyncLock(key: string): Promise<SyncLock | "busy"> {
  const url = process.env.DATABASE_URL;
  if (!url) return NO_LOCK;

  const client = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  // A dropped connection must not crash the server.
  client.on("error", (error) => console.error("Sync lock connection error:", error));

  try {
    await client.connect();
    await client.query("BEGIN");
    const { rows } = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_xact_lock(hashtext($1)) AS ok", [key]);
    if (!rows[0]?.ok) {
      await client.query("ROLLBACK").catch(() => undefined);
      await client.end().catch(() => undefined);
      return "busy";
    }
  } catch (error) {
    console.error("Sync lock unavailable; syncing without it:", error);
    await client.end().catch(() => undefined);
    return NO_LOCK;
  }

  return {
    release: async () => {
      await client.query("COMMIT").catch(() => undefined);
      await client.end().catch(() => undefined);
    },
  };
}
