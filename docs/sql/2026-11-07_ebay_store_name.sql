-- Saves the connected seller's eBay username and store name so the dashboard
-- greeting ("Good evening, <Store Name>") loads instantly.
-- Run once in Supabase → SQL Editor. Safe to run again (IF NOT EXISTS).
-- The app works without it (it asks eBay instead), so this is optional but recommended.

ALTER TABLE public."ebayConnection"
  ADD COLUMN IF NOT EXISTS "ebayUsername" text NULL,
  ADD COLUMN IF NOT EXISTS "storeName" text NULL;
