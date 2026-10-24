import { pageMetadata } from "@/lib/metadata";
import { RunningCountDrill } from "@/features/train/running-count/RunningCountDrill";

export const metadata = pageMetadata("/train/running-count");

export default function Page() {
  return <RunningCountDrill />;
}
