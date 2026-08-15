/** The standard US casino chip denominations, in order. */
export const chipOptions = [0.5, 1, 5, 25, 100, 500, 1000] as const;

/**
 * Standard US casino chip colors, keyed by the denomination bracket the value
 * falls in (chips between the named denominations borrow the nearest
 * bracket's color, same as a casino would improvise for a non-standard unit).
 */
export function chipColorClasses(value: number): string {
  if (value < 1) return "border-sky-100 bg-gradient-to-br from-sky-300 to-sky-600 text-sky-950"; // 50c: light blue
  if (value < 5) return "border-zinc-300 bg-gradient-to-br from-white to-zinc-300 text-zinc-950"; // $1: white
  if (value < 25) return "border-red-100 bg-gradient-to-br from-red-500 to-red-800 text-white"; // $5: red
  if (value < 100) return "border-emerald-100 bg-gradient-to-br from-emerald-500 to-emerald-800 text-white"; // $25: green
  if (value < 500) return "border-zinc-500 bg-gradient-to-br from-zinc-700 to-black text-white"; // $100: black
  if (value < 1000) return "border-violet-200 bg-gradient-to-br from-violet-500 to-violet-800 text-white"; // $500: purple
  return "border-orange-200 bg-gradient-to-br from-orange-400 to-orange-700 text-white"; // $1000: orange
}

/** "$25" for whole-dollar chips, "50¢" for the sub-dollar chip. */
export function chipLabel(value: number): string {
  return value < 1 ? `${Math.round(value * 100)}¢` : `$${value}`;
}
