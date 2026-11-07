import type { Pool, PoolClient } from "pg";

// Some columns are added by hand-run SQL files in docs/sql. Check which ones
// exist so the app keeps working before (and after) they're added.
export async function existingColumns(
  db: Pool | PoolClient,
  table: string,
  candidates: string[]
): Promise<Set<string>> {
  const result = await db.query<{ column_name: string }>(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1 AND column_name = ANY($2::text[])
    `,
    [table, candidates]
  );
  return new Set(result.rows.map((row) => row.column_name));
}

export function isMissingColumn(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "42703";
}
