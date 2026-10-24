import { pageMetadata } from "@/lib/metadata";
import { TrainHub } from "@/features/train/TrainHub";

export const metadata = pageMetadata("/train");

export default function Page() {
  return <TrainHub />;
}
