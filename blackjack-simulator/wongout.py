"""How often each true count is watched and played under back-counting entry and exit rules.

A player who leaves at a low count, or who sits down only once the count climbs and then stays
until it falls, plays a different mix of counts from the shoe as a whole. The mix depends on the
path the count takes through each shoe, so it is measured here rather than read off the per-count
coefficients. Edge and standard deviation at a given count do not depend on the rule, so the
Calculator combines these shares with the wong.py coefficients.

Rules, decided before each round on the floored true count the Calculator buckets by:
- enter at X: sit down when the count is X or higher (X = "start": play from the top of each shoe);
- leave at Y: get up when the count is Y or lower. After leaving a shoe played from the top, the
  player goes to a fresh shoe at once (the rest of the old shoe is neither watched nor played);
  a back-counter stays to watch and sits down again at X.

For every profile and rule this writes, per true-count bucket, the share of all dealt rounds that
were watched (time at the table) and that were played. It imports wong.py and simulate.py without
editing them, so their recorded checksums stay valid.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import time
from datetime import datetime, timezone
from pathlib import Path

import numba
import numpy as np
from numba import njit, prange

from h17_pro import normalized_sha256
from simulate import BUCKETS, GAME_OPTIONS, bucket_index, git_metadata, hand_value, hilo, task_layout
from wong import EXTRA_OPTIONS, card_at, load_strategy, play_player, strategy_path

START = -99
ENTRIES = np.array([START, -1, 0, 1, 2, 3], dtype=np.int64)
EXITS = np.array([START, -3, -2, -1, 0, 1], dtype=np.int64)  # START here means "never leave"


def rules() -> list[tuple[int, int]]:
    # Leave below where you sit in; a shoe played from the top starts at 0, so it can only leave below 0.
    return [(int(entry), int(exit_)) for entry in ENTRIES for exit_ in EXITS if exit_ == START or exit_ < (0 if entry == START else entry)]


@njit(cache=True)
def policy_task(decks: int, dealt_decks: float, shoes: int, seed: int, entries: np.ndarray, exits: np.ndarray,
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
    count = len(entries)
    watched = np.zeros((count, BUCKETS), dtype=np.int64)
    played = np.zeros((count, BUCKETS), dtype=np.int64)
    dealt = np.zeros(BUCKETS, dtype=np.int64)
    seated = np.zeros(count, dtype=np.bool_)
    present = np.zeros(count, dtype=np.bool_)
    for _ in range(shoes):
        np.random.shuffle(shoe)
        position = 0
        running_count = 0
        for rule in range(count):
            present[rule] = True
            seated[rule] = entries[rule] == -99
        while position < cut_position:
            bucket = bucket_index(running_count, total_cards - position)
            tc = bucket - 8
            dealt[bucket] += 1
            for rule in range(count):
                if not present[rule]:
                    continue
                if seated[rule] and exits[rule] != -99 and tc <= exits[rule]:
                    seated[rule] = False
                    # Played from the top: leave for a fresh shoe. Back-counting: stay and watch.
                    if entries[rule] == -99:
                        present[rule] = False
                        continue
                if not seated[rule] and entries[rule] != -99 and tc >= entries[rule]:
                    seated[rule] = True
                watched[rule, bucket] += 1
                if seated[rule]:
                    played[rule, bucket] += 1
            # Deal the round as wong.py does, so card use per round matches the coefficients.
            first = int(shoe[position]); position += 1; running_count += hilo(first)
            dealer_up = int(shoe[position]); position += 1; running_count += hilo(dealer_up)
            second = int(shoe[position]); position += 1; running_count += hilo(second)
            dealer_hole = int(shoe[position]); position += 1
            dealer_blackjack = (dealer_up == 1 and dealer_hole == 10) or (dealer_up == 10 and dealer_hole == 1)
            hero_blackjack = (first == 1 and second == 10) or (first == 10 and second == 1)
            if dealer_blackjack or hero_blackjack:
                running_count += hilo(dealer_hole)
                continue
            cards, hand_counts, bets, surrendered, hands, position, running_count, needs_dealer = play_player(
                first, second, dealer_up, shoe, position, running_count, True, True, hard, soft, pairs)
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
    return watched, played, dealt


@njit(parallel=True, cache=True)
def policy_parallel(decks: int, dealt_decks: float, task_shoes: np.ndarray, seeds: np.ndarray, entries: np.ndarray, exits: np.ndarray,
                    hard: np.ndarray, soft: np.ndarray, pairs: np.ndarray):
    tasks = len(task_shoes)
    count = len(entries)
    watched = np.zeros((tasks, count, BUCKETS), dtype=np.int64)
    played = np.zeros((tasks, count, BUCKETS), dtype=np.int64)
    dealt = np.zeros((tasks, BUCKETS), dtype=np.int64)
    for task in prange(tasks):
        w, p, d = policy_task(decks, dealt_decks, int(task_shoes[task]), int(seeds[task]), entries, exits, hard, soft, pairs)
        watched[task], played[task], dealt[task] = w, p, d
    return watched, played, dealt


def main() -> None:
    parser = argparse.ArgumentParser(description="Back-counting entry/exit shares for the CountLab Calculator")
    parser.add_argument("--shoes", type=int, default=10_000_000, help="shoes per 6- and 8-deck profile; smaller shoes get four times as many")
    parser.add_argument("--tasks", type=int, default=max(1, os.cpu_count() or 1))
    parser.add_argument("--seed", type=int, default=20261026)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--typescript", type=Path, required=True)
    args = parser.parse_args()
    pairs_list = rules()
    entries = np.array([entry for entry, _ in pairs_list], dtype=np.int64)
    exits = np.array([exit_ for _, exit_ in pairs_list], dtype=np.int64)
    options = {**EXTRA_OPTIONS, **GAME_OPTIONS}
    profiles = {}
    for decks in sorted(options):
        hard, soft, pairs, _, _ = load_strategy(strategy_path(decks, False))
        for dealt in options[decks]:
            key = f"{decks}-{dealt:g}"
            shoes = args.shoes * (4 if decks < 6 else 1)
            task_shoes, seeds = task_layout(shoes, args.tasks, args.seed, decks * 1000 + int(round(dealt * 100)) + 5_000_000)
            started = time.perf_counter()
            watched, played, dealt_rounds = policy_parallel(decks, dealt, task_shoes, seeds, entries, exits, hard, soft, pairs)
            watched, played, dealt_rounds = watched.sum(axis=0), played.sum(axis=0), dealt_rounds.sum(axis=0)
            total = int(dealt_rounds.sum())
            profiles[key] = {
                "shoes": int(task_shoes.sum()), "rounds": total, "runtime_seconds": time.perf_counter() - started,
                "rules": {
                    f"{'start' if entry == START else entry}:{'never' if exit_ == START else exit_}": {
                        "watched": [int(value) / total for value in watched[index]],
                        "played": [int(value) / total for value in played[index]],
                    }
                    for index, (entry, exit_) in enumerate(pairs_list)
                },
            }
            print(f"{key}: {total:,} rounds in {profiles[key]['runtime_seconds']:.1f}s", flush=True)
    payload = {
        "metadata": {
            "created_utc": datetime.now(timezone.utc).isoformat(), "source_sha256": normalized_sha256(Path(__file__)),
            "git": git_metadata(), "python": platform.python_version(), "numpy": np.__version__, "numba": numba.__version__,
            "seed": args.seed, "shoes_per_shoe_game": args.shoes,
            "model": "shares of all dealt rounds watched and played, by floored true count, per entry:exit rule; one spot, Wong LS plays",
        },
        "profiles": profiles,
    }
    args.output.write_text(json.dumps(payload) + "\n", encoding="utf-8")
    lines = [
        "// Generated by ../blackjack-simulator/wongout.py. Do not edit by hand.",
        "/** Per profile, per \"enter:leave\" rule: shares of all dealt rounds watched and played, by true count −8…+8. */",
        "export const WONG_OUT_METADATA = {",
        f'  generatedUtc: "{payload["metadata"]["created_utc"]}",',
        f'  sourceSha256: "{payload["metadata"]["source_sha256"]}",',
        f"  seed: {args.seed},",
        f"  totalRounds: {sum(profile['rounds'] for profile in profiles.values())},",
        "} as const;",
        "export const WONG_OUT_SHARES: Record<string, Record<string, { watched: readonly number[]; played: readonly number[] }>> = {",
    ]
    for key, profile in profiles.items():
        lines.append(f'  "{key}": {{')
        for rule, shares in profile["rules"].items():
            lines.append(f'    "{rule}": {{ watched: [{", ".join(format(v, ".6g") for v in shares["watched"])}], played: [{", ".join(format(v, ".6g") for v in shares["played"])}] }},')
        lines.append("  },")
    lines.extend(["};", ""])
    args.typescript.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
