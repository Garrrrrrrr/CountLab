import { legacyMetadata } from "@/lib/metadata";
import { LegacyRedirect } from "@/features/misc/LegacyRedirect";

export const metadata = legacyMetadata("/train/true-count");

export default function Page() {
  return <LegacyRedirect to="/train/true-count" />;
}
