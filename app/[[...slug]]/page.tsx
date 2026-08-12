import DynamicPage from "@/components/DynamicPage";

const routes = [
  [],
  ["dashboard"],
  ["analysis"],
  ["bankroll"],
  ["training", "running-count"],
  ["training", "basic-strategy"],
  ["training", "deviations"],
  ["training", "full-shoe"],
  ["reference"],
  ["reference", "basic-strategy"],
  ["reference", "deviations"],
  ["statistics"],
  ["settings"],
];

export const dynamicParams = false;

export function generateStaticParams() {
  return routes.map((slug) => ({ slug }));
}

export default function Page() {
  return <DynamicPage />;
}
