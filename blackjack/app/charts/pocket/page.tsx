import { pageMetadata } from "@/lib/metadata";
import { PocketChartPage } from "@/features/charts/PocketChart";

export const metadata = pageMetadata("/charts/pocket");

export default function Page() {
  return <PocketChartPage />;
}
