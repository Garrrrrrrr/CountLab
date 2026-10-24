import { pageMetadata } from "@/lib/metadata";
import { FullShoe } from "@/features/train/full-shoe/FullShoe";

export const metadata = pageMetadata("/train/full-shoe");

export default function Page() {
  return <FullShoe />;
}
