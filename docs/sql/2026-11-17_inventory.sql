-- Purchases and inventory: what a seller bought (a sourcing trip, a lot, a
-- single item) and the items in it, so ProfitSync can show unsold stock,
-- days to sell, sell-through and which purchases paid off.
-- Locked down like the other tables: only ProfitSync's server (the
-- "postgres" owner role) can read or write them, not the public Supabase API.
-- Run once in Supabase → SQL Editor. Safe to run again.

CREATE TABLE IF NOT EXISTS public."purchase" (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "userId"      text NOT NULL,
  -- Which eBay store it's for; NULL = the whole business.
  "ebayUserId"  text NULL,
  "purchasedOn" date NOT NULL,
  -- Where it came from: "Goodwill on 5th", "Estate sale"…
  source        text NOT NULL,
  note          text NULL,
  "createdAt"   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchase_user_date_idx ON public."purchase" ("userId", "purchasedOn");

CREATE TABLE IF NOT EXISTS public."inventoryItem" (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "userId"      text NOT NULL,
  "purchaseId"  bigint NOT NULL REFERENCES public."purchase" (id) ON DELETE CASCADE,
  name          text NOT NULL,
  quantity      integer NOT NULL CHECK (quantity >= 1),
  -- What one unit cost (its share of the purchase price).
  "unitCost"    numeric(12,2) NOT NULL CHECK ("unitCost" >= 0),
  -- The eBay listing it's sold through, once listed.
  "ebayItemId"  text NULL,
  "createdAt"   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_item_purchase_idx ON public."inventoryItem" ("purchaseId");
CREATE INDEX IF NOT EXISTS inventory_item_user_listing_idx ON public."inventoryItem" ("userId", "ebayItemId");

ALTER TABLE public."purchase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inventoryItem" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."purchase" FROM anon, authenticated;
REVOKE ALL ON public."inventoryItem" FROM anon, authenticated;
