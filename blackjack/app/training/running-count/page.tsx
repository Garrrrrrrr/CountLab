import { legacyMetadata } from "@/lib/metadata";
import { LegacyRedirect } from "@/features/misc/LegacyRedirect";

export const metadata = legacyMetadata("/train/running-count");

export default function Page() {
  return <LegacyRedirect to="/train/running-count" />;
}
