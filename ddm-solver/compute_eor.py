#!/usr/bin/env python3
"""Exact effect of removal per rank, and the counting systems it implies.

    python compute_eor.py --version 1 --ace-rule strict \
        --chart results/chart_v1_strict.json --json results/eor_v1.json

Uses the full-shoe total-dependent chart held fixed (the betting-relevant
flavour) and, with --optimal, also the re-optimised composition-dependent
flavour.  One exact solve per rank; no sampling error.
"""

from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import os
import time
from typing import Dict, List

from ddm import strategy
from ddm.cards import fresh_shoe, remove
from ddm.eor import (RANK_LABELS, RANK_ORDER, SYSTEMS, EORTable,
                     betting_correlation, correlation, describe_systems,
                     insurance_eor, integer_tags)
from ddm.exact import solve as solve_optimal
from ddm.rules import DDMRules


def _job(payload):
    spec, chart_json, rank, flavour = payload
    rules = DDMRules(**spec)
    shoe = fresh_shoe(rules.decks) if rank == 0 else remove(fresh_shoe(rules.decks), rank)
    if flavour == "optimal":
        return rank, solve_optimal(rules, shoe).ev
    chart = strategy.chart_from_json(chart_json)
    return rank, strategy.evaluate_chart(rules, chart, shoe).ev


def build_table(spec: Dict, chart_json: Dict, flavour: str, workers: int) -> EORTable:
    jobs = [(spec, chart_json, 0, flavour)]
    jobs += [(spec, chart_json, r, flavour) for r in RANK_ORDER]
    with mp.Pool(workers) as pool:
        results = dict(pool.map(_job, jobs))
    baseline = results[0]
    return EORTable(rules=DDMRules(**spec), baseline_ev=baseline, flavour=flavour,
                    eor=tuple(results[r] - baseline for r in RANK_ORDER))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--version", type=int, default=1, choices=(1, 2, 3))
    ap.add_argument("--decks", type=int, default=6)
    ap.add_argument("--ace-rule", default="strict", choices=("strict", "double_only"))
    ap.add_argument("--chart", default=None, help="reuse a chart from extract_strategy.py --json")
    ap.add_argument("--optimal", action="store_true", help="also compute the re-optimised flavour")
    ap.add_argument("--workers", type=int, default=0)
    ap.add_argument("--json", default=None)
    args = ap.parse_args()

    spec = {"bj_version": args.version, "decks": args.decks, "ace_rule": args.ace_rule}
    rules = DDMRules(**spec)
    workers = args.workers or min(11, mp.cpu_count())
    started = time.time()

    if args.chart and os.path.exists(args.chart):
        with open(args.chart) as fh:
            chart_json = json.load(fh)["chart"]
        missing = {"hard", "soft", "first", "ace_start"} - set(chart_json)
        if missing:
            ap.error("%s contains a legacy/incomplete chart (missing %s)" %
                     (args.chart, ", ".join(sorted(missing))))
        print("reusing chart from %s" % args.chart)
    else:
        print("deriving the full-shoe chart first ...")
        chart, _ = strategy.extract_chart(rules)
        chart_json = strategy.chart_to_json(chart)

    tables = {"fixed": build_table(spec, chart_json, "fixed", workers)}
    if args.optimal:
        tables["optimal"] = build_table(spec, chart_json, "optimal", workers)

    payload = {"rules": rules.describe(), "rule_spec": dict(rules.__dict__),
               "tables": {}, "systems": {}}
    for flavour, table in tables.items():
        print()
        print(table.render())
        payload["tables"][flavour] = {
            "baseline_ev": table.baseline_ev,
            "eor": {label: value for label, value in zip(RANK_LABELS, table.eor)},
        }

    table = tables["fixed"]
    print()
    print("=== counting systems against the betting EORs ===")

    derived: Dict[str, tuple] = {}
    for scale in (1, 2, 3, 4, 6):
        tags = integer_tags(table, scale)
        derived["ddm-%d" % scale] = tags
    print(describe_systems(table, derived))

    best = max(derived.items(), key=lambda kv: betting_correlation(kv[1], table))
    print()
    print("best derived integer system: %s  BC=%.4f  tags=%s"
          % (best[0], betting_correlation(best[1], table),
             " ".join("%d" % t for t in best[1])))

    ins = insurance_eor(rules)
    payload["systems"] = {
        name: {"tags": list(tags),
               "betting_correlation": betting_correlation(tags, table),
               "insurance_correlation": correlation(tags, ins)}
        for name, tags in list(derived.items()) + list(SYSTEMS.items())
    }
    print("\n%.1fs" % (time.time() - started))

    if args.json:
        with open(args.json, "w") as fh:
            json.dump(payload, fh, indent=2)
        print("wrote %s" % args.json)


if __name__ == "__main__":
    main()
