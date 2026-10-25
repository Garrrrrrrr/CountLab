import { pageMetadata } from "@/lib/metadata";
import { BetRampDrill } from "@/features/train/bet-ramp/BetRampDrill";

export const metadata = pageMetadata("/train/bet-ramp");

export default function Page() {
  return <BetRampDrill />;
}
