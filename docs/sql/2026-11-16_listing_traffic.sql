-- Listing traffic: watchers and when the listing started (from the listing
-- sync), plus views, impressions and sales over the last 30 days (from
-- eBay's Analytics API, for stores that granted the analytics permission).
-- Run once in Supabase → SQL Editor. Safe to run again.
-- Until it runs, the Listings page simply doesn't show these numbers.

ALTER TABLE public."EbayListing"
  ADD COLUMN IF NOT EXISTS "watchCount" integer NULL,
  ADD COLUMN IF NOT EXISTS "listedAt" timestamptz NULL,
  ADD COLUMN IF NOT EXISTS "views30" integer NULL,
  ADD COLUMN IF NOT EXISTS "impressions30" integer NULL,
  ADD COLUMN IF NOT EXISTS "sales30" integer NULL,
  ADD COLUMN IF NOT EXISTS "trafficUpdatedAt" timestamptz NULL;
