// Listing traffic from eBay's Analytics API: how often each listing showed
// up (impressions), was opened (views) and sold (transactions) over the last
// 30 days. Needs the read-only analytics permission, which sellers who
// connected before it was added grant by reconnecting their store.

export const ANALYTICS_SCOPE = "https://api.ebay.com/oauth/api_scope/sell.analytics.readonly";

const TRAFFIC_API = "https://api.ebay.com/sell/analytics/v1/traffic_report";
// eBay accepts at most 200 listing IDs per report.
const IDS_PER_REPORT = 200;
export const TRAFFIC_DAYS = 30;

export type ListingTraffic = {
  impressions: number;
  views: number;
  sales: number;
};

type TrafficReport = {
  header?: { metrics?: Array<{ key?: string }> };
  records?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: unknown; applicable?: boolean }>;
  }>;
};

// eBay's report gives each listing's numbers in the order of the header's
// metrics. Only the three counts are kept; rates are worked out from them.
export function parseTrafficReport(report: TrafficReport): Map<string, ListingTraffic> {
  const keys = (report.header?.metrics ?? []).map((metric) => metric.key ?? "");
  const at = (name: string) => keys.indexOf(name);
  const result = new Map<string, ListingTraffic>();
  for (const record of report.records ?? []) {
    const listingId = record.dimensionValues?.[0]?.value;
    if (!listingId) continue;
    const value = (name: string) => {
      const index = at(name);
      const n = Number(index >= 0 ? record.metricValues?.[index]?.value : 0);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
    };
    result.set(listingId, {
      impressions: value("LISTING_IMPRESSION_TOTAL"),
      views: value("LISTING_VIEWS_TOTAL"),
      sales: value("TRANSACTION"),
    });
  }
  return result;
}

// "20261016..20261115": the last 30 full days in eBay's default time zone
// (Los Angeles), ending yesterday so the numbers are complete.
export function trafficDateRange(now: Date): string {
  const la = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const end = new Date(la.getFullYear(), la.getMonth(), la.getDate() - 1);
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (TRAFFIC_DAYS - 1));
  const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `${ymd(start)}..${ymd(end)}`;
}

export class TrafficPermissionError extends Error {}

// Traffic for the given listings. Throws TrafficPermissionError when the
// store hasn't granted the analytics permission yet.
export async function fetchListingTraffic(
  accessToken: string,
  itemIds: string[],
  now = new Date()
): Promise<Map<string, ListingTraffic>> {
  const all = new Map<string, ListingTraffic>();
  const range = trafficDateRange(now);
  for (let i = 0; i < itemIds.length; i += IDS_PER_REPORT) {
    const batch = itemIds.slice(i, i + IDS_PER_REPORT);
    const params = new URLSearchParams({
      dimension: "LISTING",
      filter: `marketplace_ids:{EBAY_US},date_range:[${range}],listing_ids:{${batch.join("|")}}`,
      metric: "LISTING_IMPRESSION_TOTAL,LISTING_VIEWS_TOTAL,TRANSACTION",
    });
    const response = await fetch(`${TRAFFIC_API}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) {
      throw new TrafficPermissionError("eBay traffic needs the analytics permission.");
    }
    if (!response.ok) {
      console.error("eBay traffic report failed:", response.status, (await response.text()).slice(0, 500));
      throw new Error(`eBay traffic report failed (HTTP ${response.status}).`);
    }
    for (const [id, traffic] of parseTrafficReport((await response.json()) as TrafficReport)) all.set(id, traffic);
  }
  return all;
}
