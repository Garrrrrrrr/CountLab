"use client";
import { ReactNode } from "react";
import type { BankrollHealth } from "@/lib/blackjack/journalAnalysis";
import { money, percent, shortDate, signedMoney } from "@/lib/blackjack/journalFormat";
import { Callout, GhostButton, Panel, StatTile } from "../ui";

const ROR_HELP = "The chance of losing this whole bankroll if you keep playing this game at this unit. CountLab aims for 5% or less.";

/**
 * How much money there is and whether the unit still suits it. Priced on the
 * game from the latest session, over all history whatever the period.
 */
export function BankrollHealthCard({ scopeName, bankroll, results, cash, sessionCount, health, onCash, onStartingBankroll }: {
  scopeName: string;
  bankroll: number;
  results: number;
  cash: { deposits: number; withdrawals: number };
  sessionCount: number;
  health: BankrollHealth | null;
  onCash: () => void;
  onStartingBankroll: () => void;
}) {
  const unit = health?.bettingUnit;
  const breakdown = [
    sessionCount > 0 ? `Results ${signedMoney(results)}` : null,
    cash.deposits > 0 ? `Deposits ${money(cash.deposits)}` : null,
    cash.withdrawals > 0 ? `Withdrawals ${money(cash.withdrawals)}` : null,
  ].filter(Boolean).join(" · ");
  // Risk of ruin priced on session results alone is not a real bankroll.
  const provisional = sessionCount > 0 && cash.deposits === 0;
  const overbet = health?.unitRatio != null && health.unitRatio > 1;
  const verdict = health === null ? null
    : health.unitRatio === null ? "This game has no positive expectation, so no unit size makes it survivable."
    : overbet ? `Your ${money(health.bettingUnit)} unit is ${health.unitRatio.toFixed(1)}× what this bankroll supports at ${percent(health.targetRisk, 0)} risk of ruin. Drop to ${money(health.recommendedUnit)} or add to the bankroll.`
    : `Your ${money(health.bettingUnit)} unit is within what this bankroll supports — ${money(health.recommendedUnit)} would be the full ${percent(health.targetRisk, 0)}-risk size.`;

  let body: ReactNode;
  if (sessionCount === 0) {
    body = <p className="text-sm leading-6 text-[var(--ink-muted)]">Log a session to check your risk of ruin.</p>;
  } else if (provisional) {
    body = (
      <Callout
        tone="warn"
        title="Provisional: no starting bankroll recorded"
        action={<GhostButton size="compact" onClick={onStartingBankroll}><i className="fa-solid fa-plus mr-2 text-xs" aria-hidden="true" />Record starting bankroll</GhostButton>}
      >
        Your bankroll is only your session results ({signedMoney(results)}). {verdict ? `At that size: ${verdict}` : ""} Record what you set aside for play to get a real risk of ruin.
      </Callout>
    );
  } else if (!health) {
    body = (
      <Callout tone="warn" action={<GhostButton size="compact" onClick={onCash}>Deposit / withdrawal</GhostButton>}>
        Your bankroll is $0 or less. Record a deposit to check risk of ruin.
      </Callout>
    );
  } else {
    body = <Callout tone={overbet || health.unitRatio === null ? "warn" : "good"}>{verdict}</Callout>;
  }

  return (
    <Panel aria-labelledby="journal-health-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="journal-health-title" className="text-lg font-semibold">Bankroll health</h2>
        <span title={scopeName} className="max-w-[12rem] truncate rounded-full border border-[var(--rule)] px-2.5 py-0.5 text-xs font-medium text-[var(--ink-muted)]">{scopeName}</span>
      </div>
      <StatTile
        size="lg"
        label="Current bankroll"
        value={money(bankroll)}
        tone={bankroll < 0 ? "bad" : "neutral"}
        sub={<>{breakdown || "Nothing recorded yet"}{unit ? <><br />{Math.max(0, Math.floor(bankroll / Math.max(0.01, unit))).toLocaleString("en-US")} units of {money(unit, unit % 1 ? 2 : 0)}</> : null}</>}
      />
      {health && (
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            size="sm"
            label="Risk of ruin"
            value={percent(health.riskOfRuin, 1)}
            tone={health.riskOfRuin > health.targetRisk ? "bad" : "good"}
            sub={provisional ? `Target ${percent(health.targetRisk, 0)} · provisional` : `Target ${percent(health.targetRisk, 0)}`}
            help={ROR_HELP}
          />
          <StatTile
            size="sm"
            label="Safe unit"
            value={health.recommendedUnit > 0 && Number.isFinite(health.recommendedUnit) ? money(health.recommendedUnit) : "—"}
            sub={health.unitRatio === null ? "No positive edge" : `You bet ${money(health.bettingUnit)} (${health.unitRatio.toFixed(1)}×)`}
            help="The betting unit that keeps risk of ruin at 5% for this bankroll and spread."
          />
          <StatTile
            size="sm"
            className="col-span-2"
            label="Expected per hour"
            value={signedMoney(health.hourlyEv)}
            tone={health.hourlyEv > 0 ? "good" : health.hourlyEv < 0 ? "bad" : "neutral"}
            sub="At your unit and spread"
          />
        </div>
      )}
      {body}
      {health && <p className="text-xs leading-5 text-[var(--ink-muted)]">Based on the game from your latest session ({shortDate(health.referenceDate)}). Not affected by the period.</p>}
    </Panel>
  );
}
