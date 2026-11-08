-- Repeating expenses: an expense can repeat every month (e.g. an eBay Store
-- subscription or software plan) until the seller stops it.
-- Run once in Supabase → SQL Editor. Safe to run again.

ALTER TABLE public."expense"
  ADD COLUMN IF NOT EXISTS "repeatMonthly" boolean NOT NULL DEFAULT false,
  -- Last day it still counts (NULL = still repeating).
  ADD COLUMN IF NOT EXISTS "endedOn" date NULL;
