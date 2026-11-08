# Switching on billing (Stripe)

ProfitSync's plans live in `src/lib/billing/plans.ts`:

| Plan | Monthly | Yearly | Stores | Orders | History | Tax report, CSV, shipping import, auto-sync, All stores |
|---|---|---|---|---|---|---|
| Free | $0 | $0 | 1 | 50 a month | 90 days | No |
| Pro | $9.99 | $104.99 (saves $14.89) | 3 | Unlimited | 12 months | Yes |
| Ultimate | $19.99 | $209.99 (saves $29.89) | Unlimited | Unlimited | 12 months | Yes |

**Until both steps 1 and 3 are done, billing stays off and everyone keeps full access**, so the code is safe to deploy first.

The Stripe products and prices are created automatically the first time someone checks out. There's nothing to set up for them by hand.

## 1. Create the billing table (Supabase)

Run `docs/sql/2026-11-08_billing.sql` in Supabase → SQL Editor.

It also gives **your own account Ultimate for free**, so your stores stay unlocked. If you sign in to ProfitSync with an email other than Brandontran391@gmail.com, change it in the last statement first.

## 2. Create a Stripe account

1. Sign up at https://dashboard.stripe.com/register.
2. Stay in **Test mode** (sandbox) for now. Nothing is really charged there.

## 3. Add the secret key to Vercel

1. In Stripe, go to **Developers → API keys** and reveal the **Secret key** (`sk_test_…`).
2. In Vercel, open **profitsync → Settings → Environment Variables**.
3. Add `STRIPE_SECRET_KEY` with that value, for **Production**.

## 4. Add the webhook (how Stripe tells ProfitSync about payments)

1. In Stripe, go to **Developers → Webhooks** (or Workbench → Event destinations) and choose **Add destination / endpoint**.
2. Set the endpoint URL to `https://profitsync-three.vercel.app/api/billing/webhook`.
3. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.paused`
   - `customer.subscription.resumed`
4. Save it, then copy its **Signing secret** (`whsec_…`).
5. In Vercel, add it as `STRIPE_WEBHOOK_SECRET` for **Production**.

## 5. Switch on the customer portal

This is Stripe's own page where people update their card, download invoices or cancel.

1. In Stripe, go to **Settings → Billing → Customer portal**.
2. Turn on:
   - cancel subscriptions (at the end of the billing period)
   - update payment methods
   - invoice history
3. Click **Save**. Stripe won't open the portal, even in test mode, until this is saved once.

## 6. Redeploy

New environment variables only apply to new deployments. In Vercel, go to **Deployments → ⋯ → Redeploy** on the latest one, or push any commit.

## 7. Test it

1. Sign in with a **second** test account (yours is on free Ultimate).
2. Go to **Plan & billing** and pick Pro.
3. On Stripe's checkout page, pay with card `4242 4242 4242 4242`, any future date, any CVC and any ZIP code.
4. You should land back on Plan & billing showing **Pro**.
5. Try switching to yearly, and cancelling from **Manage billing**.

## Going live (real money)

1. In Stripe, **activate your account**: business details and a bank account for payouts.
2. Stripe also wants a **Terms of Service** and a **refund/cancellation policy** linked on the site.
3. Switch Stripe to live mode, then repeat steps 3–5 with the **live** keys (`sk_live_…`) and a live webhook.
4. Replace the two Vercel variables with the live values, then redeploy.
