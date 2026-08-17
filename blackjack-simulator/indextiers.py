"""Generate directly simulated, non-interpolated Hi-Lo index-tier artifacts.

This intentionally imports primitives from ``simulate.py`` but never changes
it: its source hash is bound into the existing production artifacts.  The
strategy table is parsed from the application source so both the simulator and
the reference UI use the same rows, including CountLab's LS overlays.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import platform
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from numba import njit, prange

from simulate import BUCKETS, GAME_OPTIONS, Z95, floored_true_count, git_metadata, hand_value, hilo, task_layout

HIT, STAND, DOUBLE, SPLIT, SURRENDER = 0, 1, 2, 3, 4
ACTION = np.array([-1, STAND, HIT, DOUBLE, SPLIT, SURRENDER], dtype=np.int8)
ROOT = Path(__file__).resolve().parent.parent
TABLE_PATH = ROOT / "blackjack" / "lib" / "blackjack" / "fullHiLoIndices.ts"
REFERENCE_RAMP = np.array([1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 4, 8, 12, 12, 12, 12, 12], dtype=np.int64)

# Pinned from results/index-tier-ranking-production.json (1--12 reference ramp, 500k-shoe
# ordering pass).  The production coefficient run measures these sets directly;
# the ranking only chooses membership and is never used by the application.
TIER_PLAYS: dict[str, tuple[str, ...]] = {
    "none": (),
    "70": ("Insurance|A", "12|3", "15|9", "11|A", "12|2", "9|2", "14|10", "16|10", "7,7|8", "12|5", "12|4"),
    "82": ("Insurance|A", "12|3", "15|9", "11|A", "12|2", "9|2", "14|10", "16|10", "7,7|8", "12|5", "12|4", "10,10|6", "10,10|5", "Soft 18|A", "Soft 18|2", "4,4|4", "10|A", "13|3"),
    "i18fab4": ("Insurance|A", "16|10", "15|10", "10,10|5", "10,10|6", "10|10", "12|3", "12|2", "11|A", "9|2", "10|A", "9|7", "16|9", "13|2", "12|4", "12|5", "12|6", "13|3", "14|10", "15|9", "15|A"),
    "full": (),
}


def normalized_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def label(total: int, split: int) -> str:
    if total < 0: return f"Soft {abs(total)}"
    if split and total % 2 == 0 and 4 <= total <= 20:
        rank = total // 2
        return "10,10" if rank == 10 else f"{rank},{rank}"
    return str(total)


def table():
    raw = TABLE_PATH.read_text(encoding="utf-8")
    match = re.search(r"RAW_HI_LO_INDICES = `(.*?)`;", raw, re.S)
    if not match: raise RuntimeError("RAW_HI_LO_INDICES is missing")
    initial = np.full((43, 11, 2, 2, 2), HIT, dtype=np.int8)
    present = np.zeros_like(initial, dtype=np.bool_)
    count = np.zeros_like(initial)
    threshold = np.zeros((*initial.shape, 2), dtype=np.int16)
    action = np.zeros((*initial.shape, 2), dtype=np.int8)
    plays: dict[str, list[tuple[int, int, int, int, int]]] = {}
    rows = [line.split() for line in match.group(1).strip().splitlines() if line.strip() and not line.lstrip().startswith("#")]
    for row in rows:
        values = list(map(int, row)); total, dealer, double, split, surrender, first = values[:6]
        key = (total + 21, dealer, double, split, surrender)
        initial[key] = ACTION[first]; present[key] = True; n = 0
        for cursor in range(6, len(values) - 1, 2):
            index, next_action = values[cursor], values[cursor + 1]
            if index >= 1000: break
            threshold[key + (n,)] = index; action[key + (n,)] = ACTION[next_action]; n += 1
        count[key] = n
        plays.setdefault(f"{label(total, split)}|{'A' if dealer == 1 else dealer}", []).append(key)
    # "None" means conventional basic strategy.  The full TDI source encodes
    # partitions, so basic action is its zero-count action—not its lower-tail
    # initial action (e.g. 11v6 starts hit then doubles at -17).
    basic = initial.copy()
    for key in np.ndindex(initial.shape):
        for position in range(count[key]):
            if threshold[key + (position,)] <= 0: basic[key] = action[key + (position,)]
    return initial, basic, count, threshold, action, present, plays, len(rows)


INITIAL, BASIC, TRANSITION_COUNT, TRANSITION_INDEX, TRANSITION_ACTION, PRESENT, PLAY_CONTEXTS, TABLE_ROWS = table()
ALL_PLAYS = tuple(sorted(PLAY_CONTEXTS))


def tier_mask(name: str):
    if name not in TIER_PLAYS: raise ValueError(name)
    mask = np.zeros_like(INITIAL, dtype=np.bool_)
    if name == "full": mask[:] = True; return mask, True
    selected = set(TIER_PLAYS[name])
    for play in selected:
        for key in PLAY_CONTEXTS.get(play, ()): mask[key] = True
    return mask, "Insurance|A" in selected


@njit(cache=True)
def action_at(cards, card_count, dealer, can_split, can_double, can_surrender, split_aces, tc, enabled):
    if split_aces: return STAND
    total, soft = hand_value(cards, card_count)
    encoded = -total if soft else total; slot = encoded + 21
    if slot < 0 or slot >= 43: return HIT
    double = 1 if can_double else 0
    split = 1 if (card_count == 2 and cards[0] == cards[1] and can_split) else 0
    surrender = 1 if can_surrender else 0
    key = (slot, dealer, double, split, surrender)
    # LS overlays intentionally contain only the contexts where surrender is
    # actually legal/optimal.  Every other first-decision context inherits the
    # no-surrender row instead of the default array fill value.
    if not PRESENT[key]: key = (slot, dealer, double, split, 0)
    if not enabled[key]: return BASIC[key]
    result = INITIAL[key]
    for position in range(TRANSITION_COUNT[key]):
        if TRANSITION_INDEX[key + (position,)] <= tc: result = TRANSITION_ACTION[key + (position,)]
    return result


@njit(cache=True)
def play(first, second, dealer, shoe, position, running, enabled):
    cards = np.zeros((4, 12), dtype=np.int8); counts = np.zeros(4, dtype=np.int8); bets = np.ones(4, dtype=np.int8); surrendered = np.zeros(4, dtype=np.int8); split_aces = np.zeros(4, dtype=np.int8)
    cards[0, 0], cards[0, 1], counts[0] = first, second, 2; hands = 1; hand = 0; natural = (first == 1 and second == 10) or (first == 10 and second == 1)
    while hand < hands:
        n = int(counts[hand]); total, _ = hand_value(cards[hand], n)
        if total > 21: hand += 1; continue
        can_split = n == 2 and cards[hand, 0] == cards[hand, 1] and hands < 4
        move = action_at(cards[hand], n, dealer, can_split, n == 2, hand == 0 and hands == 1 and n == 2, split_aces[hand] == 1, floored_true_count(running, len(shoe) - position), enabled)
        if move == SPLIT and can_split:
            rank, new = int(cards[hand, 0]), hands; hands += 1
            cards[hand, 0], cards[hand, 1] = rank, shoe[position]; running += hilo(int(shoe[position])); position += 1; counts[hand] = 2
            cards[new, 0], cards[new, 1] = rank, shoe[position]; running += hilo(int(shoe[position])); position += 1; counts[new] = 2
            if rank == 1: split_aces[hand], split_aces[new] = 1, 1
            natural = False; continue
        if move == SURRENDER: surrendered[hand] = 1; hand += 1; continue
        if move == DOUBLE and n == 2:
            cards[hand, n] = shoe[position]; running += hilo(int(shoe[position])); position += 1; counts[hand] += 1; bets[hand] = 2; hand += 1; continue
        if move == HIT:
            cards[hand, n] = shoe[position]; running += hilo(int(shoe[position])); position += 1; counts[hand] += 1; continue
        hand += 1
    needs_dealer = False
    for index in range(hands):
        total, _ = hand_value(cards[index], int(counts[index]))
        if not surrendered[index] and total <= 21 and not (natural and index == 0 and hands == 1): needs_dealer = True
    return cards, counts, bets, surrendered, hands, position, running, needs_dealer


@njit(cache=True)
def settle(cards, counts, bets, surrendered, hands, dealer_total, dealer_bust, natural):
    profit = 0.0
    for hand in range(hands):
        bet = float(bets[hand])
        if surrendered[hand]: profit -= .5; continue
        total, _ = hand_value(cards[hand], int(counts[hand]))
        if total > 21: profit -= bet
        elif natural and hands == 1 and hand == 0: profit += 1.5
        elif dealer_bust or total > dealer_total: profit += bet
        elif total < dealer_total: profit -= bet
    return profit


@njit(cache=True)
def task(decks, dealt, shoes, seed, enabled, insurance, wager):
    np.random.seed(seed); cards_total = decks * 52; cut = int(round(dealt * 52)); shoe = np.empty(cards_total, dtype=np.int8); cursor = 0
    for _ in range(decks):
        for rank in range(1, 10):
            for _ in range(4): shoe[cursor] = rank; cursor += 1
        for _ in range(16): shoe[cursor] = 10; cursor += 1
    counts = np.zeros(BUCKETS, dtype=np.int64); sums = np.zeros(BUCKETS); squares = np.zeros(BUCKETS); rounds = 0
    for _ in range(shoes):
        np.random.shuffle(shoe); position = 0; running = 0
        while position < cut:
            bucket = min(16, max(0, floored_true_count(running, cards_total - position) + 8)); first, up, second, hole = int(shoe[position]), int(shoe[position+1]), int(shoe[position+2]), int(shoe[position+3]); position += 4; running += hilo(first) + hilo(up) + hilo(second)
            insured = insurance and up == 1 and floored_true_count(running, cards_total - position) >= 3; dealer_bj = (up == 1 and hole == 10) or (up == 10 and hole == 1); natural = (first == 1 and second == 10) or (first == 10 and second == 1); profit = 0.0
            if dealer_bj:
                running += hilo(hole); profit = 0.0 if natural else -1.0
                if insured: profit += 1.0
            else:
                if insured: profit -= .5
                pcards, pcounts, bets, surrendered, hands, position, running, needs = play(first, second, up, shoe, position, running, enabled); running += hilo(hole)
                dealer_cards = np.zeros(12, dtype=np.int8); dealer_cards[0], dealer_cards[1] = up, hole; dealer_count = 2; dealer_total, dealer_soft = hand_value(dealer_cards, dealer_count)
                if needs:
                    while dealer_total < 17 or (dealer_total == 17 and dealer_soft):
                        card = int(shoe[position]); position += 1; dealer_cards[dealer_count] = card; dealer_count += 1; running += hilo(card); dealer_total, dealer_soft = hand_value(dealer_cards, dealer_count)
                profit += settle(pcards, pcounts, bets, surrendered, hands, dealer_total, dealer_total > 21, natural)
            counts[bucket] += 1; sums[bucket] += profit * wager[bucket]; squares[bucket] += (profit * wager[bucket]) ** 2; rounds += 1
    return counts, sums, squares, rounds


@njit(parallel=True, cache=True)
def parallel(decks, dealt, shoes, seeds, enabled, insurance, wager):
    n = len(shoes); counts = np.zeros((n, BUCKETS), dtype=np.int64); sums = np.zeros((n, BUCKETS)); squares = np.zeros((n, BUCKETS)); rounds = np.zeros(n, dtype=np.int64)
    for index in prange(n): counts[index], sums[index], squares[index], rounds[index] = task(decks, dealt, int(shoes[index]), int(seeds[index]), enabled, insurance, wager)
    return counts, sums, squares, rounds


def run(decks, dealt, shoes, tasks, seed, enabled, insurance, wager):
    layout, seeds = task_layout(shoes, tasks, seed, decks * 1000 + int(dealt * 100)); started = time.perf_counter(); counts, sums, squares, rounds = parallel(decks, dealt, layout, seeds, enabled, insurance, wager); counts, sums, squares = counts.sum(0), sums.sum(0), squares.sum(0); total = int(counts.sum()); rows = []
    for index in range(BUCKETS):
        n = int(counts[index]); scale = wager[index] or 1; mean = sums[index] / n if n else 0.; variance = (squares[index] - sums[index] ** 2 / n) / (n - 1) if n > 1 else 0.; sd = math.sqrt(max(0., variance)); se = sd / math.sqrt(n) if n else 0.
        rows.append({"true_count": index - 8, "frequency": n / total, "advantage": float(mean / scale), "standard_deviation": float(sd / scale), "rounds": n, "standard_error": float(se / scale)})
    return {"rounds": total, "mean": float(sums.sum() / total), "rows": rows, "runtime_seconds": time.perf_counter() - started}


def ranking(args):
    base_mask, base_insurance = tier_mask("none"); baseline = run(6, 4.5, args.rank_shoes, args.tasks, args.seed, base_mask, base_insurance, REFERENCE_RAMP)["mean"]; ranked = []
    for play_name in ("Insurance|A", *ALL_PLAYS):
        enabled = base_mask.copy(); insurance = play_name == "Insurance|A"
        for key in PLAY_CONTEXTS.get(play_name, ()): enabled[key] = True
        marginal = run(6, 4.5, args.rank_shoes, args.tasks, args.seed, enabled, insurance, REFERENCE_RAMP)["mean"] - baseline
        ranked.append({"play": play_name, "marginal_ev": marginal})
    ranked.sort(key=lambda item: item["marginal_ev"], reverse=True); return ranked


def reference_ev(profile, ramp=None):
    wagers = np.ones(BUCKETS) if ramp is None else ramp
    return sum(row["frequency"] * row["advantage"] * wagers[index] for index, row in enumerate(profile["rows"]))


def write_typescript(payload, destination: Path):
    profiles = payload["profiles"]
    baseline = profiles["none"]["6-4.5"]
    complete = profiles["full"]["6-4.5"]
    flat_total = reference_ev(complete) - reference_ev(baseline)
    ramp_total = reference_ev(complete, REFERENCE_RAMP) - reference_ev(baseline, REFERENCE_RAMP)
    coverage = {}
    for tier, tier_profiles in profiles.items():
        reference = tier_profiles["6-4.5"]
        coverage[tier] = {
            "flat": 0 if tier == "none" else (reference_ev(reference) - reference_ev(baseline)) / flat_total,
            "ramped": 0 if tier == "none" else (reference_ev(reference, REFERENCE_RAMP) - reference_ev(baseline, REFERENCE_RAMP)) / ramp_total,
            "plays": len(TIER_PLAYS[tier]) if tier != "full" else len(ALL_PLAYS) + 1,
        }
    lines = [
        "// Generated by ../blackjack-simulator/indextiers.py. Do not edit by hand.",
        'import type { RawCoefficient } from "./coefficients";',
        "export type IndexTier = \"none\" | \"70\" | \"82\" | \"i18fab4\" | \"full\";",
        "export const INDEX_TIER_METADATA = " + json.dumps({**payload["metadata"], "coverage": coverage}, separators=(",", ":")) + " as const;",
        "export const INDEX_TIER_COEFFICIENTS: Record<IndexTier, Record<string, readonly RawCoefficient[]>> = {",
    ]
    for tier, tier_profiles in profiles.items():
        lines.append(f'  "{tier}": {{')
        for key, profile in tier_profiles.items():
            lines.append(f'    "{key}": [')
            for row in profile["rows"]:
                lines.append("      [" + ", ".join(format(row[name], ".12g") if isinstance(row[name], float) else str(row[name]) for name in ("frequency", "advantage", "standard_deviation", "rounds", "standard_error")) + "],")
            lines.append("    ],")
        lines.append("  },")
    lines.extend(["};", ""])
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text("\n".join(lines), encoding="utf-8")


def write_tier_artifacts(payload, directory: Path):
    for tier, profiles in payload["profiles"].items():
        target = directory / f"index-tier-{tier}.json"
        target.write_text(json.dumps({"metadata": payload["metadata"], "profiles": profiles}, indent=2) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--rank", action="store_true"); parser.add_argument("--tier", choices=TIER_PLAYS); parser.add_argument("--all", action="store_true"); parser.add_argument("--shoes", type=int, default=100_000_000); parser.add_argument("--rank-shoes", type=int, default=500_000); parser.add_argument("--tasks", type=int, default=max(1, os.cpu_count() or 1)); parser.add_argument("--seed", type=int, default=20260817); parser.add_argument("--output", type=Path); parser.add_argument("--typescript", type=Path)
    args = parser.parse_args()
    if not (args.rank or args.tier or args.all): parser.error("choose --rank, --tier, or --all")
    # Compile before recording run timing.
    enabled, insurance = tier_mask("none"); parallel(6, 4.5, np.array([1]), np.array([1]), enabled, insurance, np.ones(BUCKETS, dtype=np.int64))
    metadata = {"created_utc": datetime.now(timezone.utc).isoformat(), "source_sha256": normalized_sha256(Path(__file__)), "table_sha256": normalized_sha256(TABLE_PATH), "simulate_source_sha256": normalized_sha256(Path(__file__).parent / "simulate.py"), "table_rows": TABLE_ROWS, "python": platform.python_version(), "requested_shoes": args.shoes, "seed": args.seed, "method": "every displayed tier is independently simulated; no coefficient interpolation"}
    if args.rank: payload = {"metadata": {**metadata, "reference_ramp": "1-12", "rank_shoes": args.rank_shoes, "limit": "standalone marginal EVs; interactions are not added"}, "ranking": ranking(args)}; default = "index-tier-ranking.json"
    else:
        names = tuple(TIER_PLAYS) if args.all else (args.tier,); profiles = {}
        for name in names:
            enabled, insurance = tier_mask(name); profiles[name] = {f"{decks}-{dealt:g}": run(decks, dealt, args.shoes, args.tasks, args.seed, enabled, insurance, np.ones(BUCKETS, dtype=np.int64)) for decks, values in GAME_OPTIONS.items() for dealt in values}
        payload = {"metadata": {**metadata, "git": git_metadata()}, "profiles": profiles}; default = "index-tiers.json"
    output = args.output or Path(__file__).parent / "results" / default; output.parent.mkdir(exist_ok=True); output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8"); print(f"Wrote {output}")
    if args.all and not args.rank: write_tier_artifacts(payload, output.parent)
    if args.typescript:
        if args.rank or not args.all: parser.error("--typescript requires --all")
        write_typescript(payload, args.typescript); print(f"Wrote {args.typescript}")


if __name__ == "__main__": main()
