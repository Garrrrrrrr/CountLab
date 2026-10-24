import { pageMetadata } from "@/lib/metadata";
import { PrivacyPage } from "@/features/legal/PrivacyPage";

export const metadata = pageMetadata("/privacy");

export default function Page() {
  return <PrivacyPage />;
}
