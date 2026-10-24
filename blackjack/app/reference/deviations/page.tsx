import { legacyMetadata } from "@/lib/metadata";
import { LegacyRedirect } from "@/features/misc/LegacyRedirect";

export const metadata = legacyMetadata("/charts/indices");

export default function Page() {
  return <LegacyRedirect to="/charts/indices" />;
}
