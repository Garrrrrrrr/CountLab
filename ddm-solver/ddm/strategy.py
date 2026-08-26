"""Total-dependent strategy charts: extraction, evaluation and diffing.

The exact solver plays composition-dependent optimal, which no human can do at a
table and which is *not* what Wizard of Odds publishes.  To compare like with
like -- and to produce a chart a player could actually use -- this module

1. aggregates the solver's per-state action EVs into a total-dependent chart,
   weighting each state by how often that exact card multiset actually occurs,
2. re-solves exactly while *following that fixed chart*, giving the house edge
   of the playable strategy rather than of an omniscient one.

The gap between the two is the price of using a chart instead of tracking your
own hand composition, and it is the main reason a correct solver lands below a
published basic-strategy house edge.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from .cards import Composition, remove
from .exact import DOUBLE, HIT, STAND, ExactResult, ExactSolver
from .hand import totals
from .rules import DDMRules

UPCARDS = (2, 3, 4, 5, 6, 7, 8, 9, 10, 1)  # display order, ace last
UPCARD_LABELS = ("2", "3", "4", "5", "6", "7", "8", "9", "10", "A")

HARD_ROWS = tuple(range(2, 18))   # 17 stands for "17 or more"
SOFT_ROWS = tuple(range(12, 20))  # 19 stands for "19 or more"
FIRST_ROWS = tuple(range(2, 11))  # the player's single first card, ace excluded


@dataclass
class Chart:
    """A playable total-dependent chart.

    One-card hands get their own table.  They are not the same decision as a
    multi-card hand of the same total, because only a one-card hand can still
    draw to a *blackjack*: a lone ten that catches an ace is paid at the
    blackjack rate on the whole doubled wager, while 4+6 reaching 21 is just 21.
    That is why Wizard states "always double a ten-point first card" as prose
    alongside a hard-10 chart row that says hit against a ten or an ace -- the
    two rows are different hands, not a contradiction.
    """

    hard: Dict[Tuple[int, int], str] = field(default_factory=dict)
    soft: Dict[Tuple[int, int], str] = field(default_factory=dict)
    first: Dict[Tuple[int, int], str] = field(default_factory=dict)
    ace_start: Dict[int, str] = field(default_factory=dict)

    def lookup(self, total: int, soft: bool, upcard: int, ncards: int = 2) -> str:
        if ncards == 1 and not soft:
            return self.first.get((total, upcard), STAND)
        if soft:
            row = min(max(total, 12), 19)
            return self.soft.get((row, upcard), STAND)
        row = min(max(total, 2), 17)
        return self.hard.get((row, upcard), STAND)

    def render(self) -> str:
        out = []
        for name, rows, table in (("First", FIRST_ROWS, self.first),
                                  ("Hard", HARD_ROWS, self.hard),
                                  ("Soft", SOFT_ROWS, self.soft)):
            out.append("%-5s %s" % (name, " ".join("%3s" % l for l in UPCARD_LABELS)))
            for row in rows:
                label = str(row)
                if name == "Hard" and row == 17:
                    label = "17+"
                elif name == "Soft" and row == 19:
                    label = "19+"
                cells = " ".join("%3s" % table.get((row, u), "-") for u in UPCARDS)
                out.append("%-5s %s" % (label, cells))
            out.append("")
        out.append("Lone ace first card: " + " ".join(
            "%s=%s" % (l, self.ace_start.get(u, "-")) for l, u in zip(UPCARD_LABELS, UPCARDS)))
        return "\n".join(out)


def diff(a: Chart, b: Chart, label_a: str = "a", label_b: str = "b") -> List[str]:
    """Cells where two charts disagree."""
    rows = []
    tables = {"first": (a.first, b.first), "hard": (a.hard, b.hard), "soft": (a.soft, b.soft)}
    for kind, table_rows in (("first", FIRST_ROWS), ("hard", HARD_ROWS), ("soft", SOFT_ROWS)):
        ta, tb = tables[kind]
        for row in table_rows:
            for u, label in zip(UPCARDS, UPCARD_LABELS):
                va, vb = ta.get((row, u)), tb.get((row, u))
                if va is not None and vb is not None and va != vb:
                    rows.append("%s %-3s vs %-2s : %s=%s  %s=%s"
                                % (kind, row, label, label_a, va, label_b, vb))
    for u, label in zip(UPCARDS, UPCARD_LABELS):
        va, vb = a.ace_start.get(u), b.ace_start.get(u)
        if va is not None and vb is not None and va != vb:
            rows.append("ace vs %-2s : %s=%s  %s=%s" % (label, label_a, va, label_b, vb))
    return rows


def _parse(text: str, rows: Tuple[int, ...]) -> Dict[Tuple[int, int], str]:
    table: Dict[Tuple[int, int], str] = {}
    lines = [ln for ln in text.strip().splitlines() if ln.strip()]
    if len(lines) != len(rows):
        raise ValueError("expected %d rows, got %d" % (len(rows), len(lines)))
    for row, line in zip(rows, lines):
        cells = line.split()
        actions = cells[1:] if not cells[0].isalpha() else cells
        actions = [c for c in actions if c in (STAND, HIT, DOUBLE)]
        if len(actions) != 10:
            raise ValueError("row %s: expected 10 actions, got %d" % (row, len(actions)))
        for u, action in zip(UPCARDS, actions):
            table[(row, u)] = action
    return table


# Wizard of Odds published basic strategy, transcribed from the two chart images
# on https://wizardofodds.com/games/blackjack/double-down-madness/
# Columns are dealer 2 3 4 5 6 7 8 9 10 A.
WIZARD_HARD = """
2   H H H H D D H H H H
3   H H H H D H H H H H
4   H H H H H H H H H H
5   H H H H H H H H H H
6   H H H H H H H H H H
7   H H H H H H H H H H
8   H H H D D D H H H H
9   H D D D D D D H H H
10  D D D D D D D D H H
11  D D D D D D D D D D
12  H H H S S H H H H H
13  H S S S S H H H H H
14  S S S S S H H H H H
15  S S S S S H H H H H
16  S S S S S H H H H H
17  S S S S S S S S S S
"""

WIZARD_SOFT = """
12  H D D D D D D H H H
13  H H D D D D D H H H
14  H H H D D D H H H H
15  H H H H D H H H H H
16  H H H H D H H H H H
17  H H H H D D H H H H
18  S S S D D S S H H H
19  S S S S S S S S S S
"""


def wizard_chart(version: int = 1) -> Chart:
    """Wizard's published chart.

    His two prose rules sit outside the tables: always double a ten-value first
    card (already implied by the hard-10 row), and always double a first-card
    ace except ace vs. ace in versions 2 and 3, where he says hit.
    """
    ace_start = {u: DOUBLE for u in UPCARDS}
    if version in (2, 3):
        ace_start[1] = HIT
    hard = _parse(WIZARD_HARD, HARD_ROWS)
    # One-card hands follow the same rows except for the ten, which his prose
    # promotes to an unconditional double.
    first = {(r, u): (DOUBLE if r == 10 else hard[(r, u)]) for r in FIRST_ROWS for u in UPCARDS}
    return Chart(hard=hard, soft=_parse(WIZARD_SOFT, SOFT_ROWS),
                 first=first, ace_start=ace_start)


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------

def extract_chart(rules: Optional[DDMRules] = None,
                  shoe: Optional[Composition] = None) -> Tuple[Chart, ExactResult]:
    """Solve exactly, then aggregate the per-state action EVs into a chart.

    Each state contributes with the probability of the player actually holding
    that card multiset against that upcard, so a cell's decision reflects the
    real mix of compositions behind the total rather than an unweighted average.
    """
    solver = ExactSolver(rules, shoe)
    solver.collect = True

    # bucket -> [stand, hit, double] EV accumulated against reach weight
    buckets: Dict[Tuple[str, int, int], List[float]] = defaultdict(lambda: [0.0, 0.0, 0.0])
    ace_buckets: Dict[int, List[float]] = defaultdict(lambda: [0.0, 0.0, 0.0])

    def visit(p1: int, up: int, unseen: Composition, weight: float, node) -> None:
        if p1 == 1:
            # The lone-ace decision is its own rule; recompute its three action
            # EVs directly rather than folding it into the soft-11 row.
            stand_ev = solver._stand_value(1, 1, unseen)
            probs = solver._draw_probs(unseen)
            capped = 0.0
            free = 0.0
            for r in range(1, 11):
                p = probs[r]
                if p == 0.0:
                    continue
                child_comp = remove(unseen, r)
                if r == 10:
                    capped += p * rules_bj
                    free += p * rules_bj
                    continue
                capped += p * solver._stand_value(1 + r, 1, child_comp)
                free += p * solver._value(1 + r, 1, 2, child_comp)[0]
            hit_ev = capped if solver.rules.ace_rule == "strict" else free
            acc = ace_buckets[up]
            acc[0] += weight * stand_ev
            acc[1] += weight * hit_ev
            acc[2] += weight * solver.rules.double_multiplier * capped
            if solver.rules.ace_rule != "strict":
                return
            return

        # Forward reach pass over exactly the states the solver just evaluated,
        # expanding every non-busting draw regardless of the optimal action so
        # that every chart cell gets weight.
        frontier: Dict[Tuple[int, int, int, Composition], float] = {(p1, 0, 1, unseen): weight}
        while frontier:
            nxt: Dict[Tuple[int, int, int, Composition], float] = defaultdict(float)
            for key, w in frontier.items():
                hard, aces, ncards, comp = key
                if ncards == 2 and aces == 1 and hard == 11:
                    continue  # blackjack, no decision to make
                evs = solver.action_ev.get(key)
                if evs is None:
                    continue
                total, soft = totals(hard, aces)
                if ncards == 1:
                    acc = buckets[("first", total, up)]
                else:
                    row = min(max(total, 12), 19) if soft else min(max(total, 2), 17)
                    acc = buckets[("soft" if soft else "hard", row, up)]
                for i in range(3):
                    acc[i] += w * evs[i]
                probs = solver._draw_probs(comp)
                for r in range(1, 11):
                    p = probs[r]
                    if p == 0.0 or hard + r > 21:
                        continue
                    nxt[(hard + r, aces + (1 if r == 1 else 0), ncards + 1, remove(comp, r))] += w * p
            frontier = nxt

    rules_bj = (rules or DDMRules()).bj_multiplier
    solver.on_round = visit
    result = solver.solve()

    chart = Chart()
    for (kind, row, up), acc in buckets.items():
        action = (STAND, HIT, DOUBLE)[max(range(3), key=lambda i: acc[i])]
        {"hard": chart.hard, "soft": chart.soft, "first": chart.first}[kind][(row, up)] = action
    for up, acc in ace_buckets.items():
        chart.ace_start[up] = (STAND, HIT, DOUBLE)[max(range(3), key=lambda i: acc[i])]
    return chart, result


# ---------------------------------------------------------------------------
# Fixed-chart evaluation
# ---------------------------------------------------------------------------

class ChartSolver(ExactSolver):
    """Exact evaluation of a fixed total-dependent chart.

    Same removal-accurate machinery as ``ExactSolver``; only the action choice
    changes, from argmax to chart lookup.
    """

    def __init__(self, rules: Optional[DDMRules], chart: Chart, shoe: Optional[Composition] = None):
        super().__init__(rules, shoe)
        self.chart = chart

    def _value(self, hard, aces, ncards, comp):
        if hard > 21:
            return (-1.0, 1.0, STAND)
        if ncards == 2 and aces == 1 and hard == 11:
            return (self.rules.bj_multiplier, 1.0, STAND)

        key = (hard, aces, ncards, comp)
        cached = self._memo.get(key)
        if cached is not None:
            return cached

        total, soft = totals(hard, aces)
        action = self.chart.lookup(total, soft, self._upcard, ncards)

        if action == STAND:
            node = (self._stand_value(hard, aces, comp), 1.0, STAND)
        else:
            probs = self._draw_probs(comp)
            hit_ev = 0.0
            hit_wager = 0.0
            for r in range(1, 11):
                p = probs[r]
                if p == 0.0:
                    continue
                nh = hard + r
                if nh > 21:
                    hit_ev += p * -1.0
                    hit_wager += p * 1.0
                else:
                    child = self._value(nh, aces + (1 if r == 1 else 0), ncards + 1, remove(comp, r))
                    hit_ev += p * child[0]
                    hit_wager += p * child[1]
            if action == DOUBLE:
                mult = self.rules.double_multiplier
                node = (mult * hit_ev, mult * hit_wager, DOUBLE)
            else:
                node = (hit_ev, hit_wager, HIT)

        self._memo[key] = node
        return node

    def _value_ace_start(self, comp):
        action = self.chart.ace_start.get(self._upcard, DOUBLE)
        probs = self._draw_probs(comp)
        capped = 0.0
        free_ev = 0.0
        free_wager = 0.0
        for r in range(1, 11):
            p = probs[r]
            if p == 0.0:
                continue
            child_comp = remove(comp, r)
            if r == 10:
                capped += p * self.rules.bj_multiplier
                free_ev += p * self.rules.bj_multiplier
                free_wager += p * 1.0
                continue
            capped += p * self._stand_value(1 + r, 1, child_comp)
            child = self._value(1 + r, 1, 2, child_comp)
            free_ev += p * child[0]
            free_wager += p * child[1]

        if action == STAND:
            return (self._stand_value(1, 1, comp), 1.0, STAND)
        if action == DOUBLE:
            mult = self.rules.double_multiplier
            return (mult * capped, mult * 1.0, DOUBLE)
        if self.rules.ace_rule == "strict":
            return (capped, 1.0, HIT)
        return (free_ev, free_wager, HIT)


def evaluate_chart(rules: Optional[DDMRules], chart: Chart,
                   shoe: Optional[Composition] = None) -> ExactResult:
    return ChartSolver(rules, chart, shoe).solve()


def chart_to_json(chart: Chart) -> Dict:
    return {
        "hard": {"%d,%d" % k: v for k, v in chart.hard.items()},
        "soft": {"%d,%d" % k: v for k, v in chart.soft.items()},
        "first": {"%d,%d" % k: v for k, v in chart.first.items()},
        "ace_start": {str(k): v for k, v in chart.ace_start.items()},
    }


def chart_from_json(payload: Dict) -> Chart:
    def rows(section):
        out = {}
        for key, value in payload[section].items():
            row, up = key.split(",")
            out[(int(row), int(up))] = value
        return out

    return Chart(hard=rows("hard"), soft=rows("soft"), first=rows("first"),
                 ace_start={int(k): v for k, v in payload["ace_start"].items()})
