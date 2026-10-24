import { pageMetadata } from "@/lib/metadata";
import { Calculator } from "@/features/calculator/Calculator";

export const metadata = pageMetadata("/calculator");

export default function Page() {
  return <Calculator />;
}
