-- Speed for big sellers: indexes for the lookups ProfitSync does most.
-- Without them, loading orders or counting this month's orders reads the
-- whole orders table, which gets slow once there are many sellers and
-- tens of thousands of orders. With them, each lookup reads only that
-- seller's rows. Nothing about your data changes.
-- Run once in Supabase → SQL Editor. Safe to run again.

-- Orders page, dashboard and plan limits: one seller's orders by date,
-- for one store or all their stores.
CREATE INDEX IF NOT EXISTS order_user_date_idx
  ON public."order" ("userId", "orderDate" DESC);
CREATE INDEX IF NOT EXISTS order_user_store_date_idx
  ON public."order" ("userId", "ebayUserId", "orderDate" DESC);

-- Store switcher, sync and plan checks: one seller's connected stores.
CREATE INDEX IF NOT EXISTS ebay_connection_user_idx
  ON public."ebayConnection" ("userId", environment);
