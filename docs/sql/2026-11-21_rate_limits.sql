-- Rate limits: counts how often each account uses the expensive actions
-- (syncing, imports, checkout…) so one account can't spam them and use up
-- ProfitSync's eBay API allowance or slow things down for everyone.
-- One row per account + action; old rows are simply reused.
-- Locked down like the other tables: only ProfitSync's server (the
-- "postgres" owner role) can read or write it, not the public Supabase API.
-- Run once in Supabase → SQL Editor. Safe to run again.

CREATE TABLE IF NOT EXISTS public."rateLimit" (
  key           text PRIMARY KEY,
  "windowStart" timestamptz NOT NULL DEFAULT now(),
  count         integer NOT NULL DEFAULT 0
);

ALTER TABLE public."rateLimit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."rateLimit" FROM anon, authenticated;
