import { legacyMetadata } from "@/lib/metadata";
import { LegacyRedirect } from "@/features/misc/LegacyRedirect";

export const metadata = legacyMetadata("/charts");

export default function Page() {
  return <LegacyRedirect to="/charts" />;
}
