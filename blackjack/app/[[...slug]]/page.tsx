import DynamicPage from "@/components/DynamicPage";
import { ROUTES } from "@/lib/routes";

export const dynamicParams = false;

export function generateStaticParams() {
  return ROUTES.map((slug) => ({ slug }));
}

export default function Page() {
  return <DynamicPage />;
}
