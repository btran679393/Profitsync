// ProfitSync plans: what each one includes and what it costs.
// Shared by the server (limits) and the pages (pricing cards), so keep it
// free of secrets and server-only imports.

export type PlanId = "free" | "pro" | "ultimate";
export type BillingInterval = "month" | "year";
export type PaidPlanId = Exclude<PlanId, "free">;

export type PlanLimits = {
  // How many eBay stores can be connected (null = no limit).
  maxStores: number | null;
  // New orders imported per calendar month (null = no limit).
  monthlyOrders: number | null;
  // How far back order history goes, in days.
  historyDays: number;
  // Tax report, CSV download and shipping-cost import.
  exports: boolean;
  // Orders sync by themselves when the dashboard opens.
  autoSync: boolean;
  // Combined "All stores" view.
  allStoresView: boolean;
};

export type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  limits: PlanLimits;
  // Prices in cents.
  monthlyCents: number;
  yearlyCents: number;
  features: string[];
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Try ProfitSync with one store",
    monthlyCents: 0,
    yearlyCents: 0,
    limits: {
      maxStores: 1,
      monthlyOrders: 50,
      historyDays: 90,
      exports: false,
      autoSync: false,
      allStoresView: false,
    },
    features: [
      "1 eBay store",
      "Up to 50 orders a month",
      "Last 90 days of order history",
      "Profit, fees and listings dashboards",
      "Expenses and a monthly goal",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "For growing sellers",
    monthlyCents: 999,
    yearlyCents: 10499,
    limits: {
      maxStores: 3,
      monthlyOrders: null,
      historyDays: 365,
      exports: true,
      autoSync: true,
      allStoresView: true,
    },
    features: [
      "Up to 3 eBay stores",
      "Unlimited orders",
      "A full year of order history",
      "Tax report you can print or save as PDF",
      "CSV download and shipping-cost import",
      "Automatic sync and the All stores view",
    ],
  },
  ultimate: {
    id: "ultimate",
    name: "Ultimate",
    tagline: "For power sellers with many stores",
    monthlyCents: 1999,
    yearlyCents: 20999,
    limits: {
      maxStores: null,
      monthlyOrders: null,
      historyDays: 365,
      exports: true,
      autoSync: true,
      allStoresView: true,
    },
    features: [
      "Unlimited eBay stores",
      "Everything in Pro",
      "Priority email support",
    ],
  },
};

export const PAID_PLANS: PaidPlanId[] = ["pro", "ultimate"];

export function isPaidPlan(value: unknown): value is PaidPlanId {
  return value === "pro" || value === "ultimate";
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === "month" || value === "year";
}

// Stripe price lookup keys, e.g. "profitsync_pro_year".
export function priceLookupKey(plan: PaidPlanId, interval: BillingInterval) {
  return `profitsync_${plan}_${interval}`;
}

export function priceCents(plan: PaidPlanId, interval: BillingInterval) {
  return interval === "year" ? PLANS[plan].yearlyCents : PLANS[plan].monthlyCents;
}

// How much the yearly price saves compared with paying monthly for a year.
export function yearlySavingsCents(plan: PaidPlanId) {
  return PLANS[plan].monthlyCents * 12 - PLANS[plan].yearlyCents;
}

// Unlimited everything: used when billing isn't switched on yet, so the app
// works exactly as before until Stripe is set up.
export const UNLIMITED_LIMITS: PlanLimits = PLANS.ultimate.limits;

// What the dashboard gets from GET /api/billing.
export type BillingStatus = {
  // False until Stripe keys and the billing table are in place.
  enabled: boolean;
  plan: PlanId;
  interval: BillingInterval | null;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  comped: boolean;
  limits: PlanLimits;
  usage: {
    stores: number;
    ordersThisMonth: number;
  };
};
