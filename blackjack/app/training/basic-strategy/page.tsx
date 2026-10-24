import { legacyMetadata } from "@/lib/metadata";
import { LegacyRedirect } from "@/features/misc/LegacyRedirect";

export const metadata = legacyMetadata("/train/basic-strategy");

export default function Page() {
  return <LegacyRedirect to="/train/basic-strategy" />;
}
