#!/usr/bin/env python3
"""Monte Carlo shoe/ramp analysis for Double Down Madness."""

from __future__ import annotations

import argparse
import json
import os
import time
from typing import Dict, List, Optional, Sequence, Tuple

from ddm.bankroll import optimal_ramp, summarize
from ddm.eor import SYSTEMS
from ddm.montecarlo import FLAT_RAMP, MCConfig, Z95, run
from ddm.rules import DDMRules
from ddm.strategy import chart_from_json


def _csv(text: str, cast):
    return [cast(value.strip()) for value in text.split(",") if value.strip()]


def _parse_ramp(text: str) -> Tuple[Tuple[int, float], ...]:
    points = []
    for item in text.split(","):
        tc, bet = item.split(":", 1)
        points.append((int(tc), float(bet)))
    if not points:
        raise ValueError("ramp must contain TC:units points")
    return tuple(sorted(points))


def _load_tags(name: str, eor_path: Optional[str]) -> Sequence[float]:
    if name in SYSTEMS:
        return SYSTEMS[name]
    if not eor_path:
        raise ValueError("system %s requires --eor" % name)
    with open(eor_path) as fh:
        systems = json.load(fh)["systems"]
    if name not in systems:
        raise ValueError("system %s is absent from %s" % (name, eor_path))
    return tuple(systems[name]["tags"])


def _load_deviations(path: Optional[str], limit: int) -> List[Dict]:
    if not path:
        return []
    with open(path) as fh:
        rows = json.load(fh)["deviations"]
    insurance = [row for row in rows if row["plane"] == "insurance"]
    candidates = [row for row in rows
                  if row["plane"] != "insurance" and
                  (row.get("ev_gain_per_round") or 0.0) > 0]
    candidates.sort(key=lambda row: row["ev_gain_per_round"], reverse=True)
    if limit >= 0:
        candidates = candidates[:limit]
    # Keep analysis-only fields in the JSON artifact, but the kernel ignores
    # all keys outside the documented deviation schema.
    return candidates + insurance


def _bet_at(tc: int, ramp: Sequence[Tuple[int, float]]) -> float:
    bet = float(ramp[0][1])
    for threshold, value in sorted(ramp):
        if tc >= threshold:
            bet = float(value)
    return bet


def _scaled_buckets(rows: Sequence[Dict], ramp: Sequence[Tuple[int, float]]) -> List[Dict]:
    out = []
    for source in rows:
        row = dict(source)
        bet = _bet_at(int(row["tc"]), ramp)
        row["ramp_bet"] = bet
        row["ev_per_round"] *= bet
        row["sd"] *= bet
        row["se"] *= bet
        row["ci95"] *= bet
        row["avg_bet"] = bet
        row["edge_per_unit_bet"] = row["ev_per_round"] / bet if bet else 0.0
        out.append(row)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--chart", required=True)
    ap.add_argument("--indices", default=None)
    ap.add_argument("--index-limit", type=int, default=18,
                    help="top positive exact-gain play indices (0=insurance only, -1=all); insurance is retained")
    ap.add_argument("--system", default="hi-lo")
    ap.add_argument("--eor", default=None, help="EOR JSON containing derived systems")
    ap.add_argument("--tag-divisor", type=float, default=1.0,
                    help="normalize a higher-level count's tags before TC conversion")
    ap.add_argument("--version", type=int, default=1, choices=(1, 2, 3))
    ap.add_argument("--decks", type=int, default=6)
    ap.add_argument("--ace-rule", default="strict", choices=("strict", "double_only"))
    ap.add_argument("--cut-decks", default="1.0",
                    help="comma-separated decks left behind cut card")
    ap.add_argument("--spots", default="1",
                    help="comma-separated total table spots, hero included")
    ap.add_argument("--tc-modes", default="exact", help="exact,half,full (comma-separated)")
    ap.add_argument("--csm", action="store_true")
    ap.add_argument("--rounds", type=int, default=100_000_000)
    ap.add_argument("--tasks", type=int, default=0)
    ap.add_argument("--seed", type=int, default=20260825)
    ap.add_argument("--ramp", default="optimal",
                    help="optimal or comma-separated TC:units points")
    ap.add_argument("--max-spread", type=float, default=16.0)
    ap.add_argument("--chip-increment", type=float, default=1.0)
    ap.add_argument("--hands-per-hour", type=float, default=100.0)
    ap.add_argument("--hours", type=float, default=100.0)
    ap.add_argument("--bankroll", type=float, default=10_000.0)
    ap.add_argument("--target-risk", type=float, default=0.05)
    ap.add_argument("--json", required=True)
    args = ap.parse_args()

    with open(args.chart) as fh:
        chart = chart_from_json(json.load(fh)["chart"])
    rules = DDMRules(bj_version=args.version, decks=args.decks, ace_rule=args.ace_rule)
    if args.tag_divisor <= 0:
        ap.error("--tag-divisor must be positive")
    tags = tuple(value / args.tag_divisor
                 for value in _load_tags(args.system, args.eor))
    deviations = _load_deviations(args.indices, args.index_limit)
    cuts = _csv(args.cut_decks, float)
    spots = _csv(args.spots, int)
    modes = _csv(args.tc_modes, str)
    started = time.time()
    results = []

    for cut in cuts:
        for spot_count in spots:
            for mode in modes:
                config = MCConfig(rules=rules, chart=chart, tags=tags, ramp=FLAT_RAMP,
                                  cut_decks=cut, spots=spot_count, csm=args.csm,
                                  tc_mode=mode, rounds=args.rounds, tasks=args.tasks,
                                  seed=args.seed, deviations=deviations)
                sampled = run(config)
                flat_rows = sampled.bucket_rows()
                ramp = (optimal_ramp(flat_rows, args.max_spread, args.chip_increment)
                        if args.ramp == "optimal" else _parse_ramp(args.ramp))
                metrics = summarize(flat_rows, ramp, args.hands_per_hour,
                                    args.bankroll, args.target_risk, args.hours)
                metrics["ci95"] = Z95 * metrics["sd_per_round"] / sampled.rounds ** 0.5
                row = {
                    "cut_decks": cut, "spots": spot_count, "tc_mode": mode,
                    "csm": args.csm, "rounds": sampled.rounds,
                    "ramp": [[tc, bet] for tc, bet in ramp],
                    "metrics": metrics,
                    "buckets": _scaled_buckets(flat_rows, ramp),
                }
                results.append(row)
                print("cut %.2f spots %d %-5s EV/round %+.6f ± %.6f  "
                      "EV/hour %+.3f SD/hour %.3f N0 %.0f" %
                      (cut, spot_count, mode, metrics["ev_per_round"], metrics["ci95"],
                       metrics["ev_per_hour"], metrics["sd_per_hour"],
                       metrics["n0_rounds"]))

    payload = {
        "rules": rules.describe(), "rule_spec": dict(rules.__dict__),
        "system": args.system, "tags": list(tags),
        "tag_divisor": args.tag_divisor,
        "index_source": args.indices, "index_limit": args.index_limit,
        "deviations_used": deviations, "rounds_requested_per_scenario": args.rounds,
        "seed": args.seed, "tasks": args.tasks or (os.cpu_count() or 4),
        "hands_per_hour": args.hands_per_hour, "bankroll": args.bankroll,
        "target_risk": args.target_risk, "results": results,
        "elapsed_seconds": time.time() - started,
    }
    with open(args.json, "w") as fh:
        json.dump(payload, fh, indent=2)
    print("wrote %s (%.1fs)" % (args.json, time.time() - started))


if __name__ == "__main__":
    main()
