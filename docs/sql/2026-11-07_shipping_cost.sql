-- Shipping you pay outside eBay (Pirate Ship, USPS.com, PayPal, post office…).
--   order."shippingCost"       what shipping that order cost you (typed in)
--   EbayListing."shippingCost" optional default per order for that listing;
--                              new sales from the listing get it automatically
-- Profit subtracts order.shippingCost when set, otherwise any eBay label cost.
-- Run once in Supabase → SQL Editor. Safe to run again (IF NOT EXISTS).

ALTER TABLE public."order"
  ADD COLUMN IF NOT EXISTS "shippingCost" numeric(12,2) NULL
  CHECK ("shippingCost" IS NULL OR "shippingCost" >= 0);

ALTER TABLE public."EbayListing"
  ADD COLUMN IF NOT EXISTS "shippingCost" numeric(12,2) NULL
  CHECK ("shippingCost" IS NULL OR "shippingCost" >= 0);
