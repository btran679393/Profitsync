// Made-up data for the public demo (/demo). Nothing here is real: a
// fictional collectibles store with about three months of sales.

import type { ApiListing, ApiOrder } from "@/app/dashboard/model";
import type { Expense } from "@/app/ExpensesSection";

export const DEMO_STORE_ID = "demo-store";
export const DEMO_STORE_NAME = "Demo Collectibles";

// Small deterministic random generator so the demo looks the same each visit.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const CATALOG: Array<{ itemId: string; title: string; price: number; cost: number; ship: number; stock: number }> = [
  { itemId: "394011", title: "Vintage Canon AE-1 35mm Film Camera with 50mm Lens", price: 189.99, cost: 72, ship: 14.5, stock: 2 },
  { itemId: "394012", title: "Pokémon TCG Scarlet & Violet Booster Box Sealed", price: 149.99, cost: 104, ship: 11.2, stock: 6 },
  { itemId: "394013", title: "Nike Air Jordan 1 Retro High OG Size 10", price: 214.0, cost: 128, ship: 16.4, stock: 1 },
  { itemId: "394014", title: "LEGO Star Wars Millennium Falcon 75257 Complete", price: 129.5, cost: 61, ship: 18.9, stock: 3 },
  { itemId: "394015", title: "1998 Upper Deck Basketball Card Lot (50 Cards)", price: 39.99, cost: 9, ship: 5.6, stock: 14 },
  { itemId: "394016", title: "Apple AirPods Pro 2nd Gen Open Box", price: 159.0, cost: 98, ship: 7.8, stock: 0 },
  { itemId: "394017", title: "Vintage Levi's 501 Jeans 32x30 Made in USA", price: 64.99, cost: 12, ship: 8.4, stock: 5 },
  { itemId: "394018", title: "Nintendo Switch OLED Console White Bundle", price: 289.99, cost: 205, ship: 19.75, stock: 2 },
  { itemId: "394019", title: "Funko Pop! Marvel Spider-Man #593 Vaulted", price: 34.99, cost: 11, ship: 6.1, stock: 9 },
  { itemId: "394020", title: "Patagonia Better Sweater Fleece Jacket Men's M", price: 74.0, cost: 22, ship: 9.25, stock: 4 },
  { itemId: "394021", title: "Magic: The Gathering Commander Deck Sealed", price: 44.99, cost: 27, ship: 6.9, stock: 0 },
  { itemId: "394022", title: "Sony WH-1000XM4 Headphones Black Refurbished", price: 179.0, cost: 110, ship: 10.4, stock: 1 },
];

const BUYERS = ["sneakerhead_88", "cardcollector22", "retro_finds", "kmart_dad", "pixelpanda", "vintage_lena", "jdm_tony", "bargainbetty", "lucky_lou", "mint_condition"];

function iso(daysAgo: number, hour: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, Math.floor((hour * 37) % 60), 0, 0);
  return d.toISOString();
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export function demoOrders(): ApiOrder[] {
  const rand = seeded(42);
  const orders: ApiOrder[] = [];
  let id = 1000;
  for (let daysAgo = 0; daysAgo < 95; daysAgo++) {
    // A bit busier recently, like a growing store.
    const count = rand() < (daysAgo < 30 ? 0.75 : 0.55) ? (rand() < 0.25 ? 2 : 1) : 0;
    for (let n = 0; n < count; n++) {
      const product = CATALOG[Math.floor(rand() * CATALOG.length)];
      const price = round(product.price * (0.9 + rand() * 0.15));
      const fees = round(price * 0.1325 + 0.4);
      const ad = rand() < 0.35 ? round(price * 0.04) : 0;
      id++;
      // Recent orders sometimes still need a cost; a couple were refunded.
      const needsCost = daysAgo < 6 && rand() < 0.5;
      const refunded = daysAgo > 10 && rand() < 0.04;
      orders.push({
        id,
        ebayUserId: DEMO_STORE_ID,
        ebayOrderId: `12-${10450 + id}-${(id * 7919) % 99999}`,
        ebayBuyerId: BUYERS[Math.floor(rand() * BUYERS.length)],
        ebayItemId: product.itemId,
        item: product.title,
        imageUrl: null,
        quantity: 1,
        salePrice: price,
        ebayFees: fees,
        otherFees: ad,
        shippingLabelCost: product.ship,
        shippingCost: null,
        productCost: needsCost ? null : product.cost,
        refundAmount: refunded ? price : 0,
        refundedAt: refunded ? iso(daysAgo - 3, 15) : null,
        refundOutcome: refunded ? "RETURNED" : null,
        refundShippingLoss: refunded ? product.ship : 0,
        refundFeeLoss: refunded ? 0.4 : 0,
        status: refunded ? "REFUNDED" : "PAID",
        orderDate: iso(daysAgo, 9 + Math.floor(rand() * 12)),
      });
    }
  }
  orders.sort((a, b) => String(b.orderDate).localeCompare(String(a.orderDate)));
  // One partial refund: $15 back for a scuff, and the buyer kept the item.
  const partial = orders.find(
    (o) => o.status === "PAID" && o.productCost !== null && Date.now() - Date.parse(String(o.orderDate)) > 20 * 86_400_000
  );
  if (partial) {
    partial.refundAmount = 15;
    partial.status = "PARTIALLY_REFUNDED";
    partial.refundedAt = new Date(Date.parse(String(partial.orderDate)) + 5 * 86_400_000).toISOString();
  }
  // One order the buyer cancelled before it shipped.
  const canceled = orders.find((o) => o.status === "PAID" && o !== partial && o.productCost !== null && Date.now() - Date.parse(String(o.orderDate)) > 8 * 86_400_000);
  if (canceled) {
    canceled.status = "CANCELED";
    canceled.refundAmount = canceled.salePrice;
    canceled.refundedAt = canceled.orderDate;
    canceled.productCost = null;
    canceled.shippingLabelCost = 0;
  }
  return orders;
}

export function demoListings(): ApiListing[] {
  return CATALOG.map((p, i) => ({
    ebayItemId: p.itemId,
    title: p.title,
    sku: `DC-${100 + i}`,
    imageUrl: null,
    listingPrice: p.price,
    quantity: p.stock,
    status: p.stock > 0 ? "ACTIVE" : "OUT_OF_STOCK",
    unitCost: p.cost,
    shippingCost: p.ship,
    createdAt: iso(120 - i * 3, 10),
  }));
}

export function demoExpenses(): Expense[] {
  const day = (daysAgo: number) => iso(daysAgo, 12).slice(0, 10);
  return [
    { id: 1, ebayUserId: null, spentOn: day(80), category: "eBay Store subscription", amount: "21.95", note: "Basic Store", repeatMonthly: true, endedOn: null },
    { id: 2, ebayUserId: DEMO_STORE_ID, spentOn: day(40), category: "Packing supplies", amount: "48.60", note: "200 poly mailers + tape", repeatMonthly: false, endedOn: null },
    { id: 3, ebayUserId: DEMO_STORE_ID, spentOn: day(12), category: "Sourcing & travel", amount: "35.00", note: "Weekend estate sale gas", repeatMonthly: false, endedOn: null },
    { id: 4, ebayUserId: null, spentOn: day(55), category: "Software & tools", amount: "9.99", note: "Photo editing app", repeatMonthly: true, endedOn: null },
  ];
}
