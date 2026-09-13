import type { Metadata } from "next";
import DynamicPage from "@/components/DynamicPage";
import { ROUTES, LEGACY_REDIRECTS, routeInfo, isPublicRoute } from "@/lib/routes";

export const dynamicParams = false;
export function generateStaticParams() { return ROUTES.map((slug) => ({ slug })); }
type Props = { params: Promise<{ slug?: string[] }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug = [] } = await params;
  const path = `/${slug.join("/")}`;
  const { title, description } = routeInfo(path);
  const canonical = LEGACY_REDIRECTS[slug.join("/")] ?? path;
  return { title, description, alternates: { canonical: `${canonical}${canonical === "/" ? "" : "/"}` }, robots: { index: isPublicRoute(path), follow: true }, openGraph: { title, description, url: canonical }, twitter: { title, description, card: "summary_large_image" } };
}
export default async function Page({ params }: Props) {
  const { slug = [] } = await params;
  return <DynamicPage route={slug.join("/")} />;
}
