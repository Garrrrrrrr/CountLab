#!/usr/bin/env python3
"""Derive the total-dependent chart, diff it against Wizard, and price both.

    python extract_strategy.py --version 1 --ace-rule strict
"""

from __future__ import annotations

import argparse
import json

from ddm import strategy
from ddm.exact import solve
from ddm.rules import DDMRules


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--version", type=int, default=1, choices=(1, 2, 3))
    ap.add_argument("--decks", type=int, default=6)
    ap.add_argument("--ace-rule", default="strict", choices=("strict", "double_only"))
    ap.add_argument("--json", default=None)
    args = ap.parse_args()

    rules = DDMRules(bj_version=args.version, decks=args.decks, ace_rule=args.ace_rule)
    print(rules.describe())
    print()

    chart, cd_result = strategy.extract_chart(rules)
    print("=== derived total-dependent chart ===")
    print(chart.render())
    print()

    wiz = strategy.wizard_chart(args.version)
    rows = strategy.diff(wiz, chart, "wizard", "ours")
    print("=== chart diff vs Wizard (%d cells differ) ===" % len(rows))
    for row in rows:
        print("  " + row)
    print()

    td_result = strategy.evaluate_chart(rules, chart)
    wiz_result = strategy.evaluate_chart(rules, wiz)

    print("=== house edge by strategy ===")
    print("  composition-dependent optimal   %8.4f%%   avg wager %.4f" % (
        100 * cd_result.house_edge, cd_result.avg_final_wager))
    print("  our total-dependent chart       %8.4f%%   avg wager %.4f" % (
        100 * td_result.house_edge, td_result.avg_final_wager))
    print("  Wizard's published chart        %8.4f%%   avg wager %.4f" % (
        100 * wiz_result.house_edge, wiz_result.avg_final_wager))
    print()
    print("  cost of playing a chart         %8.4f%%" % (
        100 * (td_result.house_edge - cd_result.house_edge)))
    print("  our chart vs Wizard's           %8.4f%%" % (
        100 * (wiz_result.house_edge - td_result.house_edge)))

    if args.json:
        payload = {
            "rules": rules.describe(),
            "chart": strategy.chart_to_json(chart),
            "diff_vs_wizard": rows,
            "house_edge": {
                "cd_optimal": cd_result.house_edge,
                "our_chart": td_result.house_edge,
                "wizard_chart": wiz_result.house_edge,
            },
            "avg_final_wager": {
                "cd_optimal": cd_result.avg_final_wager,
                "our_chart": td_result.avg_final_wager,
                "wizard_chart": wiz_result.avg_final_wager,
            },
        }
        with open(args.json, "w") as fh:
            json.dump(payload, fh, indent=2)
        print("\nwrote %s" % args.json)


if __name__ == "__main__":
    main()
