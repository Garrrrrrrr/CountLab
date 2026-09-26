"use client";

import Link from "next/link";
import { H17_PRO_METADATA } from "@/lib/blackjack/h17ProCoefficients";
import { percent } from "@/lib/blackjack/labFormat";
import { Section } from "@/components/ui";

/** What the figures rest on and what they leave out. */
export function MethodNotes({ estimated, ruleAdjustment, className = "" }: { estimated: boolean; ruleAdjustment: number; className?: string }) {
  const rounds = H17_PRO_METADATA.totalRounds.toLocaleString("en-US");
  const billions = Math.round(H17_PRO_METADATA.totalRounds / 1e9);
  return (
    <div className={className}>
      <Section title="How these numbers are calculated" summary={`Built on ${billions} billion simulated rounds; what's approximate`} icon="fa-flask" open={false} analyticsSection="scope_and_method">
        <ul className="grid list-disc gap-2 pl-5 text-sm leading-6 text-[var(--ink-muted)] marker:text-[var(--rule)]">
          <li>Built on {rounds} simulated rounds of 6- and 8-deck Hi-Lo games played with the H17 Pro chart (H17 · DAS · RSA · LS · dealer peeks · 3:2).</li>
          <li>Covers the nine deck and penetration choices in Game; it is not a general rules simulator.</li>
          <li>Two or three hands at once are priced as correlated (ρ = 0.372, measured over 137M multi-hand rounds), not as independent hands.</li>
          <li>Rounds you sit out still count as time at the table.</li>
          <li>Risk and ranges use normal approximations and ignore heat, back-offs, travel time and resizing your bets.</li>
          {estimated && <li>Rules that differ from the audited game add a flat, published edge estimate ({percent(ruleAdjustment, 2, true).replace("%", "")} points here). Treat those results as directional.</li>}
        </ul>
        <p className="mt-4 text-sm">
          Want candidate spreads for your bankroll? <Link href="/bet-spread-recommender" className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline">Try the Bet Spread Recommender →</Link>
        </p>
      </Section>
    </div>
  );
}
