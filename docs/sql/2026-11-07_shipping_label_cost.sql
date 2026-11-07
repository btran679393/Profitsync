-- Stores each order's net shipping label cost (labels bought through eBay,
-- minus any voided labels), so profit = sale − eBay fees − label − product cost.
-- Run once in Supabase → SQL Editor. Safe to run again (IF NOT EXISTS).
-- Filled automatically on the next "Sync eBay Orders".

ALTER TABLE public."order"
  ADD COLUMN IF NOT EXISTS "shippingLabelCost" numeric(12,2) NULL;
