/**
 * Cover: bet changes a pit boss would notice. Informational, never graded,
 * and kept apart from whether the bet was right for the count.
 *
 * THE RULE. A round is flagged when the total bet more than doubles from the
 * round before. A round after sitting out (a watched round, or the first of
 * the shoe) is compared with the table minimum, since walking in with a big
 * bet is the back-counter's best-known tell. Going from the minimum to the
 * maximum is always caught by the same rule.
 */
import type { FullShoeLiveRound } from "@/lib/blackjack/fullShoeSession";

export interface BetJump {
  round: number;
  from: number;
  to: number;
  /** The bet came straight after sitting out, so `from` is the table minimum. */
  entered: boolean;
}

export function betJumps(rounds: readonly Pick<FullShoeLiveRound, "round" | "bet">[], tableMin: number): BetJump[] {
  const jumps: BetJump[] = [];
  let previous: number | undefined;
  for (const { round, bet } of rounds) {
    if (bet <= 0) { previous = undefined; continue; }
    const from = previous ?? tableMin;
    if (bet > from * 2 + 0.005) jumps.push({ round, from, to: bet, entered: previous === undefined });
    previous = bet;
  }
  return jumps;
}
