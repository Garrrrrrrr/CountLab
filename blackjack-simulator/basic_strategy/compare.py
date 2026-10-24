"""Compare the app's resolved actions to EV-optimal total-dependent actions."""
import json, csv, os, sys
from collections import defaultdict

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
from ca import RANK_OF, hand_total  # noqa: E402

app = json.load(open(os.path.join(BASE, "app_actions.json")))
EV = {}
for d in (1, 2, 4, 6, 8):
    for s in ("h17", "s17"):
        EV[(d, s)] = json.load(open(os.path.join(BASE, "ev", f"ev_{d}_{s}.json")))


def pair_double_allowed(section, row, rule):
    if rule == "any":
        return True
    if section == "soft":
        return False
    if section == "hard":
        t = int(row)
    else:
        r = RANK_OF[row.split(",")[0]]
        if r == 0:
            return False  # A,A is soft 12
        t = 2 * (r + 1)
    return t in ((9, 10, 11) if rule == "9-11" else (10, 11))


def cell_evs(entries, section, row, dealer, das, sur, dbl, resplit=True):
    es10 = sur == "early" and dealer == "10"
    acts = ["S", "H"]
    if pair_double_allowed(section, row, dbl):
        acts.append("D")
    if section == "pairs":
        acts.append("P")
    if sur != "none":
        acts.append("R")
    out = {}
    W = sum(e["w"] for e in entries)
    WP = sum(e["w"] * e["pnb"] for e in entries)
    for a in acts:
        if a == "R":
            out[a] = -0.5
            continue
        if a == "P":
            # Resplitting is optional: take the better of always-resplit-to-4 and never-resplit.
            rs, nors = (e["ev"][f"P|{das}|{dbl}|rs"] for e in entries), (e["ev"][f"P|{das}|{dbl}|nors"] for e in entries)
            vals = [max(x, y) if resplit else y for x, y in zip(rs, nors)]
        else:
            vals = [e["ev"][a] for e in entries]
        if es10:
            out[a] = sum(e["w"] * (v - (1 - e["pnb"])) for e, v in zip(entries, vals)) / W
        else:
            out[a] = sum(e["w"] * v for e, v in zip(entries, vals)) / WP
    return out


rows_out = []
disc = []
for c in app:
    deck_key = (c["decks"], "h17" if c["h17"] else "s17")
    cellkey = f"{c['section']}:{c['row']}v{c['dealer']}"
    entries = EV[deck_key][cellkey]
    evs = cell_evs(entries, c["section"], c["row"], c["dealer"], c["das"], c["sur"], c["dbl"])
    evs_nors = cell_evs(entries, c["section"], c["row"], c["dealer"], c["das"], c["sur"], c["dbl"], resplit=False)
    best = max(evs, key=evs.get)
    best_nors = max(evs_nors, key=evs_nors.get)
    appa = c["action"]
    app_ev = evs.get(appa)
    margin = evs[best] - app_ev if app_ev is not None else None
    rec = dict(c)
    rec.update({
        "best": best, "best_noresplit": best_nors, "margin": margin,
        **{f"EV_{a}": round(v, 5) for a, v in evs.items()},
        "EV_P_noresplit": round(evs_nors["P"], 5) if "P" in evs_nors else None,
    })
    rows_out.append(rec)
    if best != appa:
        disc.append(rec)

fields = ["decks", "h17", "das", "sur", "dbl", "section", "row", "dealer", "code", "action", "fallback",
          "best", "best_noresplit", "margin", "EV_S", "EV_H", "EV_D", "EV_P", "EV_P_noresplit", "EV_R"]
with open(os.path.join(BASE, "comparison_full.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    for r in rows_out:
        w.writerow({k: r.get(k) for k in fields})
with open(os.path.join(BASE, "discrepancies.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    for r in disc:
        w.writerow({k: r.get(k) for k in fields})
print("cells compared", len(rows_out), "discrepancies", len(disc))
