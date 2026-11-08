-- Billing: which plan each ProfitSync account is on (kept in sync with
-- Stripe by the webhook at /api/billing/webhook).
-- Locked down from the start: only ProfitSync's server (the "postgres"
-- owner role) can read or write it, not the public Supabase API.
-- Run once in Supabase → SQL Editor. Safe to run again.

CREATE TABLE IF NOT EXISTS public."subscription" (
  "userId"               text PRIMARY KEY,
  "stripeCustomerId"     text UNIQUE,
  "stripeSubscriptionId" text UNIQUE,
  -- free | pro | ultimate
  plan                   text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'ultimate')),
  -- month | year
  "billingInterval"      text NULL CHECK ("billingInterval" IN ('month', 'year')),
  -- Stripe's subscription status: active, trialing, past_due, canceled, ...
  status                 text NULL,
  "currentPeriodEnd"     timestamptz NULL,
  "cancelAtPeriodEnd"    boolean NOT NULL DEFAULT false,
  -- true = given this plan for free (e.g. the owner's own account);
  -- Stripe changes never downgrade it.
  comped                 boolean NOT NULL DEFAULT false,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedAt"            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public."subscription" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."subscription" FROM anon, authenticated;

-- Your own account: Ultimate for free, so your stores stay unlocked.
-- Change the email if you sign in to ProfitSync with a different one.
INSERT INTO public."subscription" ("userId", plan, status, comped)
SELECT id::text, 'ultimate', 'active', true
FROM auth.users
WHERE lower(email) = lower('Brandontran391@gmail.com')
ON CONFLICT ("userId") DO UPDATE SET plan = 'ultimate', comped = true, "updatedAt" = now();
