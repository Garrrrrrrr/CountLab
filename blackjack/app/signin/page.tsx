import { pageMetadata } from "@/lib/metadata";
import { SignInPage } from "@/features/auth/SignInPage";

export const metadata = pageMetadata("/signin");

export default function Page() {
  return <SignInPage />;
}
