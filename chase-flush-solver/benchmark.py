import argparse
import json
import os
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from numba import njit

from chase_flush.cards import parse_card, parse_cards
from chase_flush.compiled_exact import (
    _profit,
    _score7,
    exact_opening_compiled,
    exact_river_compiled,
    exact_stage2_compiled,
)
from chase_flush.high_precision import _environment, _initialize_worker, _run_batch, auto_workers
from chase_flush.state import InformationState


@njit(cache=True)
def evaluator_benchmark(cards, iterations):
    total = 0
    for i in range(iterations):
        row = cards[i % len(cards)]
        total += _score7(row[0], row[1], row[2], row[3], row[4], row[5], row[6])
    return total


@njit(cache=True)
def showdown_benchmark(cards, iterations):
    total = 0
    for i in range(iterations):
        a, b = cards[i % len(cards)], cards[(i + 1) % len(cards)]
        total += _profit(_score7(a[0],a[1],a[2],a[3],a[4],a[5],a[6]),
                         _score7(b[0],b[1],b[2],b[3],b[4],b[5],b[6]), 2, 50)
    return total


def rate(call, units):
    started = time.perf_counter(); call(); elapsed = time.perf_counter() - started
    return {"units": units, "seconds": elapsed, "per_second": units / elapsed}


def main():
    parser = argparse.ArgumentParser(description="Benchmark compiled and full-policy Chase the Flush paths")
    parser.add_argument("--models", default="results/current50-policies-2m.joblib")
    parser.add_argument("--workers", default="auto")
    parser.add_argument("--batch-size", type=int, default=100_000)
    parser.add_argument("--output", default="results/benchmark.json")
    args = parser.parse_args(); workers = auto_workers(args.workers)
    rng = np.random.default_rng(17); cards = np.vstack([rng.choice(52, 7, replace=False) for _ in range(1024)]).astype(np.int16)
    evaluator_benchmark(cards, 1); showdown_benchmark(cards, 1)
    evaluator = rate(lambda: evaluator_benchmark(cards, 10_000_000), 10_000_000)
    showdown = rate(lambda: showdown_benchmark(cards, 5_000_000), 5_000_000)

    river_state = InformationState(parse_cards("Ah 8h 4c"), parse_cards("2h 7s 3d 9c"), parse_card("Kh"))
    stage2_state = InformationState(parse_cards("As Ks Js"), parse_cards("Ts 9s"), parse_card("Kh"))
    opening_state = InformationState(parse_cards("Ks Js Ts"), (), parse_card("9s"))
    exact_river_compiled(river_state); exact_stage2_compiled(stage2_state); exact_opening_compiled(opening_state)
    exact_river_compiled.cache_clear(); exact_stage2_compiled.cache_clear(); exact_opening_compiled.cache_clear()
    river = rate(lambda: exact_river_compiled(river_state), 946)
    stage2 = rate(lambda: exact_stage2_compiled(stage2_state), 979_110)
    opening = rate(lambda: exact_opening_compiled(opening_state), 1_104_436_080)

    _initialize_worker(args.models, 50)
    single = rate(lambda: _run_batch((0, args.batch_size, 12345, "paired")), args.batch_size)
    tasks = [(i, args.batch_size, 12345, "paired") for i in range(workers)]
    wall_started = time.perf_counter()
    with ProcessPoolExecutor(max_workers=workers, initializer=_initialize_worker, initargs=(args.models, 50)) as executor:
        batch_results = list(executor.map(_run_batch, tasks, chunksize=1))
    wall = time.perf_counter() - wall_started
    all_core_rate = workers * args.batch_size / wall
    cpu_seconds = sum(float(item["cpu_seconds"]) for item in batch_results)
    cpu_utilization = cpu_seconds / (wall * workers) * 100
    targets = (100_000_000,1_000_000_000,10_000_000_000,100_000_000_000,1_000_000_000_000,4_000_000_000_000)
    estimates = {str(value): value / all_core_rate for value in targets}
    report = {
        "metadata": _environment(),
        "cpu": {"logical_cores": os.cpu_count(), "workers": workers, "measured_utilization_percent": cpu_utilization},
        "hand_evaluator": evaluator, "showdown": showdown,
        "river_exact": river, "stage2_exact": stage2, "opening_exact": opening,
        "paired_policy_single_core": single,
        "paired_policy_all_core": {"units": workers * args.batch_size, "seconds": wall, "per_second": all_core_rate},
        "estimated_runtime_seconds": estimates,
    }
    output = Path(args.output); output.parent.mkdir(parents=True, exist_ok=True); output.write_text(json.dumps(report, indent=2))
    print(f"Hand evaluator: {evaluator['per_second']:,.0f} states/sec")
    print(f"Showdown:       {showdown['per_second']:,.0f} states/sec")
    print(f"River exact:    {river['per_second']:,.0f} states/sec")
    print(f"2X exact:       {stage2['per_second']:,.0f} states/sec")
    print(f"Opening exact:  {opening['per_second']:,.0f} states/sec")
    print(f"Policy paired single-thread: {single['per_second']:,.0f} hands/sec")
    print(f"Policy paired all-core:      {all_core_rate:,.0f} hands/sec ({cpu_utilization:.1f}% measured worker CPU utilization)")
    for target, seconds in estimates.items():
        print(f"{int(target):>18,}: {seconds/3600:,.2f} hours")
    print(f"JSON: {output}")


if __name__ == "__main__":
    main()
