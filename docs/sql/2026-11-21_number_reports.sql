-- "This number looks wrong" reports from sellers, with a copy of the order's
-- numbers at the time, so you can compare them with eBay later.
-- Read them in Supabase → Table Editor → numberReport (newest first).
-- Locked down like the other tables: only ProfitSync's server (the
-- "postgres" owner role) can read or write it, not the public Supabase API.
-- Run once in Supabase → SQL Editor. Safe to run again.

CREATE TABLE IF NOT EXISTS public."numberReport" (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "userId"     text NOT NULL,
  "orderId"    integer NULL,
  "ebayOrderId" text NULL,
  -- sale_price | ebay_fees | shipping | refund | profit | other
  field        text NOT NULL,
  message      text NOT NULL DEFAULT '',
  -- The order's numbers when it was reported.
  snapshot     jsonb NULL,
  -- open | fixed | not_a_bug: for you to track.
  status       text NOT NULL DEFAULT 'open',
  "createdAt"  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "numberReport_createdAt_idx" ON public."numberReport" ("createdAt" DESC);

ALTER TABLE public."numberReport" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."numberReport" FROM anon, authenticated;
