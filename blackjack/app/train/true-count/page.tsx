import { pageMetadata } from "@/lib/metadata";
import { TrueCountDrill } from "@/features/train/true-count/TrueCountDrill";

export const metadata = pageMetadata("/train/true-count");

export default function Page() {
  return <TrueCountDrill />;
}
