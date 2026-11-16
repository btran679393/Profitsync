-- eBay charges that aren't tied to an order (eBay Store subscription,
-- insertion fees, ad fees billed by the day) become business expenses
-- automatically. Each sync keeps one row per store, month and kind up to
-- date; "ebayChargeKey" (e.g. "2026-11:eBay insertion fees") identifies it.
-- Rows typed in by the seller keep ebayChargeKey NULL.
-- Run once in Supabase → SQL Editor. Safe to run again.
-- Until it runs, these charges are left out (as before).

ALTER TABLE public."expense"
  ADD COLUMN IF NOT EXISTS "ebayChargeKey" text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS expense_ebay_charge_key_idx
  ON public."expense" ("userId", "ebayUserId", "ebayChargeKey")
  WHERE "ebayChargeKey" IS NOT NULL;
