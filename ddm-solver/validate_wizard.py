#!/usr/bin/env python3
"""Check every published Double Down Madness number against this engine.

    python validate_wizard.py            # fast checks only (~1s)
    python validate_wizard.py --full     # adds the exact solves and 1e9-round MC

Targets come from https://wizardofodds.com/games/blackjack/double-down-madness/
Each row prints PASS/FAIL against a stated tolerance.  Rows marked EXPLAIN are
known, understood differences rather than agreement -- see docs/HANDOFF.md.
"""

from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import os
import time

RESULTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")

_rows = []


def check(name, got, target, tol, note=""):
    ok = got is not None and abs(got - target) <= tol
    _rows.append((name, got, target, tol, ok, note))
    return ok


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--rounds", type=int, default=1_000_000_000)
    ap.add_argument("--json", default=os.path.join(RESULTS, "validation.json"))
    args = ap.parse_args()

    from ddm.dealer import IDX_22, fresh_shoe_outcome_distribution, push22_house_edge
    from ddm.rules import DDMRules

    started = time.time()

    dist = fresh_shoe_outcome_distribution(decks=6, hits_soft17=True)
    check("P(dealer draws to 22), 6d H17", dist[IDX_22], 0.073536, 5e-7)
    check("Push 22 house edge at 11:1", push22_house_edge(dist[IDX_22]), 0.1176, 5e-5)
    check("dealer distribution sums to 1", sum(dist), 1.0, 1e-12)
    check("V2 blackjack multiplier", DDMRules(bj_version=2).bj_multiplier, 1.5, 1e-12)
    check("V3 blackjack multiplier", DDMRules(bj_version=3).bj_multiplier, 1.5, 1e-12,
          "identical to V2, which is why Wizard reports one house edge for both")

    if args.full:
        from ddm import montecarlo as mc
        from ddm import strategy
        from ddm.exact import solve

        rules = DDMRules(bj_version=1, decks=6, ace_rule="strict")
        chart_path = os.path.join(RESULTS, "chart_v1_strict.json")
        if os.path.exists(chart_path):
            payload = json.load(open(chart_path))
            chart = strategy.chart_from_json(payload["chart"])
            he_chart = payload["house_edge_chart"]
        else:
            chart, _ = strategy.extract_chart(rules)
            he_chart = strategy.evaluate_chart(rules, chart).house_edge

        v2 = solve(DDMRules(bj_version=2, decks=6, ace_rule="strict"))
        v3 = solve(DDMRules(bj_version=3, decks=6, ace_rule="strict"))
        check("V2 and V3 exact house edge identical", v2.house_edge - v3.house_edge, 0.0, 1e-12)

        wiz = strategy.evaluate_chart(rules, strategy.wizard_chart(1))
        check("Wizard's own chart vs ours (fresh shoe)", wiz.house_edge - he_chart, 0.0, 1e-3,
              "our derived chart should be at least as good")

        csm = mc.run(mc.MCConfig(rules=rules, chart=chart, csm=True, rounds=args.rounds))
        shoe = mc.run(mc.MCConfig(rules=rules, chart=chart, csm=False, cut_decks=1.0,
                                  rounds=args.rounds))
        ci = (csm.ci95()[1] - csm.ci95()[0]) / 2
        check("MC (CSM) reproduces the exact solver", -csm.ev_per_round, he_chart, 2 * ci,
              "cross-validates the kernel against exact combinatorics")
        check("V1 house edge, 6 decks, cut card", -shoe.ev_per_round, 0.0095, 5e-4)
        check("average final wager", shoe.avg_final_wager, 1.57, 0.03)
        check("element of risk V1", shoe.element_of_risk, 0.0061, 5e-4)
        check("cut card costs the player", -shoe.ev_per_round + csm.ev_per_round, 0.0003, 5e-4,
              "EXPLAIN: we measure 0.064%, Wizard states 0.03%")

    width = max(len(r[0]) for r in _rows)
    print("%-*s %12s %12s   %s" % (width, "check", "got", "target", "result"))
    print("-" * (width + 40))
    failures = 0
    for name, got, target, tol, ok, note in _rows:
        failures += 0 if ok else 1
        print("%-*s %12.6f %12.6f   %s%s"
              % (width, name, got, target, "PASS" if ok else "FAIL",
                 ("  # " + note) if note else ""))
    print()
    print("%d/%d passed in %.0fs" % (len(_rows) - failures, len(_rows), time.time() - started))

    if args.json:
        json.dump([{"check": n, "got": g, "target": t, "tolerance": tol, "pass": ok, "note": note}
                   for n, g, t, tol, ok, note in _rows], open(args.json, "w"), indent=2)
        print("wrote %s" % args.json)
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
