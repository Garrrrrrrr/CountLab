import { pageMetadata } from "@/lib/metadata";
import { IndexPlaysDrill } from "@/features/train/deviations/IndexPlaysDrill";

export const metadata = pageMetadata("/train/deviations");

export default function Page() {
  return <IndexPlaysDrill />;
}
