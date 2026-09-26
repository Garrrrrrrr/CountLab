"use client";

import { H17ChartView } from "@/components/reference/H17ChartView";
import { RulesChartView } from "@/components/reference/RulesChartView";

/**
 * The reference charts. /reference and /reference/deviations are one page
 * (basic strategy, or with index plays) whose view switch keeps the address
 * in step; /reference/h17-chart is the printed H17 chart.
 */
export default function StrategyChartPage({ initialTab = "strategy" }: { initialTab?: "strategy" | "deviations" | "h17" }) {
  if (initialTab === "h17") return <H17ChartView />;
  return <RulesChartView initialView={initialTab === "deviations" ? "index" : "basic"} />;
}
