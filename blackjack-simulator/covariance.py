"""Measure the covariance between simultaneous hands played by one player.

`simulate.py` produces the audited per-true-count coefficients from a
single-spot game, so it can report the variance of ONE hand but says nothing
about how two or three hands played side by side at the same table co-vary.
They are not independent: every hero hand is settled against the same dealer
hand, so they win and lose together far more often than chance.

This script reuses the audited kernel primitives from `simulate.py` without
modifying that file (its SHA-256 is recorded in the exported coefficients), and
measures, per true-count bucket:

    v    = variance of a single hero hand
    V(n) = variance of the SUM of the n hero hands in a round
    c    = (V(n) - n*v) / (n*(n-1))          pairwise covariance
    rho  = c / v                             pairwise correlation

The application models n hands as conditionally independent, i.e. V(n) = n*v.
The correct relation is V(n) = n*v*(1 + (n-1)*rho). `rho` measured here is what
the TypeScript variance model needs to stop understating risk.
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

from simulate import (
    BUCKETS,
    Z95,
    bucket_index,
    floored_true_count,
    hand_value,
    hilo,
    play_player,
    settle_player,
    strategy_manifest,
)

MAX_SPOTS = 4


def normalized_sha256(path: Path) -> str:
    """SHA-256 of a source file with line endings normalized to LF.

    Git checks these files out with CRLF on Windows, so hashing the raw bytes
    would record a different provenance hash depending on the machine that ran
    the measurement. Normalizing keeps the recorded hash comparable to the
    values stored alongside the production coefficients.
    """
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


@njit(cache=True)
def simulate_covariance_task(
    decks: int,
    dealt_decks: float,
    shoes: int,
    seed: int,
    hero_spots: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, int]:
    """One worker. Every seat belongs to the hero and plays full indices.

    Returns per-bucket (rounds, sum of per-seat profit, sum of per-seat
    profit^2, sum of round totals, sum of round totals^2).
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

    bucket_counts = np.zeros(BUCKETS, dtype=np.int64)
    seat_sums = np.zeros(BUCKETS, dtype=np.float64)
    seat_squares = np.zeros(BUCKETS, dtype=np.float64)
    total_sums = np.zeros(BUCKETS, dtype=np.float64)
    total_squares = np.zeros(BUCKETS, dtype=np.float64)
    rounds = 0

    seat_profit = np.zeros(MAX_SPOTS, dtype=np.float64)

    for _ in range(shoes):
        np.random.shuffle(shoe)
        position = 0
        running_count = 0
        while position < cut_position:
            start_bucket = bucket_index(running_count, total_cards - position)
            initial = np.empty((hero_spots, 2), dtype=np.int8)
            dealer_up = 0
            dealer_hole = 0
            for pass_index in range(2):
                for player in range(hero_spots):
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
            insured = dealer_up == 1 and decision_tc >= 3
            dealer_blackjack = (dealer_up == 1 and dealer_hole == 10) or (
                dealer_up == 10 and dealer_hole == 1
            )
            for seat in range(hero_spots):
                seat_profit[seat] = 0.0

            if dealer_blackjack:
                running_count += hilo(dealer_hole)
                for seat in range(hero_spots):
                    natural = (initial[seat, 0] == 1 and initial[seat, 1] == 10) or (
                        initial[seat, 0] == 10 and initial[seat, 1] == 1
                    )
                    profit = 0.0 if natural else -1.0
                    if insured:
                        profit += 1.0
                    seat_profit[seat] = profit
            else:
                all_cards = np.zeros((MAX_SPOTS, 4, 12), dtype=np.int8)
                all_counts = np.zeros((MAX_SPOTS, 4), dtype=np.int8)
                all_bets = np.ones((MAX_SPOTS, 4), dtype=np.int8)
                all_surrendered = np.zeros((MAX_SPOTS, 4), dtype=np.int8)
                all_hands = np.ones(MAX_SPOTS, dtype=np.int64)
                naturals = np.zeros(MAX_SPOTS, dtype=np.int8)
                anyone_needs_dealer = False
                for seat in range(hero_spots):
                    if insured:
                        seat_profit[seat] -= 0.5
                    naturals[seat] = 1 if (
                        (initial[seat, 0] == 1 and initial[seat, 1] == 10)
                        or (initial[seat, 0] == 10 and initial[seat, 1] == 1)
                    ) else 0
                    result = play_player(
                        int(initial[seat, 0]), int(initial[seat, 1]), dealer_up,
                        shoe, position, running_count, True,
                    )
                    cards, counts, bets, surrendered, hands, position, running_count, needs_dealer = result
                    all_cards[seat] = cards
                    all_counts[seat] = counts
                    all_bets[seat] = bets
                    all_surrendered[seat] = surrendered
                    all_hands[seat] = hands
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
                for seat in range(hero_spots):
                    seat_profit[seat] += settle_player(
                        all_cards[seat], all_counts[seat], all_bets[seat],
                        all_surrendered[seat], int(all_hands[seat]),
                        dealer_total, dealer_total > 21, naturals[seat] == 1,
                    )

            total = 0.0
            for seat in range(hero_spots):
                value = seat_profit[seat]
                total += value
                seat_sums[start_bucket] += value
                seat_squares[start_bucket] += value * value
            bucket_counts[start_bucket] += 1
            total_sums[start_bucket] += total
            total_squares[start_bucket] += total * total
            rounds += 1
    return bucket_counts, seat_sums, seat_squares, total_sums, total_squares, rounds


@njit(parallel=True, cache=True)
def simulate_covariance_parallel(
    decks: int,
    dealt_decks: float,
    task_shoes: np.ndarray,
    seeds: np.ndarray,
    hero_spots: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    tasks = len(task_shoes)
    counts = np.zeros((tasks, BUCKETS), dtype=np.int64)
    seat_sums = np.zeros((tasks, BUCKETS), dtype=np.float64)
    seat_squares = np.zeros((tasks, BUCKETS), dtype=np.float64)
    total_sums = np.zeros((tasks, BUCKETS), dtype=np.float64)
    total_squares = np.zeros((tasks, BUCKETS), dtype=np.float64)
    for task in prange(tasks):
        c, ss, sq, ts, tq, _ = simulate_covariance_task(
            decks, dealt_decks, int(task_shoes[task]), int(seeds[task]), hero_spots,
        )
        counts[task] = c
        seat_sums[task] = ss
        seat_squares[task] = sq
        total_sums[task] = ts
        total_squares[task] = tq
    return counts, seat_sums, seat_squares, total_sums, total_squares


def task_layout(total_shoes: int, tasks: int, seed: int, config_key: int):
    tasks = min(tasks, total_shoes)
    shoes = np.full(tasks, total_shoes // tasks, dtype=np.int64)
    shoes[: total_shoes % tasks] += 1
    sequence = np.random.SeedSequence(seed, spawn_key=(config_key,))
    children = sequence.spawn(tasks)
    seeds = np.array(
        [int(child.generate_state(1, dtype=np.uint32)[0]) for child in children],
        dtype=np.int64,
    )
    return shoes, seeds


def summarize(counts, seat_sums, seat_squares, total_sums, total_squares, spots: int) -> dict:
    counts = counts.sum(axis=0)
    seat_sums = seat_sums.sum(axis=0)
    seat_squares = seat_squares.sum(axis=0)
    total_sums = total_sums.sum(axis=0)
    total_squares = total_squares.sum(axis=0)

    def stats(rounds: int, s_sum: float, s_sq: float, t_sum: float, t_sq: float) -> dict:
        seats = rounds * spots
        if rounds < 2 or seats < 2:
            return {}
        seat_mean = s_sum / seats
        seat_var = (s_sq - s_sum * s_sum / seats) / (seats - 1)
        total_var = (t_sq - t_sum * t_sum / rounds) / (rounds - 1)
        covariance = (total_var - spots * seat_var) / (spots * (spots - 1))
        rho = covariance / seat_var if seat_var > 0 else 0.0
        # Standard error of the round-total variance, used only as a sanity band.
        se_total_var = total_var * math.sqrt(2.0 / (rounds - 1))
        return {
            "rounds": rounds,
            "seat_mean": seat_mean,
            "seat_variance": seat_var,
            "seat_sd": math.sqrt(max(0.0, seat_var)),
            "round_total_variance": total_var,
            "independent_model_variance": spots * seat_var,
            "variance_ratio": total_var / (spots * seat_var) if seat_var > 0 else 0.0,
            "pairwise_covariance": covariance,
            "pairwise_correlation": rho,
            "round_total_variance_se": se_total_var,
        }

    rows = []
    for index in range(BUCKETS):
        rows.append({
            "true_count": index - 8,
            "label": "<= -8" if index == 0 else ">= +8" if index == 16 else f"{index - 8:+d}",
            **stats(
                int(counts[index]), float(seat_sums[index]), float(seat_squares[index]),
                float(total_sums[index]), float(total_squares[index]),
            ),
        })
    overall = stats(
        int(counts.sum()), float(seat_sums.sum()), float(seat_squares.sum()),
        float(total_sums.sum()), float(total_squares.sum()),
    )
    return {"spots": spots, "overall": overall, "rows": rows}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Measure simultaneous-hand covariance for the CountLab variance model",
    )
    parser.add_argument("--decks", type=int, default=6, choices=(6, 8))
    parser.add_argument("--dealt", type=float, default=4.5)
    parser.add_argument("--shoes", type=int, default=200_000)
    parser.add_argument("--tasks", type=int, default=max(1, os.cpu_count() or 1))
    parser.add_argument("--seed", type=int, default=20260816)
    parser.add_argument(
        "--spots", type=int, nargs="+", default=[2, 3],
        help=f"hero seat counts to measure (2..{MAX_SPOTS})",
    )
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    for spots in args.spots:
        if not 2 <= spots <= MAX_SPOTS:
            parser.error(f"--spots values must be between 2 and {MAX_SPOTS}")

    simulate_covariance_parallel(
        6, 4.5, np.array([1], dtype=np.int64), np.array([1], dtype=np.int64), 2,
    )

    results = {}
    for spots in args.spots:
        config_key = args.decks * 1000 + int(round(args.dealt * 100)) + spots * 1_000_000
        task_shoes, seeds = task_layout(args.shoes, args.tasks, args.seed, config_key)
        print(
            f"Measuring {args.decks}D, {args.dealt:g} dealt, {spots} hero spots, "
            f"shoes={args.shoes:,} ...",
            flush=True,
        )
        started = time.perf_counter()
        arrays = simulate_covariance_parallel(
            args.decks, args.dealt, task_shoes, seeds, spots,
        )
        result = summarize(*arrays, spots)
        result["runtime_seconds"] = time.perf_counter() - started
        result["shoes"] = int(task_shoes.sum())
        overall = result["overall"]
        print(
            f"  {overall['rounds']:,} rounds | seat SD {overall['seat_sd']:.6f} | "
            f"round-total variance {overall['round_total_variance']:.6f} vs "
            f"{overall['independent_model_variance']:.6f} independent "
            f"(x{overall['variance_ratio']:.4f}) | rho {overall['pairwise_correlation']:.5f}",
            flush=True,
        )
        results[str(spots)] = result

    payload = {
        "metadata": {
            "created_utc": datetime.now(timezone.utc).isoformat(),
            "source_sha256": normalized_sha256(Path(__file__)),
            "simulate_source_sha256": normalized_sha256(Path(__file__).parent / "simulate.py"),
            "python": platform.python_version(),
            "numpy": np.__version__,
            "numba": numba.__version__,
            "platform": platform.platform(),
            "decks": args.decks,
            "dealt": args.dealt,
            "seed": args.seed,
            "requested_shoes": args.shoes,
            "strategy": strategy_manifest(),
            "note": (
                "Every seat is the hero, plays full indices, and takes insurance at "
                "TC >= +3. rho is the pairwise correlation between two of the hero's "
                "simultaneous hands in the same round."
            ),
        },
        "z95": Z95,
        "profiles": results,
    }
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
