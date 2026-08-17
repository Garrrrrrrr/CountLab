"""Test the independent-rounds assumption behind the app's risk-of-ruin figure.

`advantage.ts` builds variance per round from the per-true-count coefficients and
then treats rounds as independent draws from the true-count distribution, so the
variance of N rounds is just N x (variance of one round). Risk of ruin follows
from that via the diffusion formula exp(-2 * B * mu / sigma^2).

Real shoes are not independent draws. The true count is strongly autocorrelated
inside a shoe: if you are at TC +5 now you are probably still high next round, so
a ramped bettor's big wagers arrive in runs rather than scattered at random. That
clustering does not change EV per round, but it can inflate the variance of the
bankroll over a block of rounds -- and understated variance means understated
risk of ruin.

This script plays a real ramped bettor through real shuffled shoes and compares:

    measured  Var(profit over one whole shoe)
    predicted rounds_per_shoe x Var(profit over one round)

A ratio above 1 means the independent-rounds model understates real variance by
that factor. It reuses the audited kernel primitives from `simulate.py` without
editing that file, so the provenance hashes recorded in the production artifacts
stay valid.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import platform
from datetime import datetime, timezone
from pathlib import Path

import numba
import numpy as np
from numba import njit, prange

from simulate import (
    BUCKETS,
    bucket_index,
    floored_true_count,
    hand_value,
    hilo,
    play_player,
    settle_player,
    strategy_manifest,
)


def normalized_sha256(path: Path) -> str:
    """SHA-256 with line endings normalized to LF, so the recorded provenance
    hash does not depend on the checkout's line-ending conversion."""
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


@njit(cache=True)
def simulate_ramp_task(
    decks: int,
    dealt_decks: float,
    shoes: int,
    seed: int,
    units: np.ndarray,
    use_indices: bool,
) -> tuple[float, float, float, float, np.int64, np.int64, np.ndarray, np.ndarray, np.ndarray]:
    """Play `shoes` shoes with a per-true-count bet ramp.

    Returns round-level and shoe-level profit moments, plus per-bucket tallies so
    the run can be reconciled against the production coefficients.
    """
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

    round_sum = 0.0
    round_square = 0.0
    shoe_sum = 0.0
    shoe_square = 0.0
    rounds = 0
    played = 0
    bucket_counts = np.zeros(BUCKETS, dtype=np.int64)
    bucket_sums = np.zeros(BUCKETS, dtype=np.float64)
    bucket_squares = np.zeros(BUCKETS, dtype=np.float64)

    for _ in range(shoes):
        np.random.shuffle(shoe)
        position = 0
        running_count = 0
        shoe_profit = 0.0
        while position < cut_position:
            start_bucket = bucket_index(running_count, total_cards - position)
            wager = units[start_bucket]

            initial = np.empty((1, 2), dtype=np.int8)
            dealer_up = 0
            dealer_hole = 0
            for pass_index in range(2):
                card = int(shoe[position])
                position += 1
                initial[0, pass_index] = card
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
            dealer_blackjack = (dealer_up == 1 and dealer_hole == 10) or (
                dealer_up == 10 and dealer_hole == 1
            )
            hero_blackjack = (initial[0, 0] == 1 and initial[0, 1] == 10) or (
                initial[0, 0] == 10 and initial[0, 1] == 1
            )
            unit_profit = 0.0

            if dealer_blackjack:
                running_count += hilo(dealer_hole)
                unit_profit = 0.0 if hero_blackjack else -1.0
                if insured:
                    unit_profit += 1.0
            else:
                if insured:
                    unit_profit -= 0.5
                result = play_player(
                    int(initial[0, 0]), int(initial[0, 1]), dealer_up,
                    shoe, position, running_count, use_indices,
                )
                cards, counts, bets, surrendered, hands, position, running_count, needs_dealer = result
                running_count += hilo(dealer_hole)
                dealer_cards = np.zeros(12, dtype=np.int8)
                dealer_cards[0], dealer_cards[1] = dealer_up, dealer_hole
                dealer_count = 2
                dealer_total, dealer_soft = hand_value(dealer_cards, dealer_count)
                if needs_dealer:
                    while dealer_total < 17 or (dealer_total == 17 and dealer_soft):
                        card = int(shoe[position])
                        position += 1
                        dealer_cards[dealer_count] = card
                        dealer_count += 1
                        running_count += hilo(card)
                        dealer_total, dealer_soft = hand_value(dealer_cards, dealer_count)
                unit_profit += settle_player(
                    cards, counts, bets, surrendered, hands,
                    dealer_total, dealer_total > 21, hero_blackjack,
                )

            # Money staked scales the unit result by the ramp's wager.
            profit = unit_profit * wager
            shoe_profit += profit
            round_sum += profit
            round_square += profit * profit
            rounds += 1
            if wager > 0.0:
                played += 1
            bucket_counts[start_bucket] += 1
            bucket_sums[start_bucket] += unit_profit
            bucket_squares[start_bucket] += unit_profit * unit_profit
        shoe_sum += shoe_profit
        shoe_square += shoe_profit * shoe_profit

    return (
        round_sum, round_square, shoe_sum, shoe_square,
        rounds, played, bucket_counts, bucket_sums, bucket_squares,
    )


@njit(parallel=True, cache=True)
def simulate_ramp_parallel(
    decks: int,
    dealt_decks: float,
    task_shoes: np.ndarray,
    seeds: np.ndarray,
    units: np.ndarray,
    use_indices: bool,
):
    tasks = len(task_shoes)
    round_sums = np.zeros(tasks, dtype=np.float64)
    round_squares = np.zeros(tasks, dtype=np.float64)
    shoe_sums = np.zeros(tasks, dtype=np.float64)
    shoe_squares = np.zeros(tasks, dtype=np.float64)
    rounds = np.zeros(tasks, dtype=np.int64)
    played = np.zeros(tasks, dtype=np.int64)
    counts = np.zeros((tasks, BUCKETS), dtype=np.int64)
    sums = np.zeros((tasks, BUCKETS), dtype=np.float64)
    squares = np.zeros((tasks, BUCKETS), dtype=np.float64)
    for task in prange(tasks):
        a, b, c, d, e, f, g, h, i = simulate_ramp_task(
            decks, dealt_decks, int(task_shoes[task]), int(seeds[task]), units, use_indices,
        )
        round_sums[task] = a
        round_squares[task] = b
        shoe_sums[task] = c
        shoe_squares[task] = d
        rounds[task] = e
        played[task] = f
        counts[task] = g
        sums[task] = h
        squares[task] = i
    return round_sums, round_squares, shoe_sums, shoe_squares, rounds, played, counts, sums, squares


def task_layout(total_shoes: int, tasks: int, seed: int):
    tasks = min(tasks, total_shoes)
    shoes = np.full(tasks, total_shoes // tasks, dtype=np.int64)
    shoes[: total_shoes % tasks] += 1
    sequence = np.random.SeedSequence(seed)
    seeds = np.array(
        [int(child.generate_state(1, dtype=np.uint32)[0]) for child in sequence.spawn(tasks)],
        dtype=np.int64,
    )
    return shoes, seeds


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compare real-shoe ramped variance against the independent-rounds model",
    )
    parser.add_argument("--decks", type=int, default=6, choices=(6, 8))
    parser.add_argument("--dealt", type=float, default=4.5)
    parser.add_argument("--shoes", type=int, default=4_000_000)
    parser.add_argument("--tasks", type=int, default=max(1, os.cpu_count() or 1))
    parser.add_argument("--seed", type=int, default=20260818)
    parser.add_argument("--no-indices", action="store_true")
    parser.add_argument(
        "--units", type=float, nargs=17, required=True,
        help="bet in units for true counts -8..+8, in order",
    )
    parser.add_argument("--bankroll-units", type=float, default=600.0,
                        help="bankroll expressed in betting units, for the risk-of-ruin comparison")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    units = np.array(args.units, dtype=np.float64)
    use_indices = not args.no_indices

    simulate_ramp_parallel(
        6, 4.5, np.array([1], dtype=np.int64), np.array([1], dtype=np.int64), units, use_indices,
    )

    task_shoes, seeds = task_layout(args.shoes, args.tasks, args.seed)
    print(f"Playing {args.shoes:,} shoes of {args.decks}D, {args.dealt:g} dealt ...", flush=True)
    arrays = simulate_ramp_parallel(args.decks, args.dealt, task_shoes, seeds, units, use_indices)
    round_sums, round_squares, shoe_sums, shoe_squares, rounds_arr, played_arr, counts, sums, squares = arrays

    rounds = int(rounds_arr.sum())
    played = int(played_arr.sum())
    shoes = int(task_shoes.sum())
    round_sum = float(round_sums.sum())
    round_square = float(round_squares.sum())
    shoe_sum = float(shoe_sums.sum())
    shoe_square = float(shoe_squares.sum())

    round_mean = round_sum / rounds
    round_var = (round_square - round_sum * round_sum / rounds) / (rounds - 1)
    shoe_mean = shoe_sum / shoes
    shoe_var = (shoe_square - shoe_sum * shoe_sum / shoes) / (shoes - 1)
    rounds_per_shoe = rounds / shoes

    predicted_shoe_var = rounds_per_shoe * round_var
    ratio = shoe_var / predicted_shoe_var

    bankroll = args.bankroll_units
    ror_independent = math.exp(-2.0 * bankroll * round_mean / round_var) if round_mean > 0 else 1.0
    ror_clustered = (
        math.exp(-2.0 * bankroll * round_mean / (round_var * ratio)) if round_mean > 0 else 1.0
    )

    print(f"  rounds {rounds:,} in {shoes:,} shoes ({rounds_per_shoe:.2f} per shoe)")
    print(f"  played fraction        {played / rounds:.4%}")
    print(f"  EV per round           {round_mean:+.6f} units")
    print(f"  SD per round           {math.sqrt(round_var):.6f} units")
    print()
    print(f"  Var per shoe, measured   {shoe_var:.4f}")
    print(f"  Var per shoe, if rounds  {predicted_shoe_var:.4f}   (independent-rounds model)")
    print(f"  ratio                    {ratio:.4f}")
    print()
    print(f"  risk of ruin on {bankroll:g} units, independent-rounds model  {ror_independent:.2%}")
    print(f"  risk of ruin using the measured clustered variance           {ror_clustered:.2%}")

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps({
            "metadata": {
                "created_utc": datetime.now(timezone.utc).isoformat(),
                "source_sha256": normalized_sha256(Path(__file__)),
                "simulate_source_sha256": normalized_sha256(Path(__file__).parent / "simulate.py"),
                "python": platform.python_version(),
                "numpy": np.__version__,
                "numba": numba.__version__,
                "decks": args.decks,
                "dealt": args.dealt,
                "shoes": shoes,
                "seed": args.seed,
                "units": list(args.units),
                "use_indices": use_indices,
                "strategy": strategy_manifest(),
            },
            "rounds": rounds,
            "played": played,
            "rounds_per_shoe": rounds_per_shoe,
            "round_mean": round_mean,
            "round_variance": round_var,
            "shoe_variance_measured": shoe_var,
            "shoe_variance_independent_model": predicted_shoe_var,
            "variance_ratio": ratio,
            "bankroll_units": bankroll,
            "risk_of_ruin_independent": ror_independent,
            "risk_of_ruin_clustered": ror_clustered,
            "bucket_rounds": counts.sum(axis=0).tolist(),
        }, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
