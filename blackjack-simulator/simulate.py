"""Reproducible Hi-Lo blackjack coefficient simulation.

Cards are ranks 1..10 (Ace is 1). Suits are immaterial to blackjack strategy.
The production kernel is intentionally self contained so that the result does
not depend on browser code or opaque third-party simulator files.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import platform
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import numba
import numpy as np
from numba import njit, prange

HIT, STAND, DOUBLE, SPLIT, SURRENDER = 0, 1, 2, 3, 4
BUCKETS = 17
Z95 = 1.959963984540054

GAME_OPTIONS = {
    6: (4.0, 4.5, 4.75, 5.0, 5.25),
    8: (5.5, 6.0, 6.5, 7.0),
}


def strategy_manifest() -> dict:
    """Human-readable strategy definition used by the compiled kernel."""
    return {
        "system": "Hi-Lo",
        "true_count": "floor(running_count / exact undealt decks), updated before every player decision",
        "insurance": "take at TC >= +3",
        "pair_departures": {"10,10 vs 5": ">= +5 split", "10,10 vs 6": ">= +4 split"},
        "hard_departures": {
            "16 vs 9": ">= +4 stand; otherwise late surrender",
            "16 vs 10": "late surrender",
            "15 vs 10": ">= +4 stand; TC 0..3 surrender; below 0 hit",
            "14 vs 10": ">= +3 surrender",
            "15 vs 9": ">= +2 surrender",
            "15 vs A": ">= -1 surrender",
            "13 vs 2": ">= -1 stand",
            "13 vs 3": ">= -2 stand",
            "12 vs 2": ">= +3 stand",
            "12 vs 3": ">= +2 stand",
            "12 vs 4": ">= 0 stand",
            "12 vs 5": ">= -2 stand",
            "12 vs 6": ">= -3 stand",
            "11 vs A": ">= 0 double",
            "10 vs 10": ">= +4 double",
            "10 vs A": ">= +3 double",
            "9 vs 2": ">= +1 double",
            "9 vs 7": ">= +3 double",
        },
        "always_late_surrender": ["10+7 vs A", "hard 16 vs 10 or A", "8,8 vs A"],
    }


@njit(cache=True)
def hilo(card: int) -> int:
    if 2 <= card <= 6:
        return 1
    if card == 1 or card == 10:
        return -1
    return 0


@njit(cache=True)
def hand_value(cards: np.ndarray, count: int) -> tuple[int, bool]:
    total = 0
    aces = 0
    for index in range(count):
        card = int(cards[index])
        if card == 1:
            aces += 1
            total += 1
        else:
            total += card
    soft = aces > 0 and total + 10 <= 21
    if soft:
        total += 10
    return total, soft


@njit(cache=True)
def floored_true_count(running_count: int, unseen_cards: int) -> int:
    if unseen_cards <= 0:
        return 0
    return int(math.floor((running_count * 52.0) / unseen_cards))


@njit(cache=True)
def bucket_index(running_count: int, unseen_cards: int) -> int:
    tc = floored_true_count(running_count, unseen_cards)
    if tc <= -8:
        return 0
    if tc >= 8:
        return 16
    return tc + 8


@njit(cache=True)
def choose_action(
    cards: np.ndarray,
    count: int,
    dealer: int,
    can_split: bool,
    can_double: bool,
    can_surrender: bool,
    split_aces: bool,
    tc: int,
    use_indices: bool,
) -> int:
    total, soft = hand_value(cards, count)
    pair = count == 2 and cards[0] == cards[1]
    pair_rank = int(cards[0]) if pair else 0

    # Late-surrender strategy and its count departures. Pair 8s retain their
    # composition-specific H17 decision instead of being treated as hard 16.
    if can_surrender:
        if pair_rank == 8 and dealer == 1:
            return SURRENDER
        if not soft:
            # For 4+ decks H17, 17 vs Ace is composition-dependent: surrender
            # 10+7, but stand on the other hard-17 compositions.
            if total == 17 and dealer == 1 and count == 2 and (
                (cards[0] == 10 and cards[1] == 7) or (cards[0] == 7 and cards[1] == 10)
            ):
                return SURRENDER
            if total == 16:
                if dealer == 1 or dealer == 10:
                    return SURRENDER
                if dealer == 9:
                    if use_indices and tc >= 4:
                        return STAND
                    return SURRENDER
            if total == 15:
                if dealer == 10:
                    if use_indices and tc >= 4:
                        return STAND
                    if not use_indices or tc >= 0:
                        return SURRENDER
                if dealer == 1:
                    if not use_indices or tc >= -1:
                        return SURRENDER
                if dealer == 9 and use_indices and tc >= 2:
                    return SURRENDER
            if total == 14 and dealer == 10 and use_indices and tc >= 3:
                return SURRENDER

    if pair and can_split:
        if pair_rank == 1:
            return SPLIT
        if pair_rank == 10:
            if use_indices and ((dealer == 5 and tc >= 5) or (dealer == 6 and tc >= 4)):
                return SPLIT
            return STAND
        if pair_rank == 9:
            return SPLIT if dealer in (2, 3, 4, 5, 6, 8, 9) else STAND
        if pair_rank == 8:
            return SPLIT
        if pair_rank == 7:
            return SPLIT if 2 <= dealer <= 7 else HIT
        if pair_rank == 6:
            return SPLIT if 2 <= dealer <= 6 else HIT
        if pair_rank == 4:
            return SPLIT if dealer in (5, 6) else HIT
        if pair_rank in (2, 3):
            return SPLIT if 2 <= dealer <= 7 else HIT
        # Pair 5s are played as hard 10 below.

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
            if dealer in (7, 8):
                return STAND
            return HIT
        if total == 17:
            if dealer in (3, 4, 5, 6):
                return DOUBLE if can_double else HIT
            return HIT
        if total in (15, 16):
            if dealer in (4, 5, 6):
                return DOUBLE if can_double else HIT
            return HIT
        if total in (13, 14):
            if dealer in (5, 6):
                return DOUBLE if can_double else HIT
            return HIT
        return HIT

    if total >= 17:
        return STAND
    if use_indices:
        if total == 16 and dealer == 9 and tc >= 4:
            return STAND
        if total == 16 and dealer == 10 and tc >= 0:
            return STAND
        if total == 15 and dealer == 10 and tc >= 4:
            return STAND
        if total == 13 and dealer == 2:
            return STAND if tc >= -1 else HIT
        if total == 13 and dealer == 3:
            return STAND if tc >= -2 else HIT
        if total == 12 and dealer == 2:
            return STAND if tc >= 3 else HIT
        if total == 12 and dealer == 3:
            return STAND if tc >= 2 else HIT
        if total == 12 and dealer == 4:
            return STAND if tc >= 0 else HIT
        if total == 12 and dealer == 5:
            return STAND if tc >= -2 else HIT
        if total == 12 and dealer == 6:
            return STAND if tc >= -3 else HIT
    if total >= 13:
        return STAND if 2 <= dealer <= 6 else HIT
    if total == 12:
        return STAND if 4 <= dealer <= 6 else HIT
    if total == 11:
        if dealer == 1 and use_indices and tc < 0:
            return HIT
        return DOUBLE if can_double else HIT
    if total == 10:
        if dealer == 10 and use_indices and tc >= 4:
            return DOUBLE if can_double else HIT
        if dealer == 1 and use_indices and tc >= 3:
            return DOUBLE if can_double else HIT
        return DOUBLE if 2 <= dealer <= 9 and can_double else HIT
    if total == 9:
        if dealer == 2 and use_indices and tc >= 1:
            return DOUBLE if can_double else HIT
        if dealer == 7 and use_indices and tc >= 3:
            return DOUBLE if can_double else HIT
        return DOUBLE if 3 <= dealer <= 6 and can_double else HIT
    return HIT


@njit(cache=True)
def play_player(
    first: int,
    second: int,
    dealer: int,
    shoe: np.ndarray,
    position: int,
    running_count: int,
    use_indices: bool,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, int, int, bool, bool]:
    cards = np.zeros((4, 12), dtype=np.int8)
    counts = np.zeros(4, dtype=np.int8)
    bets = np.ones(4, dtype=np.int8)
    surrendered = np.zeros(4, dtype=np.int8)
    ace_split = np.zeros(4, dtype=np.int8)
    cards[0, 0], cards[0, 1], counts[0] = first, second, 2
    hands = 1
    hand_index = 0
    original_blackjack = (first == 1 and second == 10) or (first == 10 and second == 1)

    while hand_index < hands:
        count = int(counts[hand_index])
        total, _ = hand_value(cards[hand_index], count)
        if total > 21:
            hand_index += 1
            continue
        pair = count == 2 and cards[hand_index, 0] == cards[hand_index, 1]
        can_split = pair and hands < 4
        can_double = count == 2
        can_surrender = hand_index == 0 and hands == 1 and count == 2
        tc = floored_true_count(running_count, len(shoe) - position)
        action = choose_action(
            cards[hand_index], count, dealer, can_split, can_double,
            can_surrender, ace_split[hand_index] == 1, tc, use_indices,
        )
        if action == SPLIT and can_split:
            rank = int(cards[hand_index, 0])
            new_index = hands
            hands += 1
            cards[hand_index, 0] = rank
            cards[hand_index, 1] = shoe[position]
            running_count += hilo(int(shoe[position]))
            position += 1
            counts[hand_index] = 2
            cards[new_index, 0] = rank
            cards[new_index, 1] = shoe[position]
            running_count += hilo(int(shoe[position]))
            position += 1
            counts[new_index] = 2
            if rank == 1:
                ace_split[hand_index] = 1
                ace_split[new_index] = 1
            original_blackjack = False
            continue
        if action == SURRENDER:
            surrendered[hand_index] = 1
            hand_index += 1
            continue
        if action == DOUBLE and can_double:
            cards[hand_index, count] = shoe[position]
            running_count += hilo(int(shoe[position]))
            position += 1
            counts[hand_index] += 1
            bets[hand_index] = 2
            hand_index += 1
            continue
        if action == HIT:
            cards[hand_index, count] = shoe[position]
            running_count += hilo(int(shoe[position]))
            position += 1
            counts[hand_index] += 1
            continue
        hand_index += 1

    needs_dealer = False
    for index in range(hands):
        total, _ = hand_value(cards[index], int(counts[index]))
        is_natural = original_blackjack and index == 0 and hands == 1
        if surrendered[index] == 0 and total <= 21 and not is_natural:
            needs_dealer = True
    return cards, counts, bets, surrendered, hands, position, running_count, needs_dealer


@njit(cache=True)
def settle_player(
    cards: np.ndarray,
    counts: np.ndarray,
    bets: np.ndarray,
    surrendered: np.ndarray,
    hands: int,
    dealer_total: int,
    dealer_bust: bool,
    original_blackjack: bool,
) -> float:
    profit = 0.0
    for index in range(hands):
        bet = float(bets[index])
        if surrendered[index] == 1:
            profit -= 0.5
            continue
        total, _ = hand_value(cards[index], int(counts[index]))
        if total > 21:
            profit -= bet
        elif original_blackjack and hands == 1 and index == 0:
            profit += 1.5
        elif dealer_bust or total > dealer_total:
            profit += bet
        elif total < dealer_total:
            profit -= bet
    return profit


@njit(cache=True)
def simulate_task(
    decks: int,
    dealt_decks: float,
    shoes: int,
    seed: int,
    use_indices: bool,
    spots: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, int]:
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

    bucket_counts = np.zeros(BUCKETS, dtype=np.int64)
    profit_sums = np.zeros(BUCKETS, dtype=np.float64)
    square_sums = np.zeros(BUCKETS, dtype=np.float64)
    rounds = 0

    for _ in range(shoes):
        np.random.shuffle(shoe)
        position = 0
        running_count = 0
        while position < cut_position:
            start_bucket = bucket_index(running_count, total_cards - position)
            initial = np.empty((spots, 2), dtype=np.int8)
            dealer_up = 0
            dealer_hole = 0
            for pass_index in range(2):
                for player in range(spots):
                    card = int(shoe[position])
                    position += 1
                    initial[player, pass_index] = card
                    running_count += hilo(card)
                card = int(shoe[position])
                position += 1
                if pass_index == 0:
                    dealer_up = card
                    running_count += hilo(card)
                else:
                    dealer_hole = card

            decision_tc = floored_true_count(running_count, total_cards - position)
            insured = use_indices and dealer_up == 1 and decision_tc >= 3
            dealer_blackjack = (dealer_up == 1 and dealer_hole == 10) or (dealer_up == 10 and dealer_hole == 1)
            hero_blackjack = (initial[0, 0] == 1 and initial[0, 1] == 10) or (initial[0, 0] == 10 and initial[0, 1] == 1)
            profit = 0.0

            if dealer_blackjack:
                running_count += hilo(dealer_hole)
                profit = 0.0 if hero_blackjack else -1.0
                if insured:
                    profit += 1.0
            else:
                if insured:
                    profit -= 0.5
                hero_cards = np.zeros((4, 12), dtype=np.int8)
                hero_counts = np.zeros(4, dtype=np.int8)
                hero_bets = np.ones(4, dtype=np.int8)
                hero_surrendered = np.zeros(4, dtype=np.int8)
                hero_hands = 1
                anyone_needs_dealer = False
                for player in range(spots):
                    result = play_player(
                        int(initial[player, 0]), int(initial[player, 1]), dealer_up,
                        shoe, position, running_count, use_indices if player == 0 else False,
                    )
                    cards, counts, bets, surrendered, hands, position, running_count, needs_dealer = result
                    if player == 0:
                        hero_cards, hero_counts = cards, counts
                        hero_bets, hero_surrendered = bets, surrendered
                        hero_hands = hands
                    if needs_dealer:
                        anyone_needs_dealer = True

                running_count += hilo(dealer_hole)
                dealer_cards = np.zeros(12, dtype=np.int8)
                dealer_cards[0], dealer_cards[1] = dealer_up, dealer_hole
                dealer_count = 2
                dealer_total, dealer_soft = hand_value(dealer_cards, dealer_count)
                if anyone_needs_dealer:
                    while dealer_total < 17 or (dealer_total == 17 and dealer_soft):
                        card = int(shoe[position])
                        position += 1
                        dealer_cards[dealer_count] = card
                        dealer_count += 1
                        running_count += hilo(card)
                        dealer_total, dealer_soft = hand_value(dealer_cards, dealer_count)
                profit += settle_player(
                    hero_cards, hero_counts, hero_bets, hero_surrendered,
                    hero_hands, dealer_total, dealer_total > 21, hero_blackjack,
                )

            bucket_counts[start_bucket] += 1
            profit_sums[start_bucket] += profit
            square_sums[start_bucket] += profit * profit
            rounds += 1
    return bucket_counts, profit_sums, square_sums, rounds


@njit(parallel=True, cache=True)
def simulate_parallel(
    decks: int,
    dealt_decks: float,
    task_shoes: np.ndarray,
    seeds: np.ndarray,
    use_indices: bool,
    spots: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    tasks = len(task_shoes)
    counts = np.zeros((tasks, BUCKETS), dtype=np.int64)
    sums = np.zeros((tasks, BUCKETS), dtype=np.float64)
    squares = np.zeros((tasks, BUCKETS), dtype=np.float64)
    rounds = np.zeros(tasks, dtype=np.int64)
    for task in prange(tasks):
        c, s, q, r = simulate_task(
            decks, dealt_decks, int(task_shoes[task]), int(seeds[task]), use_indices, spots,
        )
        counts[task] = c
        sums[task] = s
        squares[task] = q
        rounds[task] = r
    return counts, sums, squares, rounds


def task_layout(total_shoes: int, tasks: int, seed: int, config_key: int) -> tuple[np.ndarray, np.ndarray]:
    tasks = min(tasks, total_shoes)
    shoes = np.full(tasks, total_shoes // tasks, dtype=np.int64)
    shoes[: total_shoes % tasks] += 1
    sequence = np.random.SeedSequence(seed, spawn_key=(config_key,))
    children = sequence.spawn(tasks)
    seeds = np.array([int(child.generate_state(1, dtype=np.uint32)[0]) for child in children], dtype=np.int64)
    return shoes, seeds


def summarize(counts: np.ndarray, sums: np.ndarray, squares: np.ndarray) -> dict:
    counts = counts.sum(axis=0)
    sums = sums.sum(axis=0)
    squares = squares.sum(axis=0)
    total = int(counts.sum())
    rows = []
    for index in range(BUCKETS):
        n = int(counts[index])
        mean = float(sums[index] / n) if n else 0.0
        variance = float((squares[index] - sums[index] * sums[index] / n) / (n - 1)) if n > 1 else 0.0
        sd = math.sqrt(max(0.0, variance))
        se = sd / math.sqrt(n) if n else 0.0
        rows.append({
            "true_count": index - 8,
            "label": "<= -8" if index == 0 else ">= +8" if index == 16 else f"{index - 8:+d}",
            "rounds": n,
            "frequency": n / total,
            "advantage": mean,
            "standard_deviation": sd,
            "standard_error": se,
            "ci95": [mean - Z95 * se, mean + Z95 * se],
            "profit_sum": float(sums[index]),
            "profit_square_sum": float(squares[index]),
        })
    overall_mean = float(sums.sum() / total)
    overall_var = float((squares.sum() - sums.sum() ** 2 / total) / (total - 1))
    overall_sd = math.sqrt(max(0.0, overall_var))
    return {
        "rounds": total,
        "mean": overall_mean,
        "standard_deviation": overall_sd,
        "standard_error": overall_sd / math.sqrt(total),
        "ci95": [overall_mean - Z95 * overall_sd / math.sqrt(total), overall_mean + Z95 * overall_sd / math.sqrt(total)],
        "rows": rows,
    }


def run_configuration(
    decks: int,
    dealt: float,
    shoes: int,
    tasks: int,
    seed: int,
    use_indices: bool = True,
    spots: int = 1,
) -> dict:
    config_key = decks * 1000 + int(round(dealt * 100)) + (100_000 if use_indices else 0) + spots * 1_000_000
    task_shoes, seeds = task_layout(shoes, tasks, seed, config_key)
    started = time.perf_counter()
    counts, sums, squares, rounds = simulate_parallel(decks, dealt, task_shoes, seeds, use_indices, spots)
    result = summarize(counts, sums, squares)
    result["shoes"] = int(task_shoes.sum())
    result["tasks"] = len(task_shoes)
    result["seed"] = seed
    result["runtime_seconds"] = time.perf_counter() - started
    result["rounds_per_second"] = result["rounds"] / result["runtime_seconds"]
    assert result["rounds"] == int(rounds.sum())
    return result


def source_hash() -> str:
    return hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def git_metadata() -> dict:
    try:
        root = Path(__file__).resolve().parent.parent
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
        dirty = bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=root, text=True).strip())
        return {"commit": commit, "working_tree_dirty": dirty}
    except Exception:
        return {"commit": "unknown", "working_tree_dirty": None}


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate auditable CountLab blackjack coefficients")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--all", action="store_true", help="simulate all production deck/penetration profiles")
    group.add_argument("--validate", action="store_true", help="simulate the 6D 75%% game without indices")
    group.add_argument("--off-top", action="store_true", help="simulate only the first 6D round without indices")
    group.add_argument("--decks", type=int, choices=(6, 8), help="simulate one configuration")
    parser.add_argument("--dealt", type=float, help="decks dealt for a single configuration")
    parser.add_argument("--shoes", type=int, default=100_000, help="shoes per configuration")
    parser.add_argument("--tasks", type=int, default=max(1, os.cpu_count() or 1))
    parser.add_argument("--seed", type=int, default=20260813)
    parser.add_argument("--spots", type=int, default=1)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    # Compile before measuring individual configurations.
    simulate_parallel(6, 4.5, np.array([1], dtype=np.int64), np.array([1], dtype=np.int64), True, args.spots)
    profiles = [(6, 0.01, False)] if args.off_top else [(6, 4.5, False)] if args.validate else (
        [(d, dealt, True) for d, values in GAME_OPTIONS.items() for dealt in values]
        if args.all else [(args.decks, args.dealt, True)]
    )
    if not args.all and not args.validate and not args.off_top and args.dealt is None:
        parser.error("--dealt is required with --decks")

    results = {}
    for decks, dealt, indices in profiles:
        print(f"Simulating {decks}D, {dealt:g} dealt, indices={indices}, shoes={args.shoes:,} ...", flush=True)
        result = run_configuration(decks, dealt, args.shoes, args.tasks, args.seed, indices, args.spots)
        key = f"{decks}-{dealt:g}"
        results[key] = result
        print(
            f"  {result['rounds']:,} rounds in {result['runtime_seconds']:.1f}s; "
            f"EV {result['mean']:+.6%} ± {Z95 * result['standard_error']:.6%} (95%); "
            f"SD {result['standard_deviation']:.6f}",
            flush=True,
        )

    payload = {
        "metadata": {
            "created_utc": datetime.now(timezone.utc).isoformat(),
            "source_sha256": source_hash(),
            "git": git_metadata(),
            "python": platform.python_version(),
            "numpy": np.__version__,
            "numba": numba.__version__,
            "platform": platform.platform(),
            "cpu_count": os.cpu_count(),
            "requested_shoes_per_configuration": args.shoes,
            "tasks": args.tasks,
            "seed": args.seed,
            "spots": args.spots,
            "strategy": strategy_manifest(),
        },
        "profiles": results,
    }
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
