import { Fragment } from "react";
import { KeyHint } from "@/components/ui";
import type { ChartSectionId } from "@/lib/blackjack/bjaH17Chart";
import { sectionLegend } from "@/lib/blackjack/chartEntry";

/** Keys pressed together (`chord`, joined with "+") or one after another. */
const Keys = ({ keys, chord = false }: { keys: readonly string[]; chord?: boolean }) => (
  <span className="inline-flex items-center gap-1">{keys.map((key, index) => <Fragment key={`${key}-${index}`}>{chord && index > 0 && <span aria-hidden="true">+</span>}<KeyHint>{key}</KeyHint></Fragment>)}</span>
);

/**
 * The keys for the section being filled, derived from the entry grammar so
 * it cannot drift from what the cells accept. Keyboards only: touch screens
 * get the keypad, which shows the same answers on its keys.
 */
export function SectionKeys({ section }: { section: ChartSectionId }) {
  const legend = sectionLegend(section);
  return (
    <div className="mb-3 hidden rounded-xl bg-overlay/[.04] px-3 py-2 text-xs text-[var(--ink-muted)] [@media(pointer:fine)]:block">
      <p className="sr-only">Keys for this table:</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {legend.map((entry) => (
          <li key={entry.keys.join("+")} className="flex items-center gap-1.5">
            <Keys keys={entry.keys} chord={entry.combo} />
            <span><b className="font-data font-semibold text-[var(--ink)]">{entry.shows}</b> {entry.meaning}</span>
          </li>
        ))}
        <li className="flex items-center gap-1.5"><Keys keys={["4", "+"]} /><span><b className="font-data font-semibold text-[var(--ink)]">4+</b> true count +4 or higher</span></li>
        <li className="flex items-center gap-1.5"><Keys keys={["−", "1", "−"]} /><span><b className="font-data font-semibold text-[var(--ink)]">−1−</b> −1 or lower</span></li>
        <li className="flex items-center gap-1.5"><Keys keys={["Tab"]} /><span>or</span><Keys keys={["Enter"]} /><span>next</span></li>
        <li className="flex items-center gap-1.5"><Keys keys={["Esc"]} /><span>leave the chart</span></li>
      </ul>
    </div>
  );
}

const HOW_TO = [
  ["Pairs", "Y split · N don't split · Shift+Y → Y/N, split only with double after split"],
  ["Soft", "H hit · S stand · D double, otherwise hit · Shift+D → Ds, double, otherwise stand"],
  ["Hard", "H hit · S stand · D double, otherwise hit"],
  ["Surrender", "R → SUR surrender · N don't surrender"],
  ["Index plays, any table", "a number then + or −. 4+ means true count +4 or higher, −1− means −1 or lower. The chart's 0+ and 0− mean any positive or negative running count."],
  ["Moving", "Tab or Enter next · Shift+Tab back · arrow keys · Backspace on an empty cell goes back · typing over a cell replaces it · Esc leaves the chart · Ctrl+Enter grades"],
  ["On a phone", "use the keypad at the bottom of the screen."],
] as const;

/** The full entry grammar in plain words, for the setup's "How to enter answers". */
export function HowToEnter() {
  return (
    <dl className="grid gap-2 text-sm leading-6">
      {HOW_TO.map(([term, detail]) => (
        <div key={term} className="grid gap-x-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <dt className="font-semibold text-[var(--ink)]">{term}</dt>
          <dd className="text-[var(--ink-muted)]">{detail}</dd>
        </div>
      ))}
    </dl>
  );
}
