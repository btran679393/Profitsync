import Stripe from "stripe";
import type { User } from "@supabase/supabase-js";
import type { Pool, PoolClient } from "pg";
import {
  PLANS,
  UNLIMITED_LIMITS,
  isBillingInterval,
  isPaidPlan,
  priceCents,
  priceLookupKey,
  type BillingInterval,
  type BillingStatus,
  type PaidPlanId,
  type PlanId,
  type PlanLimits,
} from "./plans";

type Db = Pool | PoolClient;

// ------------------------------------------------------------
// Stripe
// ------------------------------------------------------------

// Billing is "on" once the Stripe secret key is set. Until then every
// account keeps unlimited access, exactly like before billing existed.
export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let stripeClient: Stripe | null = null;
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  stripeClient ??= new Stripe(key, { appInfo: { name: "ProfitSync" } });
  return stripeClient;
}

// The Stripe price for a plan, found by its lookup key. Created the first
// time it's needed, so there's nothing to set up by hand in Stripe.
export async function ensurePrice(plan: PaidPlanId, interval: BillingInterval): Promise<string> {
  const stripe = getStripe();
  const lookupKey = priceLookupKey(plan, interval);
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const found = existing.data[0];
  // If the price in plans.ts changes, make a new Stripe price and move the
  // lookup key over to it (existing subscribers keep their old price).
  if (found && found.unit_amount === priceCents(plan, interval)) return found.id;

  const productId = await ensureProduct(plan);
  const price = await stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: priceCents(plan, interval),
    recurring: { interval },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    metadata: { profitsyncPlan: plan, profitsyncInterval: interval },
  });
  return price.id;
}

async function ensureProduct(plan: PaidPlanId): Promise<string> {
  const stripe = getStripe();
  const productId = `profitsync_${plan}`;
  try {
    const product = await stripe.products.retrieve(productId);
    if (!product.active) await stripe.products.update(productId, { active: true });
    return product.id;
  } catch (error) {
    if ((error as { code?: string }).code !== "resource_missing") throw error;
  }
  const product = await stripe.products.create({
    id: productId,
    name: `ProfitSync ${PLANS[plan].name}`,
    description: PLANS[plan].tagline,
    metadata: { profitsyncPlan: plan },
  });
  return product.id;
}

// Which plan and billing period a Stripe price is for.
export function planFromPrice(price: Stripe.Price | null | undefined): { plan: PaidPlanId; interval: BillingInterval } | null {
  if (!price) return null;
  const plan = price.metadata?.profitsyncPlan;
  const interval = price.recurring?.interval;
  if (isPaidPlan(plan) && isBillingInterval(interval)) return { plan, interval };
  const match = /^profitsync_(pro|ultimate)_(month|year)$/.exec(price.lookup_key ?? "");
  return match ? { plan: match[1] as PaidPlanId, interval: match[2] as BillingInterval } : null;
}

// ------------------------------------------------------------
// The subscription table
// ------------------------------------------------------------

export type SubscriptionRow = {
  userId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  plan: PlanId;
  billingInterval: BillingInterval | null;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  comped: boolean;
};

function isMissingTable(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "42P01";
}

// null row = no subscription yet. tableMissing = the billing SQL hasn't run.
export async function loadSubscription(db: Db, userId: string): Promise<{ row: SubscriptionRow | null; tableMissing: boolean }> {
  try {
    const result = await db.query<SubscriptionRow>(
      `SELECT "userId", "stripeCustomerId", "stripeSubscriptionId", plan, "billingInterval", status,
              "currentPeriodEnd", "cancelAtPeriodEnd", comped
       FROM public."subscription" WHERE "userId" = $1`,
      [userId]
    );
    return { row: result.rows[0] ?? null, tableMissing: false };
  } catch (error) {
    if (isMissingTable(error)) return { row: null, tableMissing: true };
    throw error;
  }
}

// Stripe statuses that still count as paid. past_due gets the paid plan
// while Stripe retries the card.
const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);

function effectivePlan(row: SubscriptionRow | null): PlanId {
  if (!row) return "free";
  if (row.comped && isPaidPlan(row.plan)) return row.plan;
  if (isPaidPlan(row.plan) && row.status && PAID_STATUSES.has(row.status)) return row.plan;
  return "free";
}

export type UserPlan = {
  // False = billing not set up yet; limits are unlimited.
  enabled: boolean;
  plan: PlanId;
  limits: PlanLimits;
  row: SubscriptionRow | null;
};

export async function getUserPlan(db: Db, userId: string): Promise<UserPlan> {
  if (!stripeConfigured()) return { enabled: false, plan: "ultimate", limits: UNLIMITED_LIMITS, row: null };
  const { row, tableMissing } = await loadSubscription(db, userId);
  if (tableMissing) return { enabled: false, plan: "ultimate", limits: UNLIMITED_LIMITS, row: null };
  const plan = effectivePlan(row);
  return { enabled: true, plan, limits: PLANS[plan].limits, row };
}

// Save what Stripe says about a subscription.
export async function saveSubscription(db: Db, userId: string, subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  const info = planFromPrice(item?.price);
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null;
  const cancelling = Boolean(subscription.cancel_at_period_end || subscription.cancel_at);
  await db.query(
    `
    INSERT INTO public."subscription"
      ("userId", "stripeCustomerId", "stripeSubscriptionId", plan, "billingInterval", status,
       "currentPeriodEnd", "cancelAtPeriodEnd", "updatedAt")
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
    ON CONFLICT ("userId") DO UPDATE SET
      "stripeCustomerId" = EXCLUDED."stripeCustomerId",
      "stripeSubscriptionId" = EXCLUDED."stripeSubscriptionId",
      plan = CASE WHEN public."subscription".comped THEN public."subscription".plan ELSE EXCLUDED.plan END,
      "billingInterval" = EXCLUDED."billingInterval",
      status = EXCLUDED.status,
      "currentPeriodEnd" = EXCLUDED."currentPeriodEnd",
      "cancelAtPeriodEnd" = EXCLUDED."cancelAtPeriodEnd",
      "updatedAt" = now()
    `,
    [userId, customerId, subscription.id, info?.plan ?? "free", info?.interval ?? null, subscription.status, periodEnd, cancelling]
  );
}

export async function saveCustomerId(db: Db, userId: string, customerId: string) {
  await db.query(
    `
    INSERT INTO public."subscription" ("userId", "stripeCustomerId", plan, "updatedAt")
    VALUES ($1, $2, 'free', now())
    ON CONFLICT ("userId") DO UPDATE SET "stripeCustomerId" = EXCLUDED."stripeCustomerId", "updatedAt" = now()
    `,
    [userId, customerId]
  );
}

// The seller's Stripe customer, created on first checkout.
export async function ensureCustomer(db: Db, user: User, row: SubscriptionRow | null): Promise<string> {
  if (row?.stripeCustomerId) return row.stripeCustomerId;
  const customer = await getStripe().customers.create({
    email: user.email ?? undefined,
    metadata: { profitsyncUserId: user.id },
  });
  await saveCustomerId(db, user.id, customer.id);
  return customer.id;
}

// ------------------------------------------------------------
// Limits
// ------------------------------------------------------------

// Stores beyond the plan's limit (the most recently connected ones) are
// locked: kept, but not viewable or syncable until the seller upgrades.
// `storeIds` must be in the order they were connected (oldest first).
export function lockedStoreIds(storeIds: string[], limits: PlanLimits): Set<string> {
  if (limits.maxStores === null) return new Set();
  return new Set(storeIds.slice(limits.maxStores));
}

export async function connectedStoreIds(db: Db, userId: string): Promise<string[]> {
  const result = await db.query<{ ebayUserId: string }>(
    `SELECT "ebayUserId" FROM public."ebayConnection"
     WHERE "userId" = $1 AND environment = 'PRODUCTION' AND "ebayUserId" IS NOT NULL
     ORDER BY "createdAt" ASC, id ASC`,
    [userId]
  );
  return result.rows.map((row) => row.ebayUserId);
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Orders already saved, counted per calendar month (UTC), across all stores.
export async function ordersPerMonth(db: Db, userId: string): Promise<Map<string, number>> {
  const result = await db.query<{ month: string; count: string }>(
    `SELECT to_char(date_trunc('month', "orderDate" AT TIME ZONE 'UTC'), 'YYYY-MM') AS month, count(*) AS count
     FROM public."order" WHERE "userId" = $1 AND "orderDate" IS NOT NULL
     GROUP BY 1`,
    [userId]
  );
  return new Map(result.rows.map((row) => [row.month, Number(row.count)]));
}

export async function ordersThisMonth(db: Db, userId: string): Promise<number> {
  return (await ordersPerMonth(db, userId)).get(monthKey(new Date())) ?? 0;
}

// Which not-yet-imported orders the plan lets in: only within the plan's
// history window, and (on Free) only until the month's allowance is used up.
// Earlier orders in a month win, so what's already imported never changes.
export function allowedNewOrderIds<T extends { orderId: string; creationDate?: string }>(
  newOrders: T[],
  existingPerMonth: Map<string, number>,
  limits: PlanLimits,
  now = new Date()
): { allowed: Set<string>; overLimit: number } {
  const cutoff = now.getTime() - limits.historyDays * 24 * 60 * 60 * 1000;
  const counts = new Map(existingPerMonth);
  const allowed = new Set<string>();
  let overLimit = 0;
  const sorted = [...newOrders].sort(
    (a, b) => new Date(a.creationDate ?? 0).getTime() - new Date(b.creationDate ?? 0).getTime()
  );
  for (const order of sorted) {
    const created = new Date(order.creationDate ?? "");
    if (!Number.isFinite(created.getTime()) || created.getTime() < cutoff) continue;
    if (limits.monthlyOrders !== null) {
      const key = monthKey(created);
      const used = counts.get(key) ?? 0;
      if (used >= limits.monthlyOrders) {
        overLimit++;
        continue;
      }
      counts.set(key, used + 1);
    }
    allowed.add(order.orderId);
  }
  return { allowed, overLimit };
}

// Everything the dashboard needs to know about the seller's plan.
export async function billingStatus(db: Db, userId: string): Promise<BillingStatus> {
  const userPlan = await getUserPlan(db, userId);
  const [stores, monthOrders] = await Promise.all([
    connectedStoreIds(db, userId).then((ids) => ids.length),
    ordersThisMonth(db, userId),
  ]);
  const row = userPlan.row;
  return {
    enabled: userPlan.enabled,
    plan: userPlan.plan,
    interval: userPlan.plan === "free" ? null : row?.billingInterval ?? null,
    status: row?.status ?? null,
    currentPeriodEnd: row?.currentPeriodEnd ? new Date(row.currentPeriodEnd).toISOString() : null,
    cancelAtPeriodEnd: Boolean(row?.cancelAtPeriodEnd),
    comped: Boolean(row?.comped),
    limits: userPlan.limits,
    usage: { stores, ordersThisMonth: monthOrders },
  };
}

// The site's own address, for Stripe to send people back to.
export function siteOrigin(request: Request) {
  const main = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.VERCEL_ENV === "production" && main) return `https://${main}`;
  return new URL(request.url).origin;
}
