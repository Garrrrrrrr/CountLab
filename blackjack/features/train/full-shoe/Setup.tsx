"use client";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Archive, Trash2 } from "lucide-react";
import { Badge, Callout, Card, ConfirmSheet, IconButton, Segmented, SelectField, TextField, Toggle, cx } from "@/components/ui";
import { DrillSetup, PresetPicker, SetupGroup } from "@/components/drill/DrillKit";
import { BET_SPREAD_PRESETS, POSITIVE_TRUE_COUNTS, type BetSpreadPreset } from "@/lib/blackjack/fullShoeSession";
import { shoeLibrary, type SavedShoe } from "@/lib/blackjack/shoeLibrary";
import { RESOLUTION_PHRASE, ROUNDING_PHRASE, type CountCheckFrequency } from "@/lib/full-shoe/grading";
import type { FullShoeSetup, Speed } from "@/lib/full-shoe/session";
import { DECK_OPTIONS, SURRENDER_SHORT, type TableRules } from "@/lib/strategy";
import { track } from "@/lib/analytics/track";
import { COUNT_CHECK_OPTIONS, PENETRATIONS, penetrationLabel, rampDollars, SPREAD_LABEL } from "./tableSetup";
import { money } from "./format";

const SURRENDER_OPTIONS = [
  { value: "none", label: "None" },
  { value: "late", label: "Late" },
  { value: "early", label: SURRENDER_SHORT.early, hint: "Early surrender against a ten, late against everything else" },
] as const;

/** A dollar input that keeps what is being typed and commits only valid amounts. */
function MoneyField({ label, value, onChange, min = 0.5, hint }: { label: string; value: number; onChange: (value: number) => void; min?: number; hint?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);
  const invalid = draft !== null && !(Number(draft) >= min);
  return (
    <TextField
      label={label}
      hint={hint}
      error={invalid ? `At least ${money(min)}` : undefined}
      prefix="$"
      inputMode="decimal"
      type="text"
      value={shown}
      onChange={(event) => {
        const text = event.target.value.replace(/[^0-9.]/g, "");
        setDraft(text);
        const next = Number(text);
        if (text !== "" && Number.isFinite(next) && next >= min) onChange(Math.round(next * 100) / 100);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

const savedLabel = (shoe: SavedShoe) =>
  `${new Date(shoe.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${shoe.report.accuracy}% · ${shoe.report.handsPlayed} hands`;
export const savedRules = (shoe: SavedShoe) =>
  `${shoe.table.decks}D ${shoe.table.dealerHitsSoft17 ? "H17" : "S17"} · ${SURRENDER_SHORT[shoe.table.surrenderRule]} · ${shoe.table.stacked ? "hot shoe" : "random shoe"}`;

function SavedShoes({ onReview }: { onReview: (shoe: SavedShoe) => void }) {
  const [shoes, setShoes] = useState<SavedShoe[]>([]);
  const [pending, setPending] = useState<SavedShoe>();
  useEffect(() => {
    const load = () => setShoes(shoeLibrary.shoes());
    load();
    window.addEventListener(shoeLibrary.event, load);
    window.addEventListener("hilo-storage", load);
    return () => { window.removeEventListener(shoeLibrary.event, load); window.removeEventListener("hilo-storage", load); };
  }, []);
  return (
    <Card pad={false}>
      <div className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-4 sm:px-5">
        <h2 className="text-base font-semibold">Saved shoes</h2>
        {shoes.length > 0 && <span className="text-xs text-ink-3">{shoes.length} saved</span>}
      </div>
      {shoes.length === 0 ? (
        <p className="flex items-start gap-2 px-4 pb-4 text-sm leading-6 text-ink-2 sm:px-5"><Archive size={16} className="mt-1 shrink-0 text-ink-3" aria-hidden />Every finished shoe is saved here with its report and every hand, so you can replay it later.</p>
      ) : (
        <ul data-testid="saved-shoes" className="divide-y divide-line border-t border-line">
          {shoes.map((shoe) => (
            <li key={shoe.id} data-testid="saved-shoe-row" className="flex items-center gap-2 py-1.5 pl-4 pr-2 sm:pl-5">
              <button type="button" data-testid="review-saved-shoe" onClick={() => onReview(shoe)} className="min-h-12 min-w-0 flex-1 rounded-lg py-1.5 text-left hover:text-ink">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{savedLabel(shoe)}</span>
                  <Badge tone={shoe.mode === "checkout" ? "brand" : "neutral"} className="h-5 px-1.5 text-[0.6875rem]">{shoe.mode === "checkout" ? "Checkout" : "Coached"}</Badge>
                </span>
                <span className="mt-0.5 block truncate text-xs text-ink-3">
                  {savedRules(shoe)} · <span className={cx("tnum", shoe.report.netResult >= 0 ? "text-pos" : "text-neg")}>{money(shoe.report.netResult, { sign: true })}</span>
                </span>
              </button>
              <IconButton label={`Delete the saved shoe from ${savedLabel(shoe)}`} onClick={() => setPending(shoe)}>
                <Trash2 size={18} aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <ConfirmSheet
        open={Boolean(pending)}
        onClose={() => setPending(undefined)}
        title="Delete this saved shoe?"
        confirmLabel="Delete"
        onConfirm={() => {
          if (!pending) return;
          shoeLibrary.deleteShoe(pending.id);
          track("full_shoe_saved_shoe_deleted", { mode: pending.mode });
          setShoes(shoeLibrary.shoes());
        }}
      >
        {pending && <>{savedLabel(pending)}, {savedRules(pending)}. Its hands cannot be recovered.</>}
      </ConfirmSheet>
    </Card>
  );
}

export function Setup({ setup, onChange, onStart, onReview }: {
  setup: FullShoeSetup;
  onChange: (setup: FullShoeSetup) => void;
  onStart: () => void;
  onReview: (shoe: SavedShoe) => void;
}) {
  const rampId = useId();
  const set = (patch: Partial<FullShoeSetup>) => onChange({ ...setup, ...patch });
  const setRules = (patch: Partial<TableRules>) => set({ rules: { ...setup.rules, ...patch } });
  const coached = setup.mode === "coached";
  const dollars = rampDollars(setup.ramp, setup.unit);

  const changeUnit = (unit: number) => {
    // A custom ramp keeps its dollar amounts when the unit changes; a preset keeps its shape.
    if (setup.spread === "custom") {
      const ramp = { ...setup.ramp };
      for (const tc of POSITIVE_TRUE_COUNTS) ramp[tc] = (setup.ramp[tc] * setup.unit) / unit;
      set({ unit, ramp });
    } else set({ unit });
  };

  return (
    <DrillSetup
      title="Full Shoe"
      intro="Count, bet and play a whole shoe at a live table, reading the real discard tray for the decks left. Coached checks every bet, play and count as you go; Checkout stays silent and grades the whole shoe at the end."
      onStart={onStart}
      startLabel={coached ? "Buy in and shuffle" : "Start checkout"}
      aside={
        <div className="space-y-4 [contain:inline-size]">
          <SavedShoes onReview={onReview} />
          <Card>
            <h2 className="text-base font-semibold">How it is graded</h2>
            <ul className="mt-2 space-y-2 text-sm leading-6 text-ink-2">
              <li><span className="font-medium text-ink">The count:</span> the running count of every card turned up, divided by the decks left in the shoe to {RESOLUTION_PHRASE[setup.resolution]}, {ROUNDING_PHRASE[setup.rounding]}. Rounding follows <Link href="/settings" className="font-medium text-brand-text underline-offset-2 hover:underline">Settings</Link>.</li>
              <li><span className="font-medium text-ink">Bets</span> against your ramp at that count, <span className="font-medium text-ink">plays</span> against basic strategy and the index plays for these rules, <span className="font-medium text-ink">insurance</span> at +3 or higher.</li>
              <li><span className="font-medium text-ink">Count checks</span> ask for the running count, then the decks left (from the tray photo) and the true count. A count slip is graded once: in a checkout, bets and index plays that are right for the count you reported still count as right.</li>
            </ul>
          </Card>
        </div>
      }
    >
      <div className="space-y-5 [contain:inline-size]">
      <SetupGroup title="Mode">
        <PresetPicker
          label="Mode"
          value={setup.mode}
          onChange={(mode) => set({ mode, holeCard: mode === "checkout" ? "hidden" : setup.holeCard })}
          options={[
            { value: "coached", title: "Coached", detail: "Feedback after every bet, play and count check: what was right, why, and the count it used." },
            { value: "checkout", title: "Checkout", detail: "Silent, like a casino checkout: no hints, tones, score or EV until the shoe ends. Then the full graded report." },
          ]}
        />
      </SetupGroup>

      <SetupGroup title="Table rules" hint={<>Start from your <Link href="/settings" className="font-medium text-brand-text underline-offset-2 hover:underline">saved rules</Link>; changes here apply to this shoe only.</>}>
        <div className="space-y-4">
          <Segmented label="Decks" value={setup.rules.decks} onChange={(decks) => setRules({ decks })} options={DECK_OPTIONS.map((decks) => ({ value: decks, label: String(decks) }))} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Segmented label="Dealer soft 17" value={setup.rules.hitSoft17 ? "h17" : "s17"} onChange={(value) => setRules({ hitSoft17: value === "h17" })} options={[{ value: "h17", label: "Hits (H17)" }, { value: "s17", label: "Stands (S17)" }]} />
            <Segmented label="Surrender" value={setup.rules.surrender} onChange={(surrender) => setRules({ surrender })} options={SURRENDER_OPTIONS} />
            <Segmented label="Double on" value={setup.rules.doubling} onChange={(doubling) => setRules({ doubling })} options={[{ value: "any", label: "Any two" }, { value: "9-11", label: "9–11" }, { value: "10-11", label: "10–11" }]} />
            <Segmented label="Blackjack pays" value={setup.blackjackPayout} onChange={(blackjackPayout) => set({ blackjackPayout })} options={[{ value: 1.5, label: "3 to 2" }, { value: 1.2, label: "6 to 5" }]} />
          </div>
          <Segmented label="Penetration (where the cut card sits)" value={setup.penetration} onChange={(penetration) => set({ penetration })} options={PENETRATIONS.map((value) => ({ value, label: penetrationLabel(value) }))} />
          <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
            <Toggle label="Double after split" checked={setup.rules.das} onChange={(das) => setRules({ das })} />
            <Toggle label="Resplit aces" description="Split aces take one card each; another ace may be split again." checked={setup.resplitAces} onChange={(resplitAces) => set({ resplitAces })} />
          </div>
        </div>
      </SetupGroup>

      <SetupGroup title="Counting" hint={`Decks left are rounded to ${RESOLUTION_PHRASE[setup.resolution]} before dividing; the true count is then ${ROUNDING_PHRASE[setup.rounding]}.`}>
        <div className="space-y-4">
          <Segmented label="Deck precision" value={setup.resolution} onChange={(resolution) => set({ resolution })} options={[{ value: 1, label: "Whole deck" }, { value: 0.5, label: "Half deck" }, { value: 0.25, label: "Quarter" }]} />
          <SelectField label="Count checks between rounds" value={setup.countChecks} onChange={(event) => set({ countChecks: event.target.value as CountCheckFrequency })}>
            {COUNT_CHECK_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </SelectField>
          {setup.countChecks !== "off" && (
            <Segmented label="Ask for" value={setup.countDepth} onChange={(countDepth) => set({ countDepth })}
              options={[{ value: "running", label: "Running count" }, { value: "true", label: "Running + true" }]} />
          )}
        </div>
      </SetupGroup>

      <SetupGroup title="Bankroll and bets" hint="Players share one bankroll. A true count of zero or lower bets one unit; +6 covers everything above it.">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <MoneyField label="Buy-in" value={setup.bankroll} min={1} onChange={(bankroll) => set({ bankroll })} />
            <MoneyField label="One unit" value={setup.unit} onChange={changeUnit} />
          </div>
          <Segmented<BetSpreadPreset> label="Bet ramp" value={setup.spread}
            onChange={(spread) => set({ spread, ramp: spread === "custom" ? setup.ramp : { ...BET_SPREAD_PRESETS[spread] } })}
            options={(Object.keys(SPREAD_LABEL) as BetSpreadPreset[]).map((value) => ({ value, label: SPREAD_LABEL[value] }))} />
          <fieldset aria-describedby={rampId}>
            <legend className="mb-1.5 text-sm font-medium text-ink-2">Bet at each true count</legend>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex min-h-12 flex-col justify-center rounded-xl border border-dashed border-line-strong px-3">
                <span className="text-xs text-ink-3">0 or less</span>
                <span className="tnum font-semibold">{money(setup.unit)}</span>
              </div>
              {POSITIVE_TRUE_COUNTS.map((tc, index) => (
                <MoneyField key={`${tc}-${setup.spread}-${setup.unit}`} label={tc === 6 ? "+6 or more" : `+${tc}`} value={dollars[index]}
                  onChange={(value) => set({ spread: "custom", ramp: { ...setup.ramp, [tc]: value / setup.unit } })} />
              ))}
            </div>
            <p id={rampId} className="mt-1.5 text-xs leading-5 text-ink-3">Editing any amount makes a custom ramp. {coached ? "The coach shows the ramp's bet once you start betting." : "The checkout grades every bet without showing the answer."}</p>
          </fieldset>
          <Segmented label="Players at the table" value={setup.players} onChange={(players) => set({ players })} options={[1, 2, 3, 4, 5].map((value) => ({ value, label: String(value) }))} />
        </div>
      </SetupGroup>

      <SetupGroup title="Table">
        <div className="space-y-4">
          <Segmented label="Dealer hole card" value={setup.holeCard} onChange={(holeCard) => set({ holeCard })}
            options={[{ value: "hidden", label: "Hidden" }, { value: "shown", label: "Shown", disabled: !coached }]} />
          {setup.holeCard === "shown" && coached && (
            <Callout tone="info">With the hole card showing, plays are graded by the EV of each play for that exact hole card and the cards left, worked out as you play.</Callout>
          )}
          <Segmented<Speed> label="Dealing speed" value={setup.speed} onChange={(speed) => set({ speed })} options={[{ value: "relaxed", label: "Relaxed" }, { value: "casino", label: "Casino" }, { value: "fast", label: "Fast" }]} />
          <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
            <Toggle label="Hot shoe" description="The same cards, arranged so the true count climbs to +6 about halfway through. Good for practising big bets and index plays." checked={setup.stacked} onChange={(stacked) => set({ stacked })} />
            <Toggle label="Card animations" checked={setup.animations} onChange={(animations) => set({ animations })} />
            <Toggle label="Sounds" description={coached ? "Card and chip sounds, and a tone for right and wrong." : "Card and chip sounds only."} checked={setup.sound} onChange={(sound) => set({ sound })} />
          </div>
        </div>
      </SetupGroup>
      </div>
    </DrillSetup>
  );
}
