import { pageMetadata } from "@/lib/metadata";
import { ChangelogPage } from "@/features/changelog/ChangelogPage";

export const metadata = pageMetadata("/changelog");

export default function Page() {
  return <ChangelogPage />;
}
