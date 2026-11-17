-- "Ask ProfitSync": how many questions each account asked per day, so the
-- daily limit works and the AI bill stays predictable. Only counts are kept,
-- never the questions or answers themselves.
-- Locked down from the start: only ProfitSync's server (the "postgres"
-- owner role) can read or write it, not the public Supabase API.
-- Run once in Supabase → SQL Editor. Safe to run again.
-- Until it runs, the assistant stays switched off.

CREATE TABLE IF NOT EXISTS public."assistantUsage" (
  "userId"       text NOT NULL,
  -- The day in Los Angeles time.
  day            date NOT NULL,
  questions      integer NOT NULL DEFAULT 0,
  "inputTokens"  integer NOT NULL DEFAULT 0,
  "outputTokens" integer NOT NULL DEFAULT 0,
  PRIMARY KEY ("userId", day)
);

ALTER TABLE public."assistantUsage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."assistantUsage" FROM anon, authenticated;
