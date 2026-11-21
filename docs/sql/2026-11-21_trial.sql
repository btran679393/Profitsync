-- Free Pro trial: when each account's trial ends (NULL = never started).
-- One trial per account; the server only sets it when it's still NULL.
-- Run once in Supabase → SQL Editor. Safe to run again.

ALTER TABLE public."subscription" ADD COLUMN IF NOT EXISTS "trialEndsAt" timestamptz NULL;
