import DynamicPage from "@/components/DynamicPage";

const routes = [
  [],
  ["dashboard"],
  ["analysis"],
  ["bankroll"],
  ["chase-flush"],
  ["training", "running-count"],
  ["training", "true-count"],
  ["training", "basic-strategy"],
  ["training", "deviations"],
  ["training", "full-shoe"],
  ["training", "missing-card"],
  ["training", "deck-estimation"],
  ["training", "benchmark"],
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
