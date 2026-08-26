"""Exact strategy-index generation for Double Down Madness.

An index is derived from total-dependent charts re-extracted at deliberately
biased shoe compositions.  The composition has a fixed number of cards and a
running count consistent with the requested true count, so changes are caused
by rank mix rather than by comparing shoes of different sizes.

The emitted records are accepted directly by :func:`ddm.montecarlo.deviation_arrays`.
"""

from __future__ import annotations

import multiprocessing as mp
from typing import Dict, Iterable, List, Sequence, Tuple

from .cards import Composition, PER_DECK, fresh_shoe
from .rules import DDMRules
from .strategy import (Chart, chart_from_json, chart_to_json, evaluate_chart,
                       extract_chart)

Cell = Tuple[str, int, int]


def _deck_balance(tags: Sequence[float]) -> float:
    return sum(PER_DECK[r] * float(tags[r - 1]) for r in range(1, 11))


def biased_composition(rules: DDMRules, tags: Sequence[float], target_tc: float,
                       remaining_decks: float = 4.0) -> Tuple[Composition, float]:
    """Return a fixed-size shoe biased as closely as possible to ``target_tc``.

    Tags must be balanced.  Starting from proportionate removal, individual
    removed cards are exchanged between ranks until the removed-card running
    count is nearest ``target_tc * remaining_decks``.  The second return value
    is the true count actually represented after integer-card rounding.
    """
    if len(tags) != 10:
        raise ValueError("tags must contain A,2,...,9,T (10 values)")
    if abs(_deck_balance(tags)) > 1e-9:
        raise ValueError("biased compositions require a balanced count")
    total = 52 * rules.decks
    remaining = int(round(52.0 * remaining_decks))
    if remaining < 26 or remaining >= total:
        raise ValueError("remaining_decks must leave between 26 and %d cards" % (total - 1))

    full = fresh_shoe(rules.decks)
    removed_total = total - remaining
    ideal = [0.0] * 11
    removed = [0] * 11
    for rank in range(1, 11):
        ideal[rank] = removed_total * full[rank] / total
        removed[rank] = int(ideal[rank])
    left = removed_total - sum(removed)
    order = sorted(range(1, 11), key=lambda r: ideal[r] - removed[r], reverse=True)
    for rank in order[:left]:
        removed[rank] += 1

    rank_tags = [0.0] + [float(value) for value in tags]
    target_rc = float(target_tc) * (remaining / 52.0)
    current = sum(removed[r] * rank_tags[r] for r in range(1, 11))

    # Exchange which rank was removed without changing the shoe size.
    for _ in range(total * 20):
        error = abs(target_rc - current)
        best = None
        best_key = None
        for donor in range(1, 11):
            if removed[donor] <= 0:
                continue
            for receiver in range(1, 11):
                if receiver == donor or removed[receiver] >= full[receiver]:
                    continue
                delta = rank_tags[receiver] - rank_tags[donor]
                candidate_error = abs(target_rc - (current + delta))
                if candidate_error >= error - 1e-12:
                    continue
                # Among equally accurate count changes, stay as close as
                # possible to proportional removal.  Dividing by the full rank
                # count spreads changes across equivalent tags (especially A
                # and the four-times-as-common ten-value rank) instead of
                # exhausting whichever rank happens to be visited first.
                distortion = 0.0
                for rank in range(1, 11):
                    value = removed[rank]
                    if rank == donor:
                        value -= 1
                    elif rank == receiver:
                        value += 1
                    distortion += (value - ideal[rank]) ** 2 / full[rank]
                key = (candidate_error, distortion)
                if best_key is None or key < best_key:
                    best_key = key
                    best = (donor, receiver, delta)
        if best is None:
            break
        donor, receiver, delta = best
        removed[donor] -= 1
        removed[receiver] += 1
        current += delta

    composition = tuple(full[r] - removed[r] for r in range(11))
    actual_tc = current / (remaining / 52.0)
    return composition, actual_tc


def _rules_spec(rules: DDMRules) -> Dict:
    return dict(rules.__dict__)


def _chart_job(payload):
    spec, shoe, requested_tc, actual_tc = payload
    chart, _ = extract_chart(DDMRules(**spec), shoe)
    return requested_tc, actual_tc, chart_to_json(chart)


def charts_by_true_count(rules: DDMRules, tags: Sequence[float],
                         true_counts: Iterable[int], remaining_decks: float = 4.0,
                         workers: int = 0) -> Dict[int, Dict]:
    jobs = []
    for tc in sorted(set(int(value) for value in true_counts)):
        shoe, actual = biased_composition(rules, tags, tc, remaining_decks)
        jobs.append((_rules_spec(rules), shoe, tc, actual))
    worker_count = workers or min(len(jobs), max(1, (mp.cpu_count() or 2) - 1))
    if worker_count == 1:
        results = map(_chart_job, jobs)
    else:
        with mp.Pool(worker_count, maxtasksperchild=1) as pool:
            results = pool.map(_chart_job, jobs)
    out = {}
    for tc, actual, chart in results:
        shoe, _ = biased_composition(rules, tags, tc, remaining_decks)
        out[tc] = {"actual_tc": actual, "composition": shoe, "chart": chart}
    return out


def _cells(chart: Chart) -> List[Cell]:
    cells: List[Cell] = []
    for plane, table in (("first", chart.first), ("hard", chart.hard),
                         ("soft", chart.soft)):
        cells.extend((plane, row, up) for row, up in table)
    cells.extend(("ace", 0, up) for up in chart.ace_start)
    return sorted(cells)


def _action(chart: Chart, cell: Cell) -> str:
    plane, row, up = cell
    if plane == "ace":
        return chart.ace_start[up]
    return getattr(chart, plane)[(row, up)]


def _set_action(chart: Chart, cell: Cell, action: str) -> None:
    plane, row, up = cell
    if plane == "ace":
        chart.ace_start[up] = action
    else:
        getattr(chart, plane)[(row, up)] = action


def _one_sided_change(base_action: str, samples: List[Tuple[int, str]],
                      direction: int):
    side = [(tc, action) for tc, action in samples if tc * direction > 0]
    side.sort(key=lambda item: abs(item[0]))
    for index, (tc, action) in enumerate(side):
        if action == base_action:
            continue
        # A usable single index must not reverse or change to a third action
        # farther into the same side of the count range.
        if all(later_action == action for _, later_action in side[index:]):
            return tc, action
        return None
    return None


def derive_deviations(base_chart: Chart, sampled: Dict[int, Dict],
                      include_insurance: bool = True) -> Tuple[List[Dict], List[Dict]]:
    """Find clean one-sided action flips relative to the full-shoe chart.

    Returns ``(deviations, ambiguous)``.  Ambiguous cells are retained in the
    artifact for auditability but are not sent to the Monte Carlo kernel.
    """
    charts = {tc: chart_from_json(data["chart"]) for tc, data in sampled.items()}
    deviations: List[Dict] = []
    ambiguous: List[Dict] = []
    for cell in _cells(base_chart):
        base_action = _action(base_chart, cell)
        samples = [(tc, _action(chart, cell)) for tc, chart in sorted(charts.items())]
        zero_action = dict(samples).get(0, base_action)
        if zero_action != base_action:
            ambiguous.append({"plane": cell[0], "row": cell[1], "upcard": cell[2],
                              "reason": "TC 0 differs from the full-shoe chart",
                              "base_action": base_action, "samples": samples})
            continue
        changes = []
        for direction in (-1, 1):
            change = _one_sided_change(base_action, samples, direction)
            if change is not None:
                changes.append((direction, change[0], change[1]))
        if len(changes) == 1:
            direction, threshold, action = changes[0]
            deviations.append({"plane": cell[0], "row": cell[1], "upcard": cell[2],
                               "threshold": threshold, "action": action,
                               "direction": direction, "base_action": base_action})
        elif len(changes) > 1:
            ambiguous.append({"plane": cell[0], "row": cell[1], "upcard": cell[2],
                              "reason": "action changes on both sides of TC 0",
                              "base_action": base_action, "samples": samples})

    if include_insurance:
        positive = []
        for tc, data in sorted(sampled.items()):
            shoe = data["composition"]
            p_ten = shoe[10] / sum(shoe)
            ev = 0.5 * (3.0 * p_ten - 1.0)
            if tc > 0 and ev > 0:
                positive.append((tc, ev))
        if positive:
            threshold, ev = positive[0]
            deviations.append({"plane": "insurance", "row": 0, "upcard": 1,
                               "threshold": threshold, "action": "I", "direction": 1,
                               "base_action": "N", "ev_gain_per_opportunity": ev})
    return deviations, ambiguous


def _evaluate_job(payload):
    spec, chart_json, shoe = payload
    return evaluate_chart(DDMRules(**spec), chart_from_json(chart_json), shoe).ev


def score_deviations(rules: DDMRules, base_chart: Chart, tags: Sequence[float],
                     deviations: List[Dict], remaining_decks: float = 4.0,
                     workers: int = 0) -> List[Dict]:
    """Attach exact per-round EV gains at each index's first firing TC."""
    candidates = []
    scored: List[Dict] = []
    for deviation in deviations:
        row = dict(deviation)
        if row["plane"] == "insurance":
            row["ev_gain_per_round"] = None
            scored.append(row)
            continue
        shoe, actual = biased_composition(rules, tags, row["threshold"], remaining_decks)
        row["actual_tc_scored"] = actual
        scored.append(row)
        changed = chart_from_json(chart_to_json(base_chart))
        cell = (row["plane"], int(row["row"]), int(row["upcard"]))
        _set_action(changed, cell, row["action"])
        candidates.append((len(scored) - 1, int(row["threshold"]), shoe,
                           chart_to_json(changed)))
    worker_count = workers or min(len(candidates), max(1, (mp.cpu_count() or 2) - 1))
    if candidates:
        spec = _rules_spec(rules)
        base_json = chart_to_json(base_chart)
        thresholds = sorted({threshold for _, threshold, _, _ in candidates})
        shoe_by_threshold = {
            threshold: biased_composition(rules, tags, threshold, remaining_decks)[0]
            for threshold in thresholds
        }
        payloads = [(spec, base_json, shoe_by_threshold[threshold])
                    for threshold in thresholds]
        payloads += [(spec, changed_json, shoe)
                     for _, _, shoe, changed_json in candidates]
        if worker_count == 1:
            values = list(map(_evaluate_job, payloads))
        else:
            with mp.Pool(worker_count, maxtasksperchild=1) as pool:
                values = pool.map(_evaluate_job, payloads)
        base_ev = dict(zip(thresholds, values[:len(thresholds)]))
        changed_values = values[len(thresholds):]
        for (index, threshold, _, _), changed_ev in zip(candidates, changed_values):
            scored[index]["ev_gain_per_round"] = changed_ev - base_ev[threshold]
    return sorted(scored, key=lambda row: (row.get("ev_gain_per_round") is not None,
                                           row.get("ev_gain_per_round") or 0.0),
                  reverse=True)
