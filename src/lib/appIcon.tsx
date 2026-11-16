import { ImageResponse } from "next/og";

// The ProfitSync app icon (purple square, white rising arrow) at any size,
// for the phone home-screen icons in the app manifest. The arrow sits well
// inside the middle, so it also works as a "maskable" icon that phones
// crop into a circle or rounded square.
export function appIconResponse(size: number) {
  const arrow = Math.round(size * 0.56);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#5f5bf1" }}>
        <svg width={arrow} height={arrow} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 17l6-6 4 4 8-8" />
          <path d="M14 7h7v7" />
        </svg>
      </div>
    ),
    { width: size, height: size }
  );
}
