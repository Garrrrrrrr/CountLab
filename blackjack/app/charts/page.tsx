import { pageMetadata } from "@/lib/metadata";
import { ChartsPage } from "@/features/charts/ChartsPage";

export const metadata = pageMetadata("/charts");

export default function Page() {
  return <ChartsPage />;
}
