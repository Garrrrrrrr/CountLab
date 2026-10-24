import { pageMetadata } from "@/lib/metadata";
import { ProgressPage } from "@/features/progress/ProgressPage";

export const metadata = pageMetadata("/progress");

export default function Page() {
  return <ProgressPage />;
}
