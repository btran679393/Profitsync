-- Weekly summary emails: who wants them and when the last one went out
-- (so a retried run never sends twice). No row = wants them (the default);
-- the unsubscribe link and the Settings switch turn them off.
-- Locked down like the other tables: only ProfitSync's server (the
-- "postgres" owner role) can read or write it, not the public Supabase API.
-- Run once in Supabase → SQL Editor. Safe to run again.

CREATE TABLE IF NOT EXISTS public."emailPreference" (
  "userId"            text PRIMARY KEY,
  "weeklySummary"     boolean NOT NULL DEFAULT true,
  "lastWeeklyEmailAt" timestamptz NULL,
  "updatedAt"         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public."emailPreference" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."emailPreference" FROM anon, authenticated;
