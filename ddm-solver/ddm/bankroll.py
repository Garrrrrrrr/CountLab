"""Bankroll, risk and ramp math shared with CountLab's CVCX conventions."""

from __future__ import annotations

import math
from typing import Dict, Iterable, List, Sequence, Tuple

SIMULTANEOUS_HAND_CORRELATION = 0.3724


def _clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return min(maximum, max(minimum, value))


def normal_cdf(value: float) -> float:
    x = abs(value) / math.sqrt(2.0)
    t = 1.0 / (1.0 + 0.3275911 * x)
    polynomial = (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t
                    - 0.284496736) * t + 0.254829592) * t)
    erf = 1.0 - polynomial * math.exp(-x * x)
    return 0.5 * (1.0 + (-erf if value < 0 else erf))


def finite_horizon_risk(bankroll: float, mean_per_round: float,
                        variance_per_round: float, rounds: int) -> float:
    if bankroll <= 0:
        return 1.0
    if rounds <= 0 or variance_per_round <= 0:
        return 0.0
    deviation = math.sqrt(variance_per_round * rounds)
    first = normal_cdf((-bankroll - mean_per_round * rounds) / deviation)
    exponent = _clamp((-2.0 * mean_per_round * bankroll) / variance_per_round,
                      -745.0, 709.0)
    second = math.exp(exponent) * normal_cdf(
        (-bankroll + mean_per_round * rounds) / deviation)
    return _clamp(first + second)


def required_bankroll(mean_per_round: float, variance_per_round: float,
                      target_risk: float) -> float:
    if mean_per_round <= 0 or variance_per_round <= 0:
        return math.inf
    if target_risk >= 1:
        return 0.0
    if target_risk <= 0:
        return math.inf
    return (-variance_per_round * math.log(target_risk)) / (2.0 * mean_per_round)


def risk_sized_unit(bankroll: float, target_risk: float, mean_per_unit: float,
                    variance_per_unit: float) -> float:
    """Largest unit giving ``target_risk`` for a fixed ramp shape."""
    if target_risk >= 1:
        return math.inf
    if mean_per_unit <= 0 or variance_per_unit <= 0 or target_risk <= 0:
        return 0.0
    return max(0.0, (-2.0 * bankroll * mean_per_unit) /
               (variance_per_unit * math.log(target_risk)))


def result_percentile(actual_result: float, expected_result: float,
                      standard_deviation: float) -> float:
    if standard_deviation <= 0:
        return 1.0 if actual_result >= expected_result else 0.0
    return normal_cdf((actual_result - expected_result) / standard_deviation)


def simultaneous_hand_variance_factor(hands: int,
                                      correlation: float = SIMULTANEOUS_HAND_CORRELATION) -> float:
    if hands <= 1:
        return max(0.0, float(hands))
    return hands * (1.0 + (hands - 1) * correlation)


def n_zero(mean_per_round: float, variance_per_round: float) -> float:
    if mean_per_round <= 0:
        return math.inf
    return variance_per_round / (mean_per_round * mean_per_round)


def ramp_metrics(bucket_rows: Sequence[Dict], ramp: Sequence[Tuple[int, float]]) -> Dict:
    """Reweight a flat-bet MC profile without rerunning the card simulation."""
    ordered = sorted((int(tc), float(bet)) for tc, bet in ramp)

    def bet_at(tc: int) -> float:
        value = ordered[0][1]
        for threshold, bet in ordered:
            if tc >= threshold:
                value = bet
        return value

    mean = 0.0
    second = 0.0
    average_bet = 0.0
    for row in bucket_rows:
        frequency = float(row["frequency"])
        bet = bet_at(int(row["tc"]))
        unit_mean = float(row["ev_per_round"])
        unit_second = float(row["sd"]) ** 2 + unit_mean ** 2
        average_bet += frequency * bet
        mean += frequency * bet * unit_mean
        second += frequency * bet * bet * unit_second
    variance = max(0.0, second - mean * mean)
    return {"ev_per_round": mean, "variance_per_round": variance,
            "sd_per_round": math.sqrt(variance), "avg_bet": average_bet,
            "edge_per_unit_bet": mean / average_bet if average_bet else 0.0,
            "n0_rounds": n_zero(mean, variance)}


def optimal_ramp(bucket_rows: Sequence[Dict], max_spread: float = 16.0,
                 chip_increment: float = 1.0) -> Tuple[Tuple[int, float], ...]:
    """Find a monotone ramp with the best sampled SCORE (lowest N0).

    Edge/variance Kelly weights provide one starting point.  Coordinate search
    then accounts for the unavoidable one-unit bets in negative buckets, which
    a simple proportional Kelly ramp does not.  The ramp's dollar unit is sized
    separately by :func:`risk_sized_unit`, so maximizing mean²/variance chooses
    the best shape under the requested spread without baking in a bankroll.
    """
    rows = sorted(bucket_rows, key=lambda row: int(row["tc"]))
    if not rows:
        return ((-8, 1.0),)
    tcs = [int(row["tc"]) for row in rows]
    weights = []
    for row in rows:
        variance = float(row["sd"]) ** 2
        weight = max(0.0, float(row["ev_per_round"]) / variance) if variance else 0.0
        weights.append((int(row["tc"]), weight))
    baseline = next((weight for _, weight in weights if weight > 0), 1.0)
    kelly = []
    for _, weight in weights:
        units = min(max(1.0, max(0.0, weight) / baseline), max(1.0, max_spread))
        if chip_increment > 0:
            units = round(units / chip_increment) * chip_increment
        kelly.append(max(1.0, units))

    increment = chip_increment if chip_increment > 0 else 0.5
    levels = []
    value = 1.0
    while value < max_spread - 1e-12:
        levels.append(value)
        value += increment
    levels.append(max(1.0, float(max_spread)))
    levels = sorted(set(round(value, 10) for value in levels))

    first_positive = next((i for i, row in enumerate(rows)
                           if float(row["ev_per_round"]) > 0), len(rows))
    exponential = [1.0 if i < first_positive else
                   min(max_spread, 2.0 ** (i - first_positive + 1))
                   for i in range(len(rows))]
    maximum = [1.0 if i < first_positive else max_spread
               for i in range(len(rows))]
    linear = [1.0 if i < first_positive else
              min(max_spread, 1.0 + (i - first_positive + 1) * increment)
              for i in range(len(rows))]

    def monotone(values):
        out = []
        last = 1.0
        for raw in values:
            nearest = min(levels, key=lambda level: abs(level - raw))
            last = max(last, nearest)
            out.append(last)
        return out

    def compress(values):
        points = []
        last = None
        for tc, units in zip(tcs, values):
            if last is None or abs(units - last) > 1e-12:
                points.append((tc, units))
                last = units
        return tuple(points)

    def score(values):
        metrics = ramp_metrics(rows, compress(values))
        mean = metrics["ev_per_round"]
        variance = metrics["variance_per_round"]
        return mean * mean / variance if mean > 0 and variance > 0 else -math.inf

    best_values = monotone(kelly)
    best_score = score(best_values)
    for seed in (exponential, maximum, linear, [1.0] * len(rows)):
        values = monotone(seed)
        for _ in range(30):
            changed = False
            for order in (range(len(values) - 1, -1, -1), range(len(values))):
                for i in order:
                    low = values[i - 1] if i > 0 else 1.0
                    high = values[i + 1] if i + 1 < len(values) else max_spread
                    candidates = [level for level in levels if low <= level <= high]
                    current = values[i]
                    choice = max(candidates, key=lambda candidate: (
                        score(values[:i] + [candidate] + values[i + 1:]),
                        -candidate))
                    if abs(choice - current) > 1e-12:
                        values[i] = choice
                        changed = True
            if not changed:
                break
        candidate_score = score(values)
        if candidate_score > best_score:
            best_values, best_score = values, candidate_score
    return compress(best_values)


def summarize(bucket_rows: Sequence[Dict], ramp: Sequence[Tuple[int, float]],
              hands_per_hour: float = 100.0, bankroll: float = 10_000.0,
              target_risk: float = 0.05, hours: float = 100.0) -> Dict:
    metrics = ramp_metrics(bucket_rows, ramp)
    mean = metrics["ev_per_round"]
    variance = metrics["variance_per_round"]
    sd = metrics["sd_per_round"]
    return dict(metrics, ev_per_hour=mean * hands_per_hour,
                sd_per_hour=sd * math.sqrt(hands_per_hour),
                required_bankroll=required_bankroll(mean, variance, target_risk),
                lifetime_risk=(min(1.0, math.exp(-2.0 * bankroll * mean / variance))
                               if mean > 0 and variance > 0 else 1.0),
                trip_risk=finite_horizon_risk(bankroll, mean, variance,
                                              int(round(hands_per_hour * hours))),
                risk_sized_unit=risk_sized_unit(bankroll, target_risk, mean, variance))
