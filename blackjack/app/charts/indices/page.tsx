import { pageMetadata } from "@/lib/metadata";
import { IndexListPage } from "@/features/charts/IndexListPage";

export const metadata = pageMetadata("/charts/indices");

export default function Page() {
  return <IndexListPage />;
}
