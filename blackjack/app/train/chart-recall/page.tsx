import { pageMetadata } from "@/lib/metadata";
import { ChartRecallDrill } from "@/features/train/chart-recall/ChartRecallDrill";

export const metadata = pageMetadata("/train/chart-recall");

export default function Page() {
  return <ChartRecallDrill />;
}
