import type { Metadata } from "next";
import DemoApp from "./DemoApp";

export const metadata: Metadata = {
  title: "Live demo",
  description: "Try ProfitSync with sample data: a demo eBay store with sales, fees, costs, expenses and a tax summary. No sign-up needed.",
  alternates: { canonical: "/demo" },
};

export default function DemoPage() {
  return <DemoApp />;
}
