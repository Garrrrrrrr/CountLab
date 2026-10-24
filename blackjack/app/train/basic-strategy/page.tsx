import { pageMetadata } from "@/lib/metadata";
import { BasicStrategyDrill } from "@/features/train/basic-strategy/BasicStrategyDrill";

export const metadata = pageMetadata("/train/basic-strategy");

export default function Page() {
  return <BasicStrategyDrill />;
}
