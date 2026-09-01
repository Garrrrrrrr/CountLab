#!/usr/bin/env python3
"""Derive exact true-count strategy indices from biased shoe compositions."""

from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import time

from ddm.eor import SYSTEMS
from ddm.indices import charts_by_true_count, derive_deviations, score_deviations
from ddm.rules import DDMRules
from ddm.strategy import chart_from_json


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--chart", required=True, help="cached chart JSON")
    ap.add_argument("--system", default="hi-lo", choices=sorted(SYSTEMS))
    ap.add_argument("--version", type=int, default=1, choices=(1, 2, 3))
    ap.add_argument("--decks", type=int, default=6)
    ap.add_argument("--ace-rule", default="strict", choices=("strict", "double_only"))
    ap.add_argument("--remaining-decks", type=float, default=4.0)
    ap.add_argument("--tc-min", type=int, default=-8)
    ap.add_argument("--tc-max", type=int, default=8)
    ap.add_argument("--workers", type=int, default=0)
    ap.add_argument("--no-score", action="store_true")
    ap.add_argument("--resume", default=None,
                    help="reuse candidates/samples from a prior unscored JSON")
    ap.add_argument("--json", required=True)
    args = ap.parse_args()

    with open(args.chart) as fh:
        base_chart = chart_from_json(json.load(fh)["chart"])
    rules = DDMRules(bj_version=args.version, decks=args.decks, ace_rule=args.ace_rule)
    tags = SYSTEMS[args.system]
    tcs = list(range(args.tc_min, args.tc_max + 1))
    workers = args.workers or min(len(tcs), max(1, (mp.cpu_count() or 2) - 1))
    started = time.time()

    if args.resume:
        with open(args.resume) as fh:
            prior = json.load(fh)
        deviations = prior["deviations"]
        ambiguous = prior.get("ambiguous", [])
        sampled = {int(tc): data for tc, data in prior.get("samples", {}).items()}
        print("reusing %d candidates from %s" % (len(deviations), args.resume))
    else:
        print("extracting %d exact charts with %d workers ..." % (len(tcs), workers))
        sampled = charts_by_true_count(rules, tags, tcs, args.remaining_decks, workers)
        deviations, ambiguous = derive_deviations(base_chart, sampled)
    if not args.no_score:
        print("scoring %d candidate indices exactly ..." % len(deviations))
        deviations = score_deviations(rules, base_chart, tags, deviations,
                                      args.remaining_decks, workers)

    payload = {
        "rules": rules.describe(),
        "rule_spec": dict(rules.__dict__),
        "system": args.system,
        "tags": list(tags),
        "remaining_decks": args.remaining_decks,
        "true_counts": tcs,
        "deviations": deviations,
        "ambiguous": ambiguous,
        "samples": {str(tc): {"actual_tc": data["actual_tc"],
                               "composition": list(data["composition"])}
                    for tc, data in sampled.items()},
    }
    with open(args.json, "w") as fh:
        json.dump(payload, fh, indent=2)

    for row in deviations:
        gain = row.get("ev_gain_per_round")
        gain_text = "" if gain is None else " gain=%+.6f" % gain
        print(("%(plane)-9s %(row)2d vs %(upcard)2d: %(base_action)s -> %(action)s "
               "at TC %(threshold)+d (%(direction)+d)" % row) + gain_text)
    print("%d usable, %d ambiguous; wrote %s (%.1fs)" %
          (len(deviations), len(ambiguous), args.json, time.time() - started))


if __name__ == "__main__":
    main()
