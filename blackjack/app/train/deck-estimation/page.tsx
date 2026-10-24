import { pageMetadata } from "@/lib/metadata";
import { DeckEstimationDrill } from "@/features/train/deck-estimation/DeckEstimationDrill";

export const metadata = pageMetadata("/train/deck-estimation");

export default function Page() {
  return <DeckEstimationDrill />;
}
