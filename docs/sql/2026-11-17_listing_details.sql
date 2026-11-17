-- Listing category and brand (from eBay's public item details), for the
-- Reports page: profit by category and by brand. Filled in a few dozen
-- listings at a time by each listing refresh.
-- Run once in Supabase → SQL Editor. Safe to run again.
-- Until it runs, Reports shows everything under "Not known yet".

ALTER TABLE public."EbayListing"
  ADD COLUMN IF NOT EXISTS "categoryName" text NULL,
  ADD COLUMN IF NOT EXISTS "categoryPath" text NULL,
  ADD COLUMN IF NOT EXISTS "brand" text NULL,
  ADD COLUMN IF NOT EXISTS "detailsCheckedAt" timestamptz NULL;
