import type { IconName } from "../dashboard/Icon";
import type { View } from "../dashboard/model";

// The sidebar is built from this list, so adding a page (or a marketplace-
// specific section later) is one entry here, not new sidebar markup.
export type NavItem = { id: View; label: string; icon: IconName };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  { label: "Overview", items: [{ id: "dashboard", label: "Dashboard", icon: "dashboard" }] },
  {
    label: "Sales",
    items: [
      { id: "orders", label: "Orders", icon: "orders" },
      { id: "listings", label: "Listings", icon: "box" },
    ],
  },
  {
    label: "Money",
    items: [
      { id: "expenses", label: "Expenses", icon: "wallet" },
      { id: "taxes", label: "Taxes", icon: "receipt" },
    ],
  },
];

// Pinned to the bottom of the sidebar.
export const ACCOUNT_ITEMS: NavItem[] = [
  { id: "billing", label: "Plan & billing", icon: "sparkle" },
  { id: "settings", label: "Settings", icon: "gear" },
  { id: "help", label: "Help & guide", icon: "info" },
];

// Marketplaces ProfitSync can connect. Only eBay is live today; the others
// are here so the channel switcher and sync status can show them later.
export type Marketplace = { id: "ebay" | "shopify" | "amazon" | "etsy"; name: string; color: string; live: boolean };

export const MARKETPLACES: Record<Marketplace["id"], Marketplace> = {
  ebay: { id: "ebay", name: "eBay", color: "#3665f3", live: true },
  shopify: { id: "shopify", name: "Shopify", color: "#5e8e3e", live: false },
  amazon: { id: "amazon", name: "Amazon", color: "#ff9900", live: false },
  etsy: { id: "etsy", name: "Etsy", color: "#f1641e", live: false },
};
