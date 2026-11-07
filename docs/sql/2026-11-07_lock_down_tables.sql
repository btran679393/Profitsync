-- SECURITY FIX: stop the public Supabase API from reading or changing these
-- tables. Before this, anyone with the site's public (publishable) key could
-- read, edit or delete every row — including sellers' eBay tokens.
--
-- ProfitSync's server connects as the "postgres" owner role, which is not
-- affected by row level security, so the app keeps working exactly the same.
-- Run once in Supabase → SQL Editor. Safe to run again.

-- 1. Turn on row level security with no policies = no access via the API.
ALTER TABLE public."order"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ebayConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."EbayListing"    ENABLE ROW LEVEL SECURITY;

-- 2. Belt and braces: the public API roles get no table permissions at all.
REVOKE ALL ON public."order", public."ebayConnection", public."EbayListing"
  FROM anon, authenticated;
