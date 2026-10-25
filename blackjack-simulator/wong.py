"""Coefficients for the strategy the CountLab charts teach: basic strategy plus Stanford Wong's
count plays, surrender and insurance (Professional Blackjack).

The decisions are not re-encoded here. `../blackjack/scripts/export-sim-strategy.ts` writes the
site engine's answer for every hand, dealer card, true count and permission set into
`strategy/*.json`, and this kernel looks them up, so the calculator prices exactly the charts.

Differences from `h17_pro.py`:
- plays use the truncated true count, the convention Wong's numbers are computed for;
  coefficients are still bucketed by the floored count, as the calculator reads them;
- early surrender against a ten (`--surrender early`) is decided before the dealer peeks and
  costs half the bet even against a blackjack; against an ace surrender stays late;
- insurance is taken from Wong's table 11 threshold for the deck count.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
from datetime import datetime, timezone
from pathlib import Path

import numba
import numpy as np
from numba import njit, prange

from h17_pro import HIT, SPLIT, STAND, SURRENDER, DOUBLE, merge_results, normalized_sha256, settle, write_typescript
from simulate import BUCKETS, GAME_OPTIONS, Z95, bucket_index, git_metadata, hand_value, hilo, summarize, task_layout

TC_RANGE = 11
HERE = Path(__file__).resolve().parent
# Pitch and small-shoe games the Calculator offers beyond simulate.py's six- and eight-deck shoes.
EXTRA_OPTIONS = {1: (0.5, 0.625, 0.75), 2: (1.0, 1.25, 1.5, 1.75), 4: (2.5, 3.0, 3.25, 3.5)}


def load_strategy(path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray, float, dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["tcRange"] == TC_RANGE
    return (np.array(data["hard"], dtype=np.int8), np.array(data["soft"], dtype=np.int8),
            np.array(data["pairs"], dtype=np.int8), float(data["insuranceAt"]), data["rules"])


@njit(cache=True)
def true_count(running_count: int, cards_left: int) -> int:
    # int() truncates toward zero. A round that runs past the end of the shoe has no cards left to divide by.
    return int((running_count * 52.0) / max(cards_left, 1))


@njit(cache=True)
def card_at(shoe: np.ndarray, position: int) -> int:
    """The card at `position`, or past the end of the shoe one drawn from shuffled discards.

    A round that starts before the cut card can need more cards than are left in a one- or
    two-deck game; the dealer then shuffles the discards and goes on. That is modelled as a draw
    from a full deck's composition. Random numbers are used only then, which a six- or eight-deck
    shoe (39 or more cards behind the cut) never reaches, so those results are unchanged.
    """
    if position < len(shoe):
        return int(shoe[position])
    rank = int(np.random.random() * 13) + 1
    return 10 if rank > 10 else rank


@njit(cache=True)
def table_action(cards: np.ndarray, count: int, dealer: int, can_split: bool, can_double: bool, can_surrender: bool,
                 split_aces: bool, tc: int, hard: np.ndarray, soft: np.ndarray, pairs: np.ndarray) -> int:
    pair = count == 2 and cards[0] == cards[1]
    if split_aces:
        return SPLIT if pair and can_split and cards[0] == 1 else STAND
    column = min(max(tc, -TC_RANGE), TC_RANGE) + TC_RANGE
    flags = (1 if can_double else 0) + (2 if can_surrender else 0)
    if pair and can_split:
        return pairs[cards[0] - 1, dealer - 1, column, flags + 4]
    total, soft_hand = hand_value(cards, count)
    if soft_hand:
        return soft[total - 12, dealer - 1, column, flags]
    return hard[total - 4, dealer - 1, column, flags]


@njit(cache=True)
def play_player(first: int, second: int, dealer: int, shoe: np.ndarray, position: int, running_count: int, may_surrender: bool,
                das: bool, hard: np.ndarray, soft: np.ndarray, pairs: np.ndarray):
    cards = np.zeros((4, 12), dtype=np.int8)
    counts = np.zeros(4, dtype=np.int8)
    bets = np.ones(4, dtype=np.int8)
    surrendered = np.zeros(4, dtype=np.int8)
    ace_split = np.zeros(4, dtype=np.int8)
    cards[0, 0], cards[0, 1], counts[0] = first, second, 2
    hands = 1
    index = 0
    while index < hands:
        count = int(counts[index])
        total, _ = hand_value(cards[index], count)
        if total > 21:
            index += 1
            continue
        pair = count == 2 and cards[index, 0] == cards[index, 1]
        can_split = pair and hands < 4
        can_double = count == 2 and (hands == 1 or das)
        can_surrender = may_surrender and index == 0 and hands == 1 and count == 2
        tc = true_count(running_count, len(shoe) - position + 1)
        action = table_action(cards[index], count, dealer, can_split, can_double, can_surrender, ace_split[index] == 1, tc, hard, soft, pairs)
        if action == SPLIT and can_split:
            rank = int(cards[index, 0])
            next_index = hands
            hands += 1
            cards[index, 1] = card_at(shoe, position)
            running_count += hilo(int(cards[index, 1]))
            position += 1
            cards[next_index, 0] = rank
            cards[next_index, 1] = card_at(shoe, position)
            running_count += hilo(int(cards[next_index, 1]))
            position += 1
            counts[next_index] = 2
            if rank == 1:
                ace_split[index] = 1
                ace_split[next_index] = 1
            continue
        if action == SURRENDER and can_surrender:
            surrendered[index] = 1
            index += 1
            continue
        if action == DOUBLE and can_double:
            cards[index, count] = card_at(shoe, position)
            running_count += hilo(int(cards[index, count]))
            position += 1
            counts[index] += 1
            bets[index] = 2
            index += 1
            continue
        if action == HIT or (action == DOUBLE and not can_double):
            cards[index, count] = card_at(shoe, position)
            running_count += hilo(int(cards[index, count]))
            position += 1
            counts[index] += 1
            continue
        index += 1
    needs_dealer = False
    for hand in range(hands):
        total, _ = hand_value(cards[hand], int(counts[hand]))
        if surrendered[hand] == 0 and total <= 21:
            needs_dealer = True
    return cards, counts, bets, surrendered, hands, position, running_count, needs_dealer


@njit(cache=True)
def simulate_task(decks: int, dealt_decks: float, shoes: int, seed: int, early: bool, das: bool, insurance_at: float,
                  hard: np.ndarray, soft: np.ndarray, pairs: np.ndarray):
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
    early_cards = np.zeros(2, dtype=np.int8)
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
            tc = true_count(running_count, len(shoe) - position + 1)
            # Early surrender against a ten comes before the peek, so a dealer blackjack still costs only half.
            if early and dealer_up == 10 and not hero_blackjack:
                early_cards[0], early_cards[1] = first, second
                if table_action(early_cards, 2, 10, first == second, True, True, False, tc, hard, soft, pairs) == SURRENDER:
                    running_count += hilo(dealer_hole)
                    counts[start_bucket] += 1
                    sums[start_bucket] -= 0.5
                    squares[start_bucket] += 0.25
                    rounds += 1
                    continue
            take_insurance = dealer_up == 1 and tc >= insurance_at
            if dealer_blackjack:
                running_count += hilo(dealer_hole)
                profit = (0.0 if hero_blackjack else -1.0) + (1.0 if take_insurance else 0.0)
            elif hero_blackjack:
                running_count += hilo(dealer_hole)
                profit = 1.5 - (0.5 if take_insurance else 0.0)
            else:
                # Under ES10 the ten's surrender was offered before the peek and is not offered again.
                may_surrender = not (early and dealer_up == 10)
                cards, hand_counts, bets, surrendered, hands, position, running_count, needs_dealer = play_player(
                    first, second, dealer_up, shoe, position, running_count, may_surrender, das, hard, soft, pairs)
                running_count += hilo(dealer_hole)
                dealer_cards = np.zeros(12, dtype=np.int8)
                dealer_cards[0], dealer_cards[1] = dealer_up, dealer_hole
                dealer_count = 2
                dealer_total, dealer_soft = hand_value(dealer_cards, dealer_count)
                if needs_dealer:
                    while dealer_total < 17 or (dealer_total == 17 and dealer_soft):
                        card = card_at(shoe, position); position += 1
                        dealer_cards[dealer_count] = card; dealer_count += 1
                        running_count += hilo(card)
                        dealer_total, dealer_soft = hand_value(dealer_cards, dealer_count)
                profit = settle(cards, hand_counts, bets, surrendered, hands, dealer_total, dealer_total > 21, False) - (0.5 if take_insurance else 0.0)
            counts[start_bucket] += 1
            sums[start_bucket] += profit
            squares[start_bucket] += profit * profit
            rounds += 1
    return counts, sums, squares, rounds


@njit(parallel=True, cache=True)
def simulate_parallel(decks: int, dealt_decks: float, task_shoes: np.ndarray, seeds: np.ndarray, early: bool, das: bool,
                      insurance_at: float, hard: np.ndarray, soft: np.ndarray, pairs: np.ndarray):
    tasks = len(task_shoes)
    counts = np.zeros((tasks, BUCKETS), dtype=np.int64)
    sums = np.zeros((tasks, BUCKETS), dtype=np.float64)
    squares = np.zeros((tasks, BUCKETS), dtype=np.float64)
    rounds = np.zeros(tasks, dtype=np.int64)
    for task in prange(tasks):
        c, s, q, r = simulate_task(decks, dealt_decks, int(task_shoes[task]), int(seeds[task]), early, das, insurance_at, hard, soft, pairs)
        counts[task], sums[task], squares[task], rounds[task] = c, s, q, r
    return counts, sums, squares, rounds


def run_configuration(decks: int, dealt: float, shoes: int, tasks: int, seed: int, early: bool, strategy: Path) -> dict:
    import time
    hard, soft, pairs, insurance_at, rules = load_strategy(strategy)
    assert rules["decks"] == decks and rules["surrender"] == ("early" if early else "late")
    task_shoes, seeds = task_layout(shoes, tasks, seed, decks * 1000 + int(round(dealt * 100)) + (4_000_000 if early else 3_000_000))
    started = time.perf_counter()
    counts, sums, squares, rounds = simulate_parallel(decks, dealt, task_shoes, seeds, early, bool(rules["das"]), insurance_at, hard, soft, pairs)
    result = summarize(counts, sums, squares)
    result.update(shoes=int(task_shoes.sum()), tasks=len(task_shoes), seed=seed, runtime_seconds=time.perf_counter() - started)
    result["rounds_per_second"] = result["rounds"] / result["runtime_seconds"]
    assert result["rounds"] == int(rounds.sum())
    return result


STRATEGY_DIR = HERE / "strategy"


def strategy_path(decks: int, early: bool) -> Path:
    return STRATEGY_DIR / f"{decks}d-h17-das-{'es10' if early else 'ls'}.json"


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate CountLab coefficients for Wong's count plays")
    parser.add_argument("--surrender", choices=("late", "early"), required=True)
    parser.add_argument("--shoes", type=int, default=100_000_000)
    parser.add_argument("--tasks", type=int, default=max(1, os.cpu_count() or 1))
    parser.add_argument("--seed", type=int, default=20261025)
    parser.add_argument("--decks", type=int, choices=(1, 2, 4, 6, 8))
    parser.add_argument("--dealt", type=float)
    parser.add_argument("--append", action="store_true", help="merge an independent chunk into an existing artifact")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--typescript", type=Path, required=True)
    parser.add_argument("--symbol", required=True, help="TypeScript export prefix, e.g. WONG_LS")
    parser.add_argument("--strategy-dir", type=Path, help="read the strategy tables from here (validation runs)")
    parser.add_argument("--basic", action="store_true", help="basic strategy only: strategy/basic tables, no index plays, no insurance")
    parser.add_argument("--extra-decks", action="store_true", help="run the 1-, 2- and 4-deck profiles instead of the 6- and 8-deck ones")
    args = parser.parse_args()
    global STRATEGY_DIR
    if args.basic:
        STRATEGY_DIR = HERE / "strategy" / "basic"
    if args.strategy_dir:
        STRATEGY_DIR = args.strategy_dir
    early = args.surrender == "early"
    if (args.decks is None) != (args.dealt is None):
        parser.error("--decks and --dealt must be supplied together")
    profiles = {}
    if args.append and args.output.exists():
        previous = json.loads(args.output.read_text(encoding="utf-8"))
        profiles = previous.get("profiles", {})
        # Each profile keeps the checksum of the code that simulated it, so appending never relabels older runs.
        for profile in profiles.values():
            profile.setdefault("source_sha256", previous["metadata"]["source_sha256"])
    options = EXTRA_OPTIONS if args.extra_decks else GAME_OPTIONS
    configurations = [(args.decks, args.dealt)] if args.decks is not None else [
        (decks, dealt) for decks, dealt_values in options.items() for dealt in dealt_values
    ]
    for decks, dealt in configurations:
        key = f"{decks}-{dealt:g}"
        print(f"Simulating {decks}D, {dealt:g} dealt, {'basic' if args.basic else 'Wong'} {'ES10' if early else 'LS'}, shoes={args.shoes:,} ...", flush=True)
        result = run_configuration(decks, dealt, args.shoes, args.tasks, args.seed, early, strategy_path(decks, early))
        result["source_sha256"] = normalized_sha256(Path(__file__))
        profiles[key] = merge_results(profiles[key], result) if args.append and key in profiles else result
        complete = profiles[key]
        print(f"  {complete['rounds']:,} rounds in {complete['runtime_seconds']:.1f}s; EV {complete['mean']:+.6%} +/- {Z95 * complete['standard_error']:.6%} (95%)", flush=True)
    surrender = "ES10 (early vs 10, late vs A)" if early else "LS"
    payload = {
        "metadata": {
            "created_utc": datetime.now(timezone.utc).isoformat(), "source_sha256": normalized_sha256(Path(__file__)),
            "strategy_sha256": {key: normalized_sha256(strategy_path(int(key.split("-")[0]), early)) for key in profiles},
            "git": git_metadata(), "python": platform.python_version(), "numpy": np.__version__, "numba": numba.__version__,
            "platform": platform.platform(), "cpu_count": os.cpu_count(), "requested_shoes_per_configuration": max(profile["shoes"] for profile in profiles.values()),
            "tasks": args.tasks, "seed": args.seed,
            "strategy": f"CountLab basic strategy with surrender ({surrender}), no index plays and no insurance, from the site engine" if args.basic
            else f"CountLab basic strategy plus Wong's Professional Blackjack count plays, surrender ({surrender}) and table 11 insurance, from the site engine",
            "model": f"{'/'.join(str(decks) for decks in sorted({int(key.split('-')[0]) for key in profiles}))} deck | H17 | DAS | RSA | {surrender} | peek | 3:2 | one spot | "
            + ("basic strategy, no insurance" if args.basic else "Wong indices, truncated TC | Wong insurance"),
        }, "profiles": profiles,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    args.typescript.parent.mkdir(parents=True, exist_ok=True)
    write_typescript(payload, args.typescript, args.symbol, Path(__file__).name)


if __name__ == "__main__":
    main()
