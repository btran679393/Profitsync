-- Business expenses that aren't tied to one order: packing supplies, tape,
-- an eBay Store subscription, software, etc. Net Profit subtracts them.
-- Locked down from the start: only ProfitSync's server (the "postgres"
-- owner role) can read or write it, not the public Supabase API.
-- Run once in Supabase → SQL Editor. Safe to run again.

CREATE TABLE IF NOT EXISTS public."expense" (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "userId"     text NOT NULL,
  -- Which eBay store it belongs to; NULL = applies to the whole business.
  "ebayUserId" text NULL,
  "spentOn"    date NOT NULL,
  category     text NOT NULL,
  amount       numeric(12,2) NOT NULL CHECK (amount >= 0),
  note         text NULL,
  "createdAt"  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expense_user_date_idx ON public."expense" ("userId", "spentOn");

ALTER TABLE public."expense" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."expense" FROM anon, authenticated;
