"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button, Kbd, ProgressBar, Segmented, Toggle, cx } from "@/components/ui";
import { GRADING_CATEGORIES } from "@/lib/blackjack/fullShoeSession";
import type { LiveEvResult } from "@/lib/blackjack/liveEv";
import { ACTION_NAMES } from "@/lib/strategy";
import { RESOLUTION_PHRASE, ROUNDING_PHRASE } from "@/lib/full-shoe/grading";
import type { FullShoeGame, Speed } from "@/lib/full-shoe/session";
import { TrayButton } from "./Felt";
import { money, signed } from "./format";

const CATEGORY_LABEL: Record<string, string> = { Betting: "Betting", "Basic Strategy": "Basic strategy", Deviations: "Index plays", "Running count": "Running count", "True count": "True count" };

/** The coach: the count a perfect counter holds, the ramp's bet for it, the last note, and the score so far. */
export function CoachPanel({ game, ev, className }: { game: FullShoeGame; ev?: LiveEvResult; className?: string }) {
  const [reveal, setReveal] = useState(false);
  const { score } = game;
  const accuracy = score.total ? Math.round((score.correct / score.total) * 100) : 0;
  return (
    <div className={cx("space-y-4", className)}>
      <section>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">The count now</h3>
          <Button variant="ghost" size="sm" onClick={() => setReveal((value) => !value)} icon={reveal ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />} aria-pressed={reveal}>
            {reveal ? "Hide" : "Show"}
          </Button>
        </div>
        <dl className="mt-2 grid grid-cols-3 gap-2">
          {[["Running", signed(game.rc)], ["Decks left", String(game.divisor)], ["True", signed(game.tc)]].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-surface-2 px-2.5 py-2">
              <dt className="text-xs text-ink-3">{label}</dt>
              <dd className={cx("tnum mt-0.5 text-lg font-semibold", reveal ? "text-brand-text" : "select-none tracking-[0.2em] text-ink-3")}>{reveal ? value : "•••"}</dd>
            </div>
          ))}
        </dl>
        {reveal && (
          <div className="mt-2">
            <div className="flex justify-between text-xs text-ink-3"><span>{game.discarded} cards in the tray</span><span>cut card at {Math.round(game.setup.penetration * 100)}%</span></div>
            <ProgressBar value={game.discarded} max={game.totalCards * game.setup.penetration} label="How far the shoe is to the cut card" className="mt-1" />
          </div>
        )}
        <p className="mt-1.5 text-xs leading-5 text-ink-3">
          Decks left to {RESOLUTION_PHRASE[game.setup.resolution]}, true count {ROUNDING_PHRASE[game.setup.rounding]}.
          {reveal && game.phase === "betting" && <> The ramp bets <span className="font-semibold text-ink">{money(game.rampBet)}</span> a seat at this count.</>}
        </p>
      </section>

      {ev && (
        <section>
          <h3 className="text-sm font-semibold">EV of each play</h3>
          <ul className="mt-2 grid grid-cols-2 gap-2">
            {(Object.keys(ev.evs) as (keyof typeof ev.evs)[]).map((action) => (
              <li key={action} className={cx("rounded-xl px-2.5 py-2", action === ev.bestAction ? "bg-brand/15" : "bg-surface-2")}>
                <span className="text-xs text-ink-3">{ACTION_NAMES[action]}</span>
                <span className="tnum block font-semibold">{(ev.evs[action] ?? 0) >= 0 ? "+" : "−"}{Math.abs(ev.evs[action] ?? 0).toFixed(3)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs leading-5 text-ink-3">Per unit bet, from {ev.samples.toLocaleString()} deals of the cards left in this shoe. Hit and split assume basic strategy afterwards.</p>
        </section>
      )}

      {game.note && game.note.category !== "Running count" && game.note.category !== "True count" && (
        <section>
          <h3 className="text-sm font-semibold">Last decision</h3>
          <div className={cx("mt-2 rounded-xl border p-3 text-sm", game.note.ok ? "border-pos/25 bg-pos/[0.07]" : "border-neg/25 bg-neg/[0.07]")}>
            <p className="font-semibold">{game.note.title}</p>
            <p className="mt-0.5 leading-6 text-ink-2">{game.note.detail}</p>
            <p className="mt-1 text-xs leading-5 text-ink-3">Graded at a true count of {signed(game.note.tc)}: running count {signed(game.note.rc)} ÷ {game.note.decks} decks, {ROUNDING_PHRASE[game.setup.rounding]}.</p>
          </div>
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">This shoe</h3>
          <span className="tnum text-sm text-ink-2">{score.total ? `${accuracy}% · ${score.correct} of ${score.total}` : "No decisions yet"}</span>
        </div>
        <ul className="mt-2 space-y-2">
          {GRADING_CATEGORIES.map((category) => {
            const tally = score.categories[category];
            if (!tally.total) return null;
            return (
              <li key={category}>
                <div className="flex justify-between text-xs"><span className="text-ink-2">{CATEGORY_LABEL[category]}</span><span className="tnum text-ink-3">{tally.correct}/{tally.total}</span></div>
                <ProgressBar value={tally.correct} max={tally.total} label={`${CATEGORY_LABEL[category]} accuracy`} tone={tally.correct === tally.total ? "pos" : "brand"} className="mt-1" />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/** Desktop side column in a checkout: the tray, big, and nothing that gives answers away. */
export function CheckoutPanel({ game }: { game: FullShoeGame }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Checkout in progress</p>
        <p className="mt-1 text-sm leading-6 text-ink-2">Results stay hidden until the cut card. Betting, plays, index plays and every count check are graded in the report.</p>
      </div>
      <TrayButton photo={game.trayPhoto} width={180} />
      <p className="text-xs text-ink-3">Round {game.roundNumber} · cut card at {Math.round(game.setup.penetration * 100)}%</p>
    </div>
  );
}

export function TableOptions({ speed, sound, animations, coached, onSpeed, onSound, onAnimations, onEnd }: {
  speed: Speed; sound: boolean; animations: boolean; coached: boolean;
  onSpeed: (speed: Speed) => void; onSound: (on: boolean) => void; onAnimations: (on: boolean) => void; onEnd: () => void;
}) {
  return (
    <div className="space-y-5">
      <Segmented<Speed> label="Dealing speed" value={speed} onChange={onSpeed} options={[{ value: "relaxed", label: "Relaxed" }, { value: "casino", label: "Casino" }, { value: "fast", label: "Fast" }]} />
      <div className="space-y-3">
        <Toggle label="Sounds" checked={sound} onChange={onSound} />
        <Toggle label="Card animations" checked={animations} onChange={onAnimations} />
      </div>
      <div className="hidden [@media(hover:hover)]:block">
        <h3 className="text-sm font-semibold">Keyboard</h3>
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-ink-2">
          <li><Kbd>1</Kbd>–<Kbd>7</Kbd> chips</li>
          <li><Kbd>↵</Kbd> deal</li>
          <li><Kbd>U</Kbd> undo · <Kbd>B</Kbd> repeat bet</li>
          <li><Kbd>←</Kbd> <Kbd>→</Kbd> seat</li>
          <li><Kbd>H</Kbd> <Kbd>S</Kbd> <Kbd>D</Kbd> <Kbd>P</Kbd> <Kbd>R</Kbd> play</li>
          <li><Kbd>I</Kbd> insure · <Kbd>N</Kbd> no · <Kbd>E</Kbd> even money</li>
          <li><Kbd>T</Kbd> discard tray</li>
          {coached && <li><Kbd>C</Kbd> coach · <Kbd>V</Kbd> EV</li>}
        </ul>
      </div>
      <Button variant="danger" block onClick={onEnd}>End the shoe now</Button>
    </div>
  );
}
