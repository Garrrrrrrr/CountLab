/** Pure geometry for rail affordances; tolerates fractional browser offsets. */
export interface RailMetrics { scrollLeft: number; scrollWidth: number; clientWidth: number; columnWidth: number }
export interface RailState { scrollable: boolean; atStart: boolean; atEnd: boolean; hiddenRight: number }
const EPSILON = 1;
export function railState({ scrollLeft, scrollWidth, clientWidth, columnWidth }: RailMetrics): RailState {
  const maxScroll = Math.max(0, scrollWidth - clientWidth);
  const clamped = Math.min(Math.max(scrollLeft, 0), maxScroll);
  const remaining = maxScroll - clamped;
  return { scrollable: maxScroll > EPSILON, atStart: clamped <= EPSILON, atEnd: remaining <= EPSILON, hiddenRight: columnWidth > 0 ? Math.ceil(remaining / columnWidth) : 0 };
}
