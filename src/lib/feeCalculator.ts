// eBay US selling fees, for the public fee calculator page.
// Source: eBay's "Selling fees" help page (ebay.com/help ... id=4822), read
// November 2026. eBay changes these now and then: update FEES_CHECKED and the
// rates below together.

export const FEES_CHECKED = "November 2026";

// A rate on the part of the sale inside each band ("13.6% up to $7,500,
// 2.35% on the rest").
type Tiered = { kind: "tiered"; bands: Array<{ upTo: number | null; percent: number }> };
// One rate for the whole sale, picked by its total ("15% if $2,000 or less,
// 9% if over").
type Whole = { kind: "whole"; levels: Array<{ upTo: number | null; percent: number }> };

export type FeeCategory = {
  id: string;
  name: string;
  rule: Tiered | Whole;
  // e.g. "13.6% up to $7,500, then 2.35%": shown in the rates table.
  summary: string;
  // Athletic shoes of $150+: lower rate and no per-order fee.
  sneakers?: boolean;
};

const most: Tiered = { kind: "tiered", bands: [{ upTo: 7500, percent: 13.6 }, { upTo: null, percent: 2.35 }] };

export const FEE_CATEGORIES: FeeCategory[] = [
  { id: "most", name: "Most categories", rule: most, summary: "13.6% up to $7,500, then 2.35%" },
  {
    id: "media",
    name: "Books, movies & TV, music (not vinyl)",
    rule: { kind: "tiered", bands: [{ upTo: 7500, percent: 15.3 }, { upTo: null, percent: 2.35 }] },
    summary: "15.3% up to $7,500, then 2.35%",
  },
  {
    id: "cards",
    name: "Trading cards, card games & comics",
    rule: { kind: "tiered", bands: [{ upTo: 7500, percent: 13.25 }, { upTo: null, percent: 2.35 }] },
    summary: "13.25% up to $7,500, then 2.35%",
  },
  {
    id: "coins",
    name: "Coins & paper money (not bullion)",
    rule: { kind: "tiered", bands: [{ upTo: 7500, percent: 13.25 }, { upTo: null, percent: 2.35 }] },
    summary: "13.25% up to $7,500, then 2.35%",
  },
  {
    id: "bullion",
    name: "Bullion",
    rule: { kind: "whole", levels: [{ upTo: 7500, percent: 13.6 }, { upTo: null, percent: 7 }] },
    summary: "13.6% if $7,500 or less, 7% if more",
  },
  {
    id: "sneakers",
    name: "Athletic shoes (sneakers)",
    rule: most,
    summary: "8% and no per-order fee at $150 or more; 13.6% under $150",
    sneakers: true,
  },
  {
    id: "handbags",
    name: "Women's bags & handbags",
    rule: { kind: "whole", levels: [{ upTo: 2000, percent: 15 }, { upTo: null, percent: 9 }] },
    summary: "15% if $2,000 or less, 9% if more",
  },
  {
    id: "jewelry",
    name: "Jewelry (not watches)",
    rule: { kind: "whole", levels: [{ upTo: 5000, percent: 15 }, { upTo: null, percent: 9 }] },
    summary: "15% if $5,000 or less, 9% if more",
  },
  {
    id: "watches",
    name: "Watches, parts & accessories",
    rule: {
      kind: "tiered",
      bands: [
        { upTo: 1000, percent: 15 },
        { upTo: 7500, percent: 6.5 },
        { upTo: null, percent: 3 },
      ],
    },
    summary: "15% up to $1,000, 6.5% up to $7,500, then 3%",
  },
  {
    id: "guitars",
    name: "Guitars & basses",
    rule: { kind: "tiered", bands: [{ upTo: 7500, percent: 6.7 }, { upTo: null, percent: 2.35 }] },
    summary: "6.7% up to $7,500, then 2.35%",
  },
];

export const INTERNATIONAL_FEE_PERCENT = 1.65;

export type FeeInput = {
  categoryId: string;
  // What the buyer pays for the item and for shipping.
  itemPrice: number;
  shippingCharged: number;
  // The buyer's sales tax rate (%). eBay charges its fee on the tax too.
  salesTaxPercent: number;
  // What the seller pays.
  itemCost: number;
  shippingLabel: number;
  // Promoted Listings (General) ad rate (%), 0 = not promoted.
  adRatePercent: number;
  // Shipped abroad without eBay International Shipping.
  international: boolean;
};

export type FeeResult = {
  salesTax: number;
  // Item + shipping + tax: what eBay's fees are worked out on.
  totalSale: number;
  finalValueFee: number;
  perOrderFee: number;
  adFee: number;
  internationalFee: number;
  totalFees: number;
  // Item + shipping the buyer paid (the tax goes to the state, not you).
  youReceive: number;
  profit: number;
  // Profit as a share of item + shipping charged; null when nothing was charged.
  marginPercent: number | null;
  // Profit compared with what the item cost you; null when the cost is 0.
  roiPercent: number | null;
};

const cents = (value: number) => Math.round(value * 100) / 100;
const clean = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);

export function feeCategory(id: string): FeeCategory {
  return FEE_CATEGORIES.find((category) => category.id === id) ?? FEE_CATEGORIES[0];
}

// The final value fee on a total, before any per-order fee.
export function finalValueFee(category: FeeCategory, total: number): number {
  if (category.sneakers && total >= 150) return total * 0.08;
  const rule = category.rule;
  if (rule.kind === "whole") {
    const level = rule.levels.find((l) => l.upTo === null || total <= l.upTo) ?? rule.levels[rule.levels.length - 1];
    return (total * level.percent) / 100;
  }
  let fee = 0;
  let from = 0;
  for (const band of rule.bands) {
    const to = band.upTo ?? Infinity;
    if (total > from) fee += ((Math.min(total, to) - from) * band.percent) / 100;
    from = to;
  }
  return fee;
}

export function calculateFees(input: FeeInput): FeeResult {
  const category = feeCategory(input.categoryId);
  const itemPrice = clean(input.itemPrice);
  const shippingCharged = clean(input.shippingCharged);
  const taxPercent = Math.min(clean(input.salesTaxPercent), 25);
  const adPercent = Math.min(clean(input.adRatePercent), 100);

  const charged = itemPrice + shippingCharged;
  const salesTax = (charged * taxPercent) / 100;
  const totalSale = charged + salesTax;

  const fvf = charged > 0 ? finalValueFee(category, totalSale) : 0;
  const sneakerDeal = Boolean(category.sneakers && totalSale >= 150);
  const perOrderFee = charged <= 0 || sneakerDeal ? 0 : totalSale <= 10 ? 0.3 : 0.4;
  const adFee = (totalSale * adPercent) / 100;
  const internationalFee = input.international ? (totalSale * INTERNATIONAL_FEE_PERCENT) / 100 : 0;
  const totalFees = fvf + perOrderFee + adFee + internationalFee;

  const profit = charged - totalFees - clean(input.shippingLabel) - clean(input.itemCost);
  const itemCost = clean(input.itemCost);
  return {
    salesTax: cents(salesTax),
    totalSale: cents(totalSale),
    finalValueFee: cents(fvf),
    perOrderFee: cents(perOrderFee),
    adFee: cents(adFee),
    internationalFee: cents(internationalFee),
    totalFees: cents(totalFees),
    youReceive: cents(charged),
    profit: cents(profit),
    marginPercent: charged > 0 ? Math.round((profit / charged) * 1000) / 10 : null,
    roiPercent: itemCost > 0 ? Math.round((profit / itemCost) * 1000) / 10 : null,
  };
}
