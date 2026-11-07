// Categories for business expenses that aren't tied to one order.
export const EXPENSE_CATEGORIES = [
  "Packing supplies",
  "Shipping supplies",
  "eBay Store subscription",
  "Software & tools",
  "Sourcing & travel",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
