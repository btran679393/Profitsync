-- Other eBay charges tied to an order (for example promoted-listing ad
-- fees), read from eBay's "non-sale charge" records on each sync.
-- Profit subtracts them alongside the normal selling fees.
-- Run once in Supabase → SQL Editor. Safe to run again (IF NOT EXISTS).

ALTER TABLE public."order"
  ADD COLUMN IF NOT EXISTS "otherFees" numeric(12,2) NULL;
