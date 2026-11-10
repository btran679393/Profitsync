import { ImageResponse } from "next/og";

// The preview picture shown when someone shares a ProfitSync link
// (Facebook, iMessage, X, Slack…). Also used as the X/Twitter card image.
export const alt = "ProfitSync: know your real eBay profit after fees, shipping and costs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STATS = [
  { label: "Revenue", value: "$8,450", color: "#ffffff" },
  { label: "Net profit", value: "$2,735", color: "#34d399" },
  { label: "Margin", value: "32.4%", color: "#ffffff" },
];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #071120 0%, #0d1730 60%, #1b1a4a 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "#5f5bf1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17l6-6 4 4 8-8" />
              <path d="M14 7h7v7" />
            </svg>
          </div>
          <div style={{ fontSize: 40, fontWeight: 700 }}>ProfitSync</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>Know what you really</div>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
            made on&nbsp;<span style={{ color: "#34d399" }}>eBay.</span>
          </div>
          <div style={{ marginTop: 24, fontSize: 30, color: "#b6c2d6" }}>
            Sales, fees, shipping, refunds and costs in one place. Free for one store.
          </div>
        </div>

        <div style={{ display: "flex", gap: 20 }}>
          {STATS.map((stat) => (
            <div
              key={stat.label}
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "18px 26px",
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                minWidth: 220,
              }}
            >
              <div style={{ fontSize: 22, color: "#94a3b8" }}>{stat.label}</div>
              <div style={{ fontSize: 40, fontWeight: 700, color: stat.color }}>{stat.value}</div>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "flex-end", marginLeft: "auto", fontSize: 22, color: "#7d8ba1" }}>Example numbers</div>
        </div>
      </div>
    ),
    size
  );
}
