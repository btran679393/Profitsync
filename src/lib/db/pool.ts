import { Pool } from "pg";

// One shared set of database connections per server instance, reused by
// every request. Opening a fresh connection for each request (as before)
// adds a round trip every time and, with many sellers at once, can use up
// Supabase's connection limit. DATABASE_URL points at Supabase's
// transaction pooler, so a handful of connections serves many requests.
const cache = globalThis as unknown as { profitsyncPool?: Pool };

export function getPool(): Pool {
  if (!cache.profitsyncPool) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      // Let the server instance shut down when it has nothing to do.
      allowExitOnIdle: true,
    });
    // A dropped idle connection must not crash the server.
    pool.on("error", (error) => console.error("Database pool error:", error));
    cache.profitsyncPool = pool;
  }
  return cache.profitsyncPool;
}
