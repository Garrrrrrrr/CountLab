"""Writes blackjack/lib/strategy/basic-strategy-audit.json from comparison_full.csv.

For each rule set and chart cell it keeps the EV-optimal first action, or "?"
when that action leads the runner-up by less than 0.002 units or changes with
the resplit model. The app's test suite asserts every non-"?" cell.
"""
import collections, csv, json, os

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "..", "..", "blackjack", "lib", "strategy", "basic-strategy-audit.json")
cells, sets = [], collections.OrderedDict()
with open(os.path.join(BASE, "comparison_full.csv")) as handle:
    for row in csv.DictReader(handle):
        key = f"{row['decks']}-{'h17' if row['h17'] == 'True' else 's17'}-{'das' if row['das'] == 'True' else 'nodas'}-{row['sur']}-{row['dbl']}"
        sets.setdefault(key, [])
        if len(sets) == 1:
            cells.append(f"{row['section']}:{row['row']}v{row['dealer']}")
        ev = {action: float(row[col]) for action, col in (("S", "EV_S"), ("H", "EV_H"), ("D", "EV_D"), ("R", "EV_R")) if row[col] != ""}
        splits = [float(row[col]) for col in ("EV_P", "EV_P_noresplit") if row[col] != ""]
        if splits:
            ev["P"] = max(splits)
        ranked = sorted(ev.values(), reverse=True)
        gap = ranked[0] - ranked[1] if len(ranked) > 1 else 1.0
        clear = row["best"] == row["best_noresplit"] and gap >= 0.002
        sets[key].append(row["best"] if clear else "?")
json.dump({
    "note": "EV-optimal first action per chart cell, from the exact finite-deck calculator in blackjack-simulator/basic_strategy/ca.py (peek game; EVs against a ten or ace conditioned on no dealer blackjack, except early surrender against a ten). '?' marks cells whose best action leads the runner-up by less than 0.002 units, or depends on the resplit model; the test skips those.",
    "cells": cells,
    "sets": {key: "".join(value) for key, value in sets.items()},
}, open(OUT, "w"), separators=(",", ":"))
print("wrote", OUT)
