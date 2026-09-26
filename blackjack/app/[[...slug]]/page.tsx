import type { Metadata } from "next";
import DynamicPage from "@/components/DynamicPage";
import { ROUTES, LEGACY_REDIRECTS, routeInfo, isPublicRoute, ROUTE_DESCRIPTIONS } from "@/lib/routes";

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

/** Describes the site to search engines; only the home page carries it. */
const STRUCTURED_DATA = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "CountLab",
  url: "https://countlab.ca/",
  description: ROUTE_DESCRIPTIONS["/"],
  applicationCategory: "EducationalApplication",
  operatingSystem: "Any",
  browserRequirements: "Requires JavaScript",
  offers: { "@type": "Offer", price: "0", priceCurrency: "CAD" },
});

export default async function Page({ params }: Props) {
  const { slug = [] } = await params;
  return <>
    {slug.length === 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: STRUCTURED_DATA }} />}
    <DynamicPage route={slug.join("/")} />
  </>;
}
