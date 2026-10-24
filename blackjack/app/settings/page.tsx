import { pageMetadata } from "@/lib/metadata";
import { SettingsPage } from "@/features/settings/SettingsPage";

export const metadata = pageMetadata("/settings");

export default function Page() {
  return <SettingsPage />;
}
