// Small helpers for eBay's XML "Trading" API (used for listings and the
// seller's store name, which the newer REST APIs don't return).

export const TRADING_API = "https://api.ebay.com/ws/api.dll";

export function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Text of the first <name>…</name> element (exact tag name only).
export function tag(xml: string, name: string): string | null {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return match ? decodeXml(match[1]).trim() : null;
}

// Call a Trading API operation with the seller's OAuth access token.
// Returns the response XML and whether eBay reported success.
export async function tradingCall(callName: string, accessToken: string, innerXml: string) {
  const response = await fetch(TRADING_API, {
    method: "POST",
    headers: {
      "X-EBAY-API-CALL-NAME": callName,
      "X-EBAY-API-SITEID": "0",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1225",
      "X-EBAY-API-IAF-TOKEN": accessToken,
      "Content-Type": "text/xml",
    },
    body: `<?xml version="1.0" encoding="utf-8"?>
<${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>Low</WarningLevel>
  ${innerXml}
</${callName}Request>`,
    cache: "no-store",
  });
  const xml = await response.text();
  const ack = tag(xml, "Ack");
  return { ok: response.ok && (ack === "Success" || ack === "Warning"), status: response.status, xml };
}
