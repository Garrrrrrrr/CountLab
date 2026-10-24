import { pageMetadata } from "@/lib/metadata";
import { HomePage } from "@/features/home/HomePage";

export const metadata = pageMetadata("/");

export default function Page() {
  return <HomePage />;
}
