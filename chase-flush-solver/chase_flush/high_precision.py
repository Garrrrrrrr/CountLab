"""Resumable, paired, batchwise evaluation of fixed backward-trained policies."""
from __future__ import annotations

import json
import os
import time
import platform
import subprocess
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from time import perf_counter
from typing import Any, Iterable
from datetime import datetime, timezone

import numpy as np

os.environ.setdefault("LOKY_MAX_CPU_COUNT", str(os.cpu_count() or 1))

from .fitted_solver import PolicySet, play_variant, random_deals, set_six_card_payout
from .statistics import RunningMoments, decision_status
from .rules import RULES_VERSION


_POLICIES: PolicySet | None = None
_SIX_PAYOUT = 50.0


def _environment() -> dict[str, Any]:
    try:
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL).strip()
        dirty = bool(subprocess.check_output(
            ["git", "status", "--porcelain"], text=True, stderr=subprocess.DEVNULL
        ).strip())
    except Exception:
        commit = "unknown"
        dirty = None
    return {"git_commit": commit, "date": datetime.now(timezone.utc).isoformat(),
            "working_tree_dirty": dirty,
            "rules_version": RULES_VERSION, "platform": platform.platform(),
            "cpu_count": os.cpu_count()}


def _initialize_worker(model_path: str, six_payout: float) -> None:
    global _POLICIES, _SIX_PAYOUT
    _POLICIES = PolicySet.load(model_path)
    _SIX_PAYOUT = six_payout
    set_six_card_payout(six_payout)


def _integer_aggregates(values: np.ndarray) -> tuple[int, int, int]:
    integers = values.astype(np.int64, copy=False)
    return len(integers), int(integers.sum(dtype=np.int64)), int(np.square(integers).sum(dtype=np.int64))


def _run_batch(task: tuple[int, int, int, str]) -> dict[str, Any]:
    cpu_started = time.process_time()
    batch_index, count, seed, mode = task
    if _POLICIES is None:
        raise RuntimeError("worker policies were not initialized")
    # SeedSequence spawn keys provide disjoint, deterministic streams.  A batch
    # therefore has the same stream regardless of worker count or resume order.
    sequence = np.random.SeedSequence(seed, spawn_key=(batch_index,))
    rng = np.random.Generator(np.random.PCG64DXSM(sequence))
    deals = random_deals(rng, count)
    variants = ("baseline", "full_exposed") if mode == "paired" else (mode,)
    result: dict[str, Any] = {"batch_index": batch_index, "count": count, "rng": "PCG64DXSM/SeedSequence"}
    values: dict[str, np.ndarray] = {}
    for variant in variants:
        profit, wager, action = play_variant(deals, _POLICIES, variant)
        values[variant] = profit
        result[variant] = {
            "profit": _integer_aggregates(profit),
            "wager_total": int(wager.astype(np.int64).sum(dtype=np.int64)),
            "actions": np.bincount(action, minlength=4).astype(np.int64).tolist(),
        }
    if mode == "paired":
        result["difference"] = _integer_aggregates(values["full_exposed"] - values["baseline"])
    result["cpu_seconds"] = time.process_time() - cpu_started
    return result


@dataclass(slots=True)
class AdaptiveAggregate:
    seed: int
    mode: str
    batch_size: int
    model_path: str
    six_payout: float
    next_batch: int = 0
    runtime_seconds: float = 0.0
    profits: dict[str, RunningMoments] = field(default_factory=dict)
    difference: RunningMoments = field(default_factory=RunningMoments)
    wager_totals: dict[str, int] = field(default_factory=dict)
    actions: dict[str, list[int]] = field(default_factory=dict)
    environment: dict[str, Any] = field(default_factory=dict)

    def add_batch(self, batch: dict[str, Any]) -> None:
        for variant in ("baseline", "full_exposed") if self.mode == "paired" else (self.mode,):
            self.profits.setdefault(variant, RunningMoments()).update_aggregates(*batch[variant]["profit"])
            self.wager_totals[variant] = self.wager_totals.get(variant, 0) + int(batch[variant]["wager_total"])
            counts = self.actions.setdefault(variant, [0, 0, 0, 0])
            for index, value in enumerate(batch[variant]["actions"]):
                counts[index] += int(value)
        if self.mode == "paired":
            self.difference.update_aggregates(*batch["difference"])
        self.next_batch = max(self.next_batch, int(batch["batch_index"]) + 1)

    @property
    def hands(self) -> int:
        if not self.profits:
            return 0
        return next(iter(self.profits.values())).count

    def to_dict(self, confidence: float, precision: float, workers: int) -> dict[str, Any]:
        variants = {}
        for name, moments in self.profits.items():
            item = moments.to_dict()
            average_wager = self.wager_totals[name] / moments.count
            item.update(average_wager=average_wager, edge_vs_ante=moments.mean,
                        wager_total=self.wager_totals[name],
                        edge_vs_initial_two_units=moments.mean / 2,
                        edge_vs_average_total_wager=moments.mean / average_wager,
                        actions={str(i): value for i, value in enumerate(self.actions[name])})
            variants[name] = item
        raw_status = decision_status(self.difference, confidence, precision) if self.mode == "paired" else (
            "PRECISION_REACHED" if self.hands > 1 and next(iter(self.profits.values())).half_width(confidence) <= precision else "INCONCLUSIVE"
        )
        status = "HIGH_CONFIDENCE_RESULT" if raw_status == "ACTION_A_CONFIRMED" else "REVERSED_RESULT_CONFIRMED" if raw_status == "ACTION_B_CONFIRMED" else raw_status
        return {
            "metadata": {**self.environment,
                "mode": self.mode, "seed": self.seed, "rng": "PCG64DXSM with SeedSequence spawn_key=batch_index",
                "batch_size": self.batch_size, "next_batch": self.next_batch,
                "model_path": self.model_path, "six_card_payout": self.six_payout,
                "workers": workers, "runtime_seconds": self.runtime_seconds,
                "hands": self.hands, "throughput_hands_per_second": self.hands / self.runtime_seconds if self.runtime_seconds else 0,
                "policy_note": "Monte Carlo error applies to evaluation of the fixed fitted policy; policy approximation error is separate.",
            },
            "variants": variants,
            "paired_difference": self.difference.to_dict() if self.mode == "paired" else None,
            "stopping": {
                "confidence": confidence, "precision_half_width": precision,
                "status": status,
            },
        }

    @classmethod
    def load(cls, path: Path) -> "AdaptiveAggregate":
        raw = json.loads(path.read_text())
        meta = raw["metadata"]
        aggregate = cls(int(meta["seed"]), meta["mode"], int(meta["batch_size"]),
                        meta["model_path"], float(meta["six_card_payout"]),
                        int(meta["next_batch"]), float(meta["runtime_seconds"]))
        aggregate.environment = {key: meta[key] for key in ("git_commit", "working_tree_dirty", "date", "rules_version", "platform", "cpu_count") if key in meta}
        if not aggregate.environment:
            aggregate.environment = _environment()
        for name, value in raw["variants"].items():
            aggregate.profits[name] = RunningMoments.from_dict(value)
            aggregate.wager_totals[name] = int(value.get("wager_total", round(float(value["average_wager"]) * aggregate.profits[name].count)))
            aggregate.actions[name] = [int(value["actions"][str(i)]) for i in range(4)]
        if raw.get("paired_difference"):
            aggregate.difference = RunningMoments.from_dict(raw["paired_difference"])
        return aggregate


def _tasks(start: int, hands: int, batch_size: int, seed: int, mode: str) -> Iterable[tuple[int, int, int, str]]:
    remaining, index = hands, start
    while remaining:
        count = min(batch_size, remaining)
        yield index, count, seed, mode
        remaining -= count
        index += 1


def run_adaptive(*, mode: str, model_path: str, output: str, seed: int = 12345,
                 hands: int | None = None, until_converged: bool = False,
                 precision: float = 0.005, confidence: float = 0.999,
                 max_hands: int = 100_000_000_000, min_hands: int = 0,
                 batch_size: int = 200_000, workers: int = 1,
                 six_payout: float = 50, resume: bool = False,
                 progress: bool = True) -> AdaptiveAggregate:
    if mode not in ("baseline", "full_exposed", "paired"):
        raise ValueError("mode must be baseline, full_exposed, or paired")
    destination = Path(output)
    if resume and destination.exists():
        aggregate = AdaptiveAggregate.load(destination)
        expected = (seed, mode, batch_size, str(model_path), float(six_payout))
        actual = (aggregate.seed, aggregate.mode, aggregate.batch_size, aggregate.model_path, aggregate.six_payout)
        if actual != expected:
            raise ValueError("resume configuration does not match saved aggregate")
    else:
        aggregate = AdaptiveAggregate(seed, mode, batch_size, str(model_path), float(six_payout))
        aggregate.environment = _environment()
    requested = hands if hands is not None else max_hands - aggregate.hands
    target = min(max_hands, aggregate.hands + requested)
    destination.parent.mkdir(parents=True, exist_ok=True)
    started = perf_counter()

    def converged() -> bool:
        if not until_converged or aggregate.hands < min_hands:
            return False
        moments = aggregate.difference if mode == "paired" else next(iter(aggregate.profits.values()))
        if moments.count < 2 or moments.half_width(confidence) > precision:
            return False
        if mode != "paired":
            return True
        low, high = moments.interval(confidence)
        return low > 0 or high < 0

    if workers <= 1:
        _initialize_worker(model_path, six_payout)
        batches = (_run_batch(task) for task in _tasks(aggregate.next_batch, target - aggregate.hands, batch_size, seed, mode))
        executor = None
    else:
        executor = ProcessPoolExecutor(max_workers=workers, initializer=_initialize_worker, initargs=(model_path, six_payout))
        batches = executor.map(
            _run_batch,
            _tasks(aggregate.next_batch, target - aggregate.hands, batch_size, seed, mode),
            chunksize=1,
            buffersize=max(2, workers * 2),
        )
    try:
        for batch in batches:
            aggregate.add_batch(batch)
            aggregate.runtime_seconds += perf_counter() - started
            started = perf_counter()
            destination.write_text(json.dumps(aggregate.to_dict(confidence, precision, workers), indent=2))
            if progress:
                stat = aggregate.difference if mode == "paired" else next(iter(aggregate.profits.values()))
                low, high = stat.interval(confidence)
                speed = aggregate.hands / aggregate.runtime_seconds
                print(f"Samples {aggregate.hands:,} | {speed:,.0f}/s | mean {stat.mean:+.6f} | CI [{low:+.6f}, {high:+.6f}]", flush=True)
            if converged():
                break
    finally:
        if executor is not None:
            executor.shutdown(cancel_futures=True)
    destination.write_text(json.dumps(aggregate.to_dict(confidence, precision, workers), indent=2))
    return aggregate


def auto_workers(value: str) -> int:
    if value == "auto":
        return os.cpu_count() or 1
    workers = int(value)
    if workers < 1:
        raise ValueError("workers must be positive or auto")
    return workers
