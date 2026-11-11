import { PLANS } from "@/lib/billing/plans";
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from "@/lib/site";

// Extra details for Google (app name, prices, FAQ) so search results can
// show them. Invisible on the page.
function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export function AppStructuredData() {
  const url = siteUrl();
  const offers = (["free", "pro", "ultimate"] as const).flatMap((id) => {
    const plan = PLANS[id];
    if (id === "free") return [{ "@type": "Offer", name: plan.name, price: "0", priceCurrency: "USD" }];
    return [
      { "@type": "Offer", name: `${plan.name} (monthly)`, price: (plan.monthlyCents / 100).toFixed(2), priceCurrency: "USD" },
      { "@type": "Offer", name: `${plan.name} (yearly)`, price: (plan.yearlyCents / 100).toFixed(2), priceCurrency: "USD" },
    ];
  });
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        url,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        offers,
      }}
    />
  );
}

export function FaqStructuredData({ items }: { items: Array<[string, string]> }) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.map(([question, answer]) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      }}
    />
  );
}
