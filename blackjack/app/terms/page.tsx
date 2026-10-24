import { pageMetadata } from "@/lib/metadata";
import { TermsPage } from "@/features/legal/TermsPage";

export const metadata = pageMetadata("/terms");

export default function Page() {
  return <TermsPage />;
}
