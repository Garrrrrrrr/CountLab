"""Generate reproducible H17 Pro calibration coefficients.

This dedicated kernel implements the supplied 34-deviation H17 Pro chart over
CountLab's H17/DAS/RSA/late-surrender baseline, including insurance at TC +3.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import platform
import time
from datetime import datetime, timezone
from pathlib import Path

import numba
import numpy as np
from numba import njit, prange

from simulate import BUCKETS, GAME_OPTIONS, Z95, bucket_index, git_metadata, hand_value, hilo, summarize, task_layout

HIT, STAND, DOUBLE, SPLIT, SURRENDER = 0, 1, 2, 3, 4
H17_PRO_POLICY = 1


def normalized_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


@njit(cache=True)
def basic_action(cards: np.ndarray, count: int, dealer: int, can_split: bool, can_double: bool, can_surrender: bool, split_aces: bool) -> int:
    total, soft = hand_value(cards, count)
    pair = count == 2 and cards[0] == cards[1]
    rank = int(cards[0]) if pair else 0
    if can_surrender:
        if rank == 8 and dealer == 1:
            return SURRENDER
        if not soft:
            if total == 17 and dealer == 1 and count == 2 and ((cards[0] == 10 and cards[1] == 7) or (cards[0] == 7 and cards[1] == 10)):
                return SURRENDER
            if total == 16 and dealer in (1, 9, 10):
                return SURRENDER
            if total == 15 and dealer in (1, 10):
                return SURRENDER
    if pair and can_split:
        if rank == 1:
            return SPLIT
        if rank == 10:
            return STAND
        if rank == 9:
            return SPLIT if dealer in (2, 3, 4, 5, 6, 8, 9) else STAND
        if rank == 8:
            return SPLIT
        if rank == 7:
            return SPLIT if 2 <= dealer <= 7 else HIT
        if rank == 6:
            return SPLIT if 2 <= dealer <= 6 else HIT
        if rank == 4:
            return SPLIT if dealer in (5, 6) else HIT
        if rank in (2, 3):
            return SPLIT if 2 <= dealer <= 7 else HIT
    if split_aces:
        return STAND
    if soft:
        if total >= 20:
            return STAND
        if total == 19:
            return DOUBLE if dealer == 6 and can_double else STAND
        if total == 18:
            if 2 <= dealer <= 6:
                return DOUBLE if can_double else STAND
            return STAND if dealer in (7, 8) else HIT
        if total == 17:
            return DOUBLE if dealer in (3, 4, 5, 6) and can_double else HIT
        if total in (15, 16):
            return DOUBLE if dealer in (4, 5, 6) and can_double else HIT
        if total in (13, 14):
            return DOUBLE if dealer in (5, 6) and can_double else HIT
        return HIT
    if total >= 17:
        return STAND
    if total >= 13:
        return STAND if 2 <= dealer <= 6 else HIT
    if total == 12:
        return STAND if 4 <= dealer <= 6 else HIT
    if total == 11:
        return DOUBLE if dealer != 1 and can_double else HIT
    if total == 10:
        return DOUBLE if 2 <= dealer <= 9 and can_double else HIT
    if total == 9:
        return DOUBLE if 3 <= dealer <= 6 and can_double else HIT
    return HIT


@njit(cache=True)
def h17_pro_pro_action(cards: np.ndarray, count: int, dealer: int, can_split: bool, can_double: bool, can_surrender: bool, split_aces: bool, tc: int) -> int:
    """Exact policy encoded from the supplied H17 Pro chart."""
    action = basic_action(cards, count, dealer, can_split, can_double, can_surrender, split_aces)
    if count != 2:
        return action
    total, soft = hand_value(cards, count)
    pair_tens = cards[0] == 10 and cards[1] == 10
    pair_eights = cards[0] == 8 and cards[1] == 8
    # The supplied chart does not add a 8,8 v 10 surrender departure. The
    # generic late-surrender baseline sees a hard 16 before it sees the pair,
    # so restore the chart's basic split before applying indexed departures.
    if pair_eights and dealer == 10 and can_split:
        return SPLIT
    if soft:
        if total == 19 and dealer == 4 and can_double and tc >= 3:
            return DOUBLE
        if total == 19 and dealer == 5 and can_double and tc >= 1:
            return DOUBLE
        return action
    # The chart's starred stand indices, applied only where this hand cannot
    # surrender. Standing on 15 or 16 against a ten or an ace is worth about
    # -0.53 to -0.61 per unit at every true count from -6 to +10, because a
    # ten-rich shoe leaves the dealer fewer stiff hands to bust with, so it
    # never overtakes the flat -0.50 of surrendering. Letting the star displace
    # the surrender costs about 0.044 points of flat-bet edge, and about 0.25
    # units per 100 rounds on a 1-12 ramp because the loss lands entirely at
    # positive counts. Measured by `priceCell` in
    # ../blackjack/lib/blackjack/deviationEv.ts; see
    # ../blackjack/docs/reference-analysis.md.
    if not can_surrender:
        if total == 16 and dealer == 9 and tc >= 4:
            return STAND
        if total == 16 and dealer == 10 and tc >= 0:
            return STAND
        if total == 16 and dealer == 1 and tc >= 3:
            return STAND
        if total == 15 and dealer == 10 and tc >= 4:
            return STAND
        if total == 15 and dealer == 1 and tc >= 5:
            return STAND
    # The chart's indexed surrender rows replace CountLab's broader static
    # late-surrender baseline for these two decisions.
    if total == 16 and dealer == 9 and tc < -1:
        return HIT
    if total == 15 and dealer == 10 and tc < 0:
        return HIT
    if can_surrender:
        if total == 17 and dealer == 1:
            return SURRENDER
        if total == 16 and dealer in (10, 1):
            return SURRENDER
        if total == 15 and dealer == 1:
            return SURRENDER
        if pair_eights and dealer == 1:
            return SURRENDER
        if total == 16 and dealer == 8 and tc >= 4:
            return SURRENDER
        if total == 16 and dealer == 9 and tc >= -1:
            return SURRENDER
        if total == 15 and dealer == 9 and tc >= 2:
            return SURRENDER
        if total == 15 and dealer == 10 and tc >= 0:
            return SURRENDER
    # Two-sided cells: basic strategy already plays the departure at TC 0, so the
    # index marks where the play reverts below it.
    if total == 13 and dealer == 2:
        return STAND if tc >= -1 else HIT
    if total == 12 and dealer == 2 and tc >= 3:
        return STAND
    if total == 12 and dealer == 3 and tc >= 2:
        return STAND
    if total == 12 and dealer == 4:
        return STAND if tc >= 0 else HIT
    if total == 12 and dealer == 5:
        return STAND if tc >= -2 else HIT
    if total == 11 and dealer == 1:
        return DOUBLE if can_double and tc >= -1 else HIT
    if total == 10 and dealer == 10 and can_double and tc >= 7:
        return DOUBLE
    if total == 10 and dealer == 1 and can_double and tc >= 3:
        return DOUBLE
    if total == 9 and dealer == 2 and can_double and tc >= 1:
        return DOUBLE
    if total == 9 and dealer == 7 and can_double and tc >= 3:
        return DOUBLE
    if total == 8 and dealer == 5 and can_double and tc >= 4:
        return DOUBLE
    if total == 8 and dealer == 6 and can_double and tc >= 2:
        return DOUBLE
    if pair_tens and can_split:
        if dealer == 4 and tc >= 6:
            return SPLIT
        if dealer == 5 and tc >= 5:
            return SPLIT
        if dealer == 6 and tc >= 4:
            return SPLIT
    return action


@njit(cache=True)
def play_player(first: int, second: int, dealer: int, shoe: np.ndarray, position: int, running_count: int, policy: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, int, int, int, bool]:
    cards = np.zeros((4, 12), dtype=np.int8)
    counts = np.zeros(4, dtype=np.int8)
    bets = np.ones(4, dtype=np.int8)
    surrendered = np.zeros(4, dtype=np.int8)
    ace_split = np.zeros(4, dtype=np.int8)
    cards[0, 0], cards[0, 1], counts[0] = first, second, 2
    hands = 1
    index = 0
    original_blackjack = (first == 1 and second == 10) or (first == 10 and second == 1)
    while index < hands:
        count = int(counts[index])
        total, _ = hand_value(cards[index], count)
        if total > 21:
            index += 1
            continue
        pair = count == 2 and cards[index, 0] == cards[index, 1]
        can_split = pair and hands < 4
        tc = int(math.floor((running_count * 52.0) / (len(shoe) - position + 1)))
        can_surrender = index == 0 and hands == 1 and count == 2
        action = h17_pro_pro_action(cards[index], count, dealer, can_split, count == 2, can_surrender, ace_split[index] == 1, tc)
        if action == SPLIT and can_split:
            rank = int(cards[index, 0])
            next_index = hands
            hands += 1
            cards[index, 0] = rank
            cards[index, 1] = shoe[position]
            running_count += hilo(int(shoe[position]))
            position += 1
            counts[index] = 2
            cards[next_index, 0] = rank
            cards[next_index, 1] = shoe[position]
            running_count += hilo(int(shoe[position]))
            position += 1
            counts[next_index] = 2
            if rank == 1:
                ace_split[index] = 1
                ace_split[next_index] = 1
            original_blackjack = False
            continue
        if action == SURRENDER:
            surrendered[index] = 1
            index += 1
            continue
        if action == DOUBLE and count == 2:
            cards[index, count] = shoe[position]
            running_count += hilo(int(shoe[position]))
            position += 1
            counts[index] += 1
            bets[index] = 2
            index += 1
            continue
        if action == HIT:
            cards[index, count] = shoe[position]
            running_count += hilo(int(shoe[position]))
            position += 1
            counts[index] += 1
            continue
        index += 1
    needs_dealer = False
    for hand in range(hands):
        total, _ = hand_value(cards[hand], int(counts[hand]))
        natural = original_blackjack and hand == 0 and hands == 1
        if surrendered[hand] == 0 and total <= 21 and not natural:
            needs_dealer = True
    return cards, counts, bets, surrendered, hands, position, running_count, needs_dealer


@njit(cache=True)
def settle(cards: np.ndarray, counts: np.ndarray, bets: np.ndarray, surrendered: np.ndarray, hands: int, dealer_total: int, dealer_bust: bool, original_blackjack: bool) -> float:
    profit = 0.0
    for hand in range(hands):
        bet = float(bets[hand])
        if surrendered[hand] == 1:
            profit -= 0.5
            continue
        total, _ = hand_value(cards[hand], int(counts[hand]))
        if total > 21:
            profit -= bet
        elif original_blackjack and hands == 1 and hand == 0:
            profit += 1.5
        elif dealer_bust or total > dealer_total:
            profit += bet
        elif total < dealer_total:
            profit -= bet
    return profit


@njit(cache=True)
def simulate_task(decks: int, dealt_decks: float, shoes: int, seed: int, policy: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, int]:
    np.random.seed(seed)
    total_cards = decks * 52
    cut_position = int(round(dealt_decks * 52.0))
    shoe = np.empty(total_cards, dtype=np.int8)
    cursor = 0
    for _ in range(decks):
        for rank in range(1, 10):
            for _ in range(4):
                shoe[cursor] = rank
                cursor += 1
        for _ in range(16):
            shoe[cursor] = 10
            cursor += 1
    counts = np.zeros(BUCKETS, dtype=np.int64)
    sums = np.zeros(BUCKETS, dtype=np.float64)
    squares = np.zeros(BUCKETS, dtype=np.float64)
    rounds = 0
    for _ in range(shoes):
        np.random.shuffle(shoe)
        position = 0
        running_count = 0
        while position < cut_position:
            start_bucket = bucket_index(running_count, total_cards - position)
            first = int(shoe[position]); position += 1; running_count += hilo(first)
            dealer_up = int(shoe[position]); position += 1; running_count += hilo(dealer_up)
            second = int(shoe[position]); position += 1; running_count += hilo(second)
            dealer_hole = int(shoe[position]); position += 1
            dealer_blackjack = (dealer_up == 1 and dealer_hole == 10) or (dealer_up == 10 and dealer_hole == 1)
            hero_blackjack = (first == 1 and second == 10) or (first == 10 and second == 1)
            tc = int(math.floor((running_count * 52.0) / (len(shoe) - position + 1)))
            take_insurance = policy == H17_PRO_POLICY and dealer_up == 1 and tc >= 3
            if dealer_blackjack:
                running_count += hilo(dealer_hole)
                profit = (0.0 if hero_blackjack else -1.0) + (1.0 if take_insurance else 0.0)
            else:
                cards, hand_counts, bets, surrendered, hands, position, running_count, needs_dealer = play_player(first, second, dealer_up, shoe, position, running_count, policy)
                running_count += hilo(dealer_hole)
                dealer_cards = np.zeros(12, dtype=np.int8)
                dealer_cards[0], dealer_cards[1] = dealer_up, dealer_hole
                dealer_count = 2
                dealer_total, dealer_soft = hand_value(dealer_cards, dealer_count)
                if needs_dealer:
                    while dealer_total < 17 or (dealer_total == 17 and dealer_soft):
                        card = int(shoe[position]); position += 1
                        dealer_cards[dealer_count] = card; dealer_count += 1
                        running_count += hilo(card)
                        dealer_total, dealer_soft = hand_value(dealer_cards, dealer_count)
                profit = settle(cards, hand_counts, bets, surrendered, hands, dealer_total, dealer_total > 21, hero_blackjack) - (0.5 if take_insurance else 0.0)
            counts[start_bucket] += 1
            sums[start_bucket] += profit
            squares[start_bucket] += profit * profit
            rounds += 1
    return counts, sums, squares, rounds


@njit(parallel=True, cache=True)
def simulate_parallel(decks: int, dealt_decks: float, task_shoes: np.ndarray, seeds: np.ndarray, policy: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    tasks = len(task_shoes)
    counts = np.zeros((tasks, BUCKETS), dtype=np.int64)
    sums = np.zeros((tasks, BUCKETS), dtype=np.float64)
    squares = np.zeros((tasks, BUCKETS), dtype=np.float64)
    rounds = np.zeros(tasks, dtype=np.int64)
    for task in prange(tasks):
        c, s, q, r = simulate_task(decks, dealt_decks, int(task_shoes[task]), int(seeds[task]), policy)
        counts[task], sums[task], squares[task], rounds[task] = c, s, q, r
    return counts, sums, squares, rounds


def run_configuration(decks: int, dealt: float, shoes: int, tasks: int, seed: int, policy: int) -> dict:
    task_shoes, seeds = task_layout(shoes, tasks, seed, decks * 1000 + int(round(dealt * 100)) + 2_000_000)
    started = time.perf_counter()
    counts, sums, squares, rounds = simulate_parallel(decks, dealt, task_shoes, seeds, policy)
    result = summarize(counts, sums, squares)
    result.update(shoes=int(task_shoes.sum()), tasks=len(task_shoes), seed=seed, runtime_seconds=time.perf_counter() - started)
    result["rounds_per_second"] = result["rounds"] / result["runtime_seconds"]
    assert result["rounds"] == int(rounds.sum())
    return result


def merge_results(previous: dict, incoming: dict) -> dict:
    """Combine independent chunks without losing per-count sufficient statistics."""
    counts = np.array([[row["rounds"] + next_row["rounds"] for row, next_row in zip(previous["rows"], incoming["rows"])]], dtype=np.int64)
    sums = np.array([[row["profit_sum"] + next_row["profit_sum"] for row, next_row in zip(previous["rows"], incoming["rows"])]], dtype=np.float64)
    squares = np.array([[row["profit_square_sum"] + next_row["profit_square_sum"] for row, next_row in zip(previous["rows"], incoming["rows"])]], dtype=np.float64)
    result = summarize(counts, sums, squares)
    result.update(
        shoes=previous["shoes"] + incoming["shoes"],
        tasks=previous["tasks"] + incoming["tasks"],
        seed=incoming["seed"],
        runtime_seconds=previous["runtime_seconds"] + incoming["runtime_seconds"],
    )
    result["rounds_per_second"] = result["rounds"] / result["runtime_seconds"]
    return result


def write_typescript(payload: dict, destination: Path, symbol: str, generator_name: str) -> None:
    def number(value: float) -> str: return format(value, ".12g")
    metadata = payload["metadata"]
    lines = [
        f"// Generated by ../blackjack-simulator/{generator_name}.",
        "// Do not edit these coefficients by hand; regenerate the audited artifact.",
        'import type { RawCoefficient } from "./coefficients";',
        f"export const {symbol}_METADATA = {{",
        f'  generatedUtc: "{metadata["created_utc"]}",',
        f'  sourceSha256: "{metadata["source_sha256"]}",',
        f'  seed: {metadata["seed"]},',
        f'  shoesPerProfile: {metadata["requested_shoes_per_configuration"]},',
        f'  totalRounds: {sum(p["rounds"] for p in payload["profiles"].values())},',
        f'  model: "{metadata["model"]}",',
        "} as const;",
        f"export const {symbol}_COEFFICIENTS: Record<string, readonly RawCoefficient[]> = {{",
    ]
    for key, profile in payload["profiles"].items():
        lines.append(f'  "{key}": [')
        for row in profile["rows"]:
            lines.append("    [" + ", ".join((number(row["frequency"]), number(row["advantage"]), number(row["standard_deviation"]), str(row["rounds"]), number(row["standard_error"]))) + "],")
        lines.append("  ],")
    lines.extend(["};", ""])
    destination.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate CountLab H17 Pro coefficients")
    parser.add_argument("--shoes", type=int, default=100_000_000)
    parser.add_argument("--tasks", type=int, default=max(1, os.cpu_count() or 1))
    parser.add_argument("--seed", type=int, default=20260817)
    parser.add_argument("--policy", choices=("h17-pro",), default="h17-pro")
    parser.add_argument("--decks", type=int, choices=(6, 8))
    parser.add_argument("--dealt", type=float)
    parser.add_argument("--append", action="store_true", help="merge an independent chunk into an existing artifact")
    parser.add_argument("--target-shoes", type=int, help="with --append, run only enough shoes to reach this total per profile")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--typescript", type=Path, required=True)
    args = parser.parse_args()
    policy = H17_PRO_POLICY
    simulate_parallel(6, 4.5, np.array([1], dtype=np.int64), np.array([1], dtype=np.int64), policy)
    if (args.decks is None) != (args.dealt is None):
        parser.error("--decks and --dealt must be supplied together")
    profiles = {}
    if args.append and args.output.exists():
        profiles = json.loads(args.output.read_text(encoding="utf-8")).get("profiles", {})
    configurations = [(args.decks, args.dealt)] if args.decks is not None else [
        (decks, dealt) for decks, dealt_values in GAME_OPTIONS.items() for dealt in dealt_values
    ]
    for decks, dealt in configurations:
        key = f"{decks}-{dealt:g}"
        existing_shoes = profiles[key]["shoes"] if args.append and key in profiles else 0
        requested_shoes = args.shoes if args.target_shoes is None else min(args.shoes, max(0, args.target_shoes - existing_shoes))
        if requested_shoes == 0:
            print(f"Skipping {decks}D, {dealt:g} dealt; already has {existing_shoes:,} shoes.", flush=True)
            continue
        print(f"Simulating {decks}D, {dealt:g} dealt, {args.policy}, shoes={requested_shoes:,} ...", flush=True)
        result = run_configuration(decks, dealt, requested_shoes, args.tasks, args.seed, policy)
        profiles[key] = merge_results(profiles[key], result) if args.append and key in profiles else result
        complete = profiles[key]
        print(f"  {complete['rounds']:,} rounds in {complete['runtime_seconds']:.1f}s; EV {complete['mean']:+.6%} +/- {Z95 * complete['standard_error']:.6%} (95%)", flush=True)
    payload = {
        "metadata": {
            "created_utc": datetime.now(timezone.utc).isoformat(), "source_sha256": normalized_sha256(Path(__file__)),
            "git": git_metadata(), "python": platform.python_version(), "numpy": np.__version__, "numba": numba.__version__,
            "platform": platform.platform(), "cpu_count": os.cpu_count(), "requested_shoes_per_configuration": max(profile["shoes"] for profile in profiles.values()),
            "tasks": args.tasks, "seed": args.seed,
            "strategy": "CountLab H17/DAS/RSA/LS basic strategy plus the supplied H17 Pro 34-deviation chart, including insurance at TC +3",
            "model": "6/8 deck | H17 | DAS | RSA | LS | peek | 3:2 | one spot | H17 Pro 34 deviations | insurance TC +3",
        }, "profiles": profiles,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    args.typescript.parent.mkdir(parents=True, exist_ok=True)
    write_typescript(payload, args.typescript, "H17_PRO", Path(__file__).name)


if __name__ == "__main__":
    main()
