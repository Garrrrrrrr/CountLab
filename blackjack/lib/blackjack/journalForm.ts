/**
 * The Session Journal's log form as plain data: the game a session was played
 * under (rules, unit, spread, pace), where that game came from, and the
 * outcome fields. Kept free of React so prefill, validation and the saved
 * payload can be tested directly.
 */
import { DEFAULT_ADVANTAGE_RULES, handsAt, RAMPS, unitsAt, type AdvantageRules, type HandCountPoint, type RampPoint } from "./advantage";
import { GAME_OPTIONS } from "./coefficients";
import { templateHandSchedule, type CvcxTemplateConfig } from "./cvcxLibrary";
import { isJournalDate, type JournalSession } from "./journal";
import { money, shortDate, trueCountLabel } from "./journalFormat";
import type { SessionSimulationConfig } from "./sessionSimulation";
import type { VenuePreset } from "./venuePresets";

/** The seventeen true-count buckets the audited coefficients are keyed on. */
export const TRUE_COUNTS = Array.from({ length: 17 }, (_, index) => index - 8);
const MIN_TC = TRUE_COUNTS[0];
const MAX_TC = TRUE_COUNTS[TRUE_COUNTS.length - 1];

export const DEFAULT_HOURS = 4;

export type ResultDirection = "won" | "lost";

/** Everything about how a session was played except when, where and how long. */
export interface GameDraft {
  decks: 6 | 8;
  /** Decks dealt before the shuffle. */
  dealt: number;
  dealerHitsSoft17: boolean;
  doubleAfterSplit: boolean;
  resplitAces: boolean;
  lateSurrender: boolean;
  blackjackPayout: 1.5 | 1.2;
  useIndices: boolean;
  bettingUnit: number;
  handsPerHour: number;
  /** Hands played at every count without an override below. */
  playerHands: number;
  /** A RAMPS preset name, or "Custom". */
  spread: string;
  /** One point per true count, -8 through +8. */
  ramp: RampPoint[];
  /** Per-count overrides of playerHands; only real overrides are kept. */
  handsByCount: Record<number, number>;
}

/** Where the game in the form came from, shown so a remembered game is never a surprise. */
export type GameSource =
  | { kind: "latest"; date: string; location?: string }
  | { kind: "casino"; date: string; location: string }
  | { kind: "venue"; name: string }
  | { kind: "scenario"; name: string; id: string }
  | { kind: "setup"; name: string }
  | { kind: "session" }
  | { kind: "edited" }
  | { kind: "default" };

export interface SessionDraft {
  date: string;
  bankrollId: string;
  location: string;
  hours: number;
  /** Deliberately empty for a new session: a result's sign is a choice, never a default. */
  direction: ResultDirection | null;
  /** Always a magnitude. Null until entered, so a blank is never saved as $0. */
  amount: number | null;
  expenses: number;
  notes: string;
  game: GameDraft;
  source: GameSource;
}

export const expandRamp = (ramp: RampPoint[]): RampPoint[] => TRUE_COUNTS.map((trueCount) => ({ trueCount, units: unitsAt(trueCount, ramp) }));

const sameUnits = (a: RampPoint[], b: RampPoint[]) => {
  const left = expandRamp(a), right = expandRamp(b);
  return left.every((point, index) => point.units === right[index].units);
};

/** The preset a ramp matches exactly, or "Custom". */
export function rampName(ramp: RampPoint[]) {
  return Object.keys(RAMPS).find((name) => sameUnits(RAMPS[name], ramp)) ?? "Custom";
}

export const DEFAULT_GAME: GameDraft = {
  decks: 6,
  dealt: 4.5,
  dealerHitsSoft17: true,
  doubleAfterSplit: true,
  resplitAces: true,
  lateSurrender: true,
  blackjackPayout: 1.5,
  useIndices: true,
  bettingUnit: 25,
  handsPerHour: 100,
  playerHands: 1,
  spread: "1-8",
  ramp: expandRamp(RAMPS["1-8"]),
  handsByCount: {},
};

/** Today's date where the player is, not in UTC: an evening session in Toronto is still today. */
export function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const byPlayOrder = (a: JournalSession, b: JournalSession) => a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date);

/** The most recently played session (by date, then by when it was logged). Legacy invalid dates only count when nothing else exists. */
export function latestSession(sessions: JournalSession[]): JournalSession | undefined {
  const valid = sessions.filter((session) => isJournalDate(session.date));
  return [...(valid.length ? valid : sessions)].sort(byPlayOrder).at(-1);
}

const tableFrom = (rules: AdvantageRules) => {
  const decks: 6 | 8 = rules.decks === 8 ? 8 : 6;
  return {
    decks,
    dealt: Number((rules.penetration * decks).toFixed(2)),
    dealerHitsSoft17: rules.dealerHitsSoft17,
    doubleAfterSplit: rules.doubleAfterSplit,
    resplitAces: rules.resplitAces,
    lateSurrender: rules.lateSurrender,
    blackjackPayout: rules.blackjackPayout,
    // Sessions logged before the control existed were priced with indices on.
    useIndices: rules.useIndices !== false,
  };
};

/**
 * Keeps only real per-count hand overrides. A schedule with the same number of
 * hands everywhere becomes that number "at once", so a uniform Lab schedule
 * reads as "2 hands at once" rather than "hands vary by count".
 */
export function normalizeHands(playerHands: number, schedule: Record<number, number> | HandCountPoint[] | undefined): Pick<GameDraft, "playerHands" | "handsByCount"> {
  // A stored schedule is read the way the pricing engine reads it (a step
  // function over the listed counts); a draft's overrides are exact.
  const full = TRUE_COUNTS.map((trueCount) => Array.isArray(schedule) ? handsAt(trueCount, schedule, playerHands) : schedule?.[trueCount] ?? playerHands);
  if (full.every((hands) => hands === full[0])) return { playerHands: full[0], handsByCount: {} };
  return { playerHands, handsByCount: Object.fromEntries(TRUE_COUNTS.flatMap((trueCount, index) => full[index] === playerHands ? [] : [[trueCount, full[index]]])) };
}

export function gameFromSession(session: JournalSession): GameDraft {
  return {
    ...tableFrom(session.rules),
    bettingUnit: session.bettingUnit,
    handsPerHour: session.handsPerHour,
    ...normalizeHands(session.playerHands, session.handsByTrueCount),
    spread: rampName(session.ramp),
    ramp: expandRamp(session.ramp),
  };
}

/**
 * A Lab scenario, mapped as the shared ScenarioPicker always has: its rules,
 * base bet, pace and hand schedule, with `ramp` already passed through
 * scenarioRamp (counts below its wong-in point zeroed). Hours are not part of
 * a game, so the player's own hours stay.
 */
export function gameFromScenario(config: CvcxTemplateConfig, ramp: RampPoint[]): GameDraft {
  return {
    decks: config.decks,
    dealt: config.dealt,
    dealerHitsSoft17: config.dealerHitsSoft17,
    doubleAfterSplit: config.doubleAfterSplit,
    resplitAces: config.resplitAces,
    lateSurrender: config.lateSurrender,
    blackjackPayout: config.blackjackPayout,
    useIndices: config.useIndices !== false,
    bettingUnit: config.baseBet,
    handsPerHour: config.handsPerHour,
    ...normalizeHands(1, templateHandSchedule(config)),
    spread: rampName(ramp),
    ramp: expandRamp(ramp),
  };
}

/** A saved Simulator setup: rules, unit, hands, pace and ramp. */
export function gameFromSimulationSetup(config: SessionSimulationConfig): GameDraft {
  return {
    ...tableFrom(config.rules),
    bettingUnit: config.bettingUnit,
    handsPerHour: config.roundsPerHour,
    playerHands: config.playerHands,
    handsByCount: {},
    spread: rampName(config.ramp),
    ramp: expandRamp(config.ramp),
  };
}

/** A saved venue carries only the table rules and the ramp; unit, pace and hands stay as they were. */
export function applyVenue(game: GameDraft, preset: Pick<VenuePreset, "rules" | "ramp">): GameDraft {
  return { ...game, ...tableFrom(preset.rules), spread: rampName(preset.ramp), ramp: expandRamp(preset.ramp) };
}

export function rulesOf(game: GameDraft): AdvantageRules {
  return {
    ...DEFAULT_ADVANTAGE_RULES,
    decks: game.decks,
    penetration: game.dealt / game.decks,
    dealerHitsSoft17: game.dealerHitsSoft17,
    doubleAfterSplit: game.doubleAfterSplit,
    resplitAces: game.resplitAces,
    lateSurrender: game.lateSurrender,
    blackjackPayout: game.blackjackPayout,
    useIndices: game.useIndices,
  };
}

export const hasHandOverrides = (game: GameDraft) => Object.keys(game.handsByCount).length > 0;

export const handsScheduleOf = (game: GameDraft): HandCountPoint[] => TRUE_COUNTS.map((trueCount) => ({ trueCount, hands: game.handsByCount[trueCount] ?? game.playerHands }));

/** The game as stored on a session. The per-count schedule is saved only when it differs somewhere. */
export function gameFields(game: GameDraft) {
  return {
    rules: rulesOf(game),
    ramp: game.ramp,
    bettingUnit: game.bettingUnit,
    playerHands: game.playerHands,
    handsPerHour: game.handsPerHour,
    handsByTrueCount: hasHandOverrides(game) ? handsScheduleOf(game) : undefined,
  };
}

const gameKey = (game: GameDraft) => JSON.stringify([
  game.decks, game.dealt, game.dealerHitsSoft17, game.doubleAfterSplit, game.resplitAces, game.lateSurrender, game.blackjackPayout, game.useIndices,
  game.bettingUnit, game.handsPerHour, handsScheduleOf(game).map((point) => point.hands), expandRamp(game.ramp).map((point) => point.units),
]);
/** Whether two games price identically (the spread's display name is ignored). */
export const sameGame = (a: GameDraft, b: GameDraft) => gameKey(a) === gameKey(b);
/** Whether a game already uses a venue's rules and ramp. */
export const usesVenue = (game: GameDraft, preset: Pick<VenuePreset, "rules" | "ramp">) => sameGame(game, applyVenue(game, preset));

/** Zero is a breakeven, whatever the direction. */
export function signedResult(direction: ResultDirection | null | undefined, amount: number) {
  if (amount === 0) return 0;
  return direction === "lost" ? -Math.abs(amount) : Math.abs(amount);
}

export const directionOf = (netResult: number): ResultDirection | null => netResult > 0 ? "won" : netResult < 0 ? "lost" : null;

const shortNumber = (value: number) => Number(value.toFixed(1)).toString();

/** "1–8": the largest bet over the smallest non-zero one, in units. */
export function spreadLabel(ramp: RampPoint[]) {
  const units = expandRamp(ramp).map((point) => point.units).filter((value) => value > 0);
  if (!units.length) return "Sit out";
  return `1–${shortNumber(Math.max(...units) / Math.min(...units))}`;
}

export const penetrationLabel = (dealt: number, decks: number) => `${dealt} of ${decks} decks dealt (${Math.round((dealt / decks) * 100)}%)`;

/** 6 decks · 4.5 of 6 dealt · H17 · DAS · RSA · LS · 3:2 · Indices */
export function rulesSummary(rules: AdvantageRules) {
  const decks = rules.decks;
  const dealt = Number((rules.penetration * decks).toFixed(2));
  return [
    `${decks} decks`,
    `${dealt} of ${decks} dealt`,
    rules.dealerHitsSoft17 ? "H17" : "S17",
    rules.doubleAfterSplit ? "DAS" : "No DAS",
    rules.resplitAces ? "RSA" : "No RSA",
    rules.lateSurrender ? "LS" : "No surrender",
    rules.blackjackPayout === 1.5 ? "3:2" : "6:5",
    rules.useIndices === false ? "Basic only" : "Indices",
  ].join(" · ");
}

/**
 * A ramp read the way players say it, with runs of equal bets merged:
 * TC ≤ 0 $25 · +1 $50 · +2 $100 · +3 $150 · +4 and up $200.
 */
export function rampSummary(ramp: RampPoint[], unit: number): { counts: string; bet: string }[] {
  const points = expandRamp(ramp);
  const groups: { start: number; end: number; units: number }[] = [];
  for (const point of points) {
    const last = groups.at(-1);
    if (last && last.units === point.units) last.end = point.trueCount;
    else groups.push({ start: point.trueCount, end: point.trueCount, units: point.units });
  }
  return groups.map(({ start, end, units }) => {
    const counts = start === MIN_TC && end === MAX_TC ? "Every count"
      : start === MIN_TC ? `≤ ${trueCountLabel(end)}`
      : end === MAX_TC ? `${trueCountLabel(start)} and up`
      : start === end ? trueCountLabel(start)
      : `${trueCountLabel(start)} to ${trueCountLabel(end)}`;
    const bet = units * unit;
    return { counts, bet: units === 0 ? "sit out" : money(bet, bet % 1 ? 2 : 0) };
  });
}

export const handsSummary = (game: GameDraft) => hasHandOverrides(game) ? "hands vary by count" : `${game.playerHands} hand${game.playerHands === 1 ? "" : "s"} at once`;

export function sourceLabel(source: GameSource) {
  switch (source.kind) {
    case "latest": return `From your latest session (${shortDate(source.date)}${source.location ? ` · ${source.location}` : ""})`;
    case "casino": return `From your last ${source.location} session (${shortDate(source.date)})`;
    case "venue": return `From saved venue: ${source.name}`;
    case "scenario": return `From Lab scenario: ${source.name}`;
    case "setup": return `From Simulator setup: ${source.name}`;
    case "session": return "As logged with this session";
    case "edited": return "Edited";
    default: return "Default game";
  }
}

/** The game a new session starts from: the latest session played, else the defaults. */
export function rememberedGame(sessions: JournalSession[]): { game: GameDraft; hours: number; source: GameSource } {
  const latest = latestSession(sessions);
  if (!latest) return { game: DEFAULT_GAME, hours: DEFAULT_HOURS, source: { kind: "default" } };
  return { game: gameFromSession(latest), hours: latest.hours, source: { kind: "latest", date: latest.date, location: latest.location?.trim() || undefined } };
}

export function newSessionDraft({ game, source, hours, bankrollId, today = localDateString() }: { game: GameDraft; source: GameSource; hours: number; bankrollId: string; today?: string }): SessionDraft {
  return { date: today, bankrollId, location: "", hours, direction: null, amount: null, expenses: 0, notes: "", game, source };
}

/** An existing session as an editable draft: the result splits into its direction and size. */
export function draftFromSession(session: JournalSession): SessionDraft {
  return {
    date: session.date,
    bankrollId: session.bankrollId,
    location: session.location ?? "",
    hours: session.hours,
    direction: directionOf(session.netResult),
    amount: Math.abs(session.netResult),
    expenses: session.expenses,
    notes: session.notes ?? "",
    game: gameFromSession(session),
    source: { kind: "session" },
  };
}

/** Clears what differs from one session to the next, keeping the date, casino, hours and game for a run of entries. */
export const nextEntryDraft = (draft: SessionDraft): SessionDraft => ({ ...draft, direction: null, amount: null, expenses: 0, notes: "" });

export const SESSION_ERRORS = {
  date: "Enter a complete, valid date.",
  amount: "Enter the table result. Use 0 if you broke even.",
  direction: "Choose Won or Lost.",
} as const;
export type SessionField = keyof typeof SESSION_ERRORS;

/** Problems in the order they are fixed: date, then amount, then direction (not needed for a breakeven). */
export function validateSessionDraft(draft: Pick<SessionDraft, "date" | "amount" | "direction">): SessionField[] {
  const errors: SessionField[] = [];
  if (!isJournalDate(draft.date)) errors.push("date");
  if (draft.amount === null || !Number.isFinite(draft.amount)) errors.push("amount");
  else if (draft.amount !== 0 && !draft.direction) errors.push("direction");
  return errors;
}

/** The record addSession / updateSession receive. Text is trimmed, and blank text is left out. */
export function sessionPayload(draft: SessionDraft) {
  return {
    date: draft.date,
    location: draft.location.trim() || undefined,
    hours: draft.hours,
    ...gameFields(draft.game),
    netResult: signedResult(draft.direction, draft.amount ?? 0),
    expenses: draft.expenses,
    notes: draft.notes.trim() || undefined,
    bankrollId: draft.bankrollId,
  };
}

/** Distinct casino names for the form's suggestions: most recently played first, then saved venues. */
export function casinoNames(sessions: JournalSession[], presets: Pick<VenuePreset, "name">[]) {
  const seen = new Set<string>();
  const names: string[] = [];
  const add = (name: string | undefined) => {
    const trimmed = name?.trim();
    if (!trimmed || seen.has(trimmed.toLocaleLowerCase())) return;
    seen.add(trimmed.toLocaleLowerCase());
    names.push(trimmed);
  };
  [...sessions].sort(byPlayOrder).reverse().forEach((session) => add(session.location));
  presets.forEach((preset) => add(preset.name));
  return names;
}

/** The game a casino name points to: its newest saved venue, else the last session played there. */
export function gameForCasino(name: string, sessions: JournalSession[], presets: VenuePreset[]): { kind: "venue"; preset: VenuePreset } | { kind: "session"; session: JournalSession } | null {
  const key = name.trim().toLocaleLowerCase();
  if (!key) return null;
  const preset = presets.filter((item) => item.name.trim().toLocaleLowerCase() === key).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (preset) return { kind: "venue", preset };
  const session = latestSession(sessions.filter((item) => item.location?.trim().toLocaleLowerCase() === key));
  return session ? { kind: "session", session } : null;
}

/** Penetration choices for a deck count, keeping an off-list value (e.g. from a CSV import) selectable. */
export function penetrationOptions(decks: 6 | 8, current: number) {
  const options: number[] = GAME_OPTIONS[decks].map((option) => option.dealt);
  return options.includes(current) ? options : [...options, current].sort((a, b) => a - b);
}
