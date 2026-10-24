import { pageMetadata } from "@/lib/metadata";
import { Journal } from "@/features/journal/Journal";

export const metadata = pageMetadata("/journal");

export default function Page() {
  return <Journal />;
}
