#!/usr/bin/env python3
"""Exact house-edge solver CLI for Double Down Madness.

    python solve_exact.py --version 1 --decks 6 --ace-rule strict
    python solve_exact.py --grid --json results/exact_grid.json
"""

from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import time
from typing import Dict, List

from ddm.exact import solve
from ddm.rules import DDMRules


def _solve_one(spec: Dict) -> Dict:
    started = time.time()
    rules = DDMRules(**spec)
    result = solve(rules)
    return {
        "spec": spec,
        "house_edge": result.house_edge,
        "ev": result.ev,
        "avg_final_wager": result.avg_final_wager,
        "element_of_risk": result.element_of_risk,
        "prob_player_blackjack": result.prob_player_blackjack,
        "ev_by_upcard": list(result.ev_by_upcard),
        "states": result.states_evaluated,
        "seconds": time.time() - started,
    }


def default_grid() -> List[Dict]:
    grid = []
    for version in (1, 2, 3):
        for ace_rule in ("strict", "double_only"):
            grid.append({"bj_version": version, "decks": 6, "ace_rule": ace_rule})
    grid.append({"bj_version": 1, "decks": 8, "ace_rule": "strict"})
    grid.append({"bj_version": 1, "decks": 8, "ace_rule": "double_only"})
    grid.append({"bj_version": 1, "decks": 6, "ace_rule": "strict", "dealer_22_push": False})
    return grid


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--version", type=int, default=1, choices=(1, 2, 3))
    ap.add_argument("--decks", type=int, default=6)
    ap.add_argument("--ace-rule", default="strict", choices=("strict", "double_only"))
    ap.add_argument("--s17", action="store_true", help="dealer stands on soft 17")
    ap.add_argument("--no-dealer22", action="store_true", help="disable the dealer-22 push")
    ap.add_argument("--grid", action="store_true", help="solve the standard validation grid")
    ap.add_argument("--workers", type=int, default=0, help="0 = one per core")
    ap.add_argument("--json", default=None)
    args = ap.parse_args()

    if args.grid:
        specs = default_grid()
    else:
        specs = [{
            "bj_version": args.version,
            "decks": args.decks,
            "ace_rule": args.ace_rule,
            "dealer_hits_soft17": not args.s17,
            "dealer_22_push": not args.no_dealer22,
        }]

    started = time.time()
    if len(specs) > 1:
        workers = args.workers or min(len(specs), mp.cpu_count())
        with mp.Pool(workers) as pool:
            rows = pool.map(_solve_one, specs)
    else:
        rows = [_solve_one(specs[0])]

    header = "%-4s %-6s %-12s %-9s  %9s %9s %9s %9s" % (
        "ver", "decks", "ace_rule", "dealer22", "HE%", "EV", "avg wgr", "EoR%")
    print(header)
    print("-" * len(header))
    for row in rows:
        spec = row["spec"]
        print("%-4s %-6s %-12s %-9s  %8.4f%% %+9.6f %9.4f %8.4f%%" % (
            spec.get("bj_version", 1),
            spec.get("decks", 6),
            spec.get("ace_rule", "strict"),
            "push" if spec.get("dealer_22_push", True) else "lose",
            100 * row["house_edge"], row["ev"],
            row["avg_final_wager"], 100 * row["element_of_risk"]))
    print("\n%d solve(s) in %.1fs" % (len(rows), time.time() - started))

    if args.json:
        with open(args.json, "w") as fh:
            json.dump(rows, fh, indent=2)
        print("wrote %s" % args.json)


if __name__ == "__main__":
    main()
