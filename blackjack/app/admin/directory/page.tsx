import { legacyMetadata } from "@/lib/metadata";
import { LegacyRedirect } from "@/features/misc/LegacyRedirect";

export const metadata = legacyMetadata("/admin");

export default function Page() {
  return <LegacyRedirect to="/admin" />;
}
