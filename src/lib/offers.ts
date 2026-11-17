// The lowest price a seller can accept (from an offer, a watcher deal or a
// price cut) and still make the profit they want from the sale.
//
//   price − eBay fees − ad fees − shipping − item cost = target profit
//
// eBay's fees and promoted-listing fees are a share of the sale price, so
//   price = (item cost + shipping + fixed fee + target) ÷ (1 − fee rate − ad rate)
//
// The fee and ad rates come from the listing's own past sales when it has
// any (they already include eBay's per-order fee), otherwise from eBay's
// standard rate for most categories.

export const STANDARD_FEE_RATE = 0.1325;
export const STANDARD_ORDER_FEE = 0.4;

export type OfferInputs = {
  itemCost: number | null;
  shipping: number;
  // Share of the sale price; null = use eBay's standard rate plus the per-order fee.
  feeRate: number | null;
  adRate: number;
  targetProfit: number;
};

export function lowestOfferPrice({ itemCost, shipping, feeRate, adRate, targetProfit }: OfferInputs): number | null {
  if (itemCost === null || !Number.isFinite(itemCost) || itemCost < 0) return null;
  const fees = feeRate ?? STANDARD_FEE_RATE;
  const fixed = feeRate === null ? STANDARD_ORDER_FEE : 0;
  const share = 1 - Math.max(0, fees) - Math.max(0, adRate);
  // Fees this high leave nothing sensible to work out.
  if (share < 0.2) return null;
  const price = (itemCost + Math.max(0, shipping) + fixed + Math.max(0, targetProfit)) / share;
  return Math.ceil(price * 100) / 100;
}

// A rate from past sales: total charged ÷ total sold, or null without sales.
export function observedRate(charged: number, sold: number): number | null {
  return sold > 0 && charged >= 0 ? charged / sold : null;
}
