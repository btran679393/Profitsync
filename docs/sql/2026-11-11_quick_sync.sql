-- Quick order syncs: remember when each store last synced, so a sync only
-- asks eBay for orders created or changed since then.
-- Safe to run more than once. Until it runs, every sync is a full sync.

ALTER TABLE public."ebayConnection"
  ADD COLUMN IF NOT EXISTS "lastOrderSyncAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "lastFullOrderSyncAt" timestamptz;
