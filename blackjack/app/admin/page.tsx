import { pageMetadata } from "@/lib/metadata";
import { AdminPage } from "@/features/admin/AdminPage";

export const metadata = pageMetadata("/admin");

export default function Page() {
  return <AdminPage />;
}
