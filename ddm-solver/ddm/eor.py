"""Effect of removal, and counting systems derived from it.

This is the piece the Reddit thread's top comment asked for and the piece the
original project could not do by Monte Carlo.  The effect of removing one card
of a given rank on the player's expectation is on the order of 0.01-0.1%, while
the standard deviation of a single round is about 1.15, so a simulation would
need roughly 5e10 rounds *per rank* to resolve it.  Exactly re-solving the shoe
with one card removed costs one solve per rank and has no sampling error at all.

    EOR_r = EV(shoe - one card of rank r) - EV(full shoe)

Two flavours are produced.  ``fixed`` holds the full-shoe basic strategy chart
constant, isolating the pure composition effect on a flat bet -- that is the one
a betting count should correlate with.  ``optimal`` lets the strategy re-optimise
against the depleted shoe, so the difference between the two is the value of
knowing the composition rather than merely betting on it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

from .cards import Composition, fresh_shoe, remove
from .rules import DDMRules

RANK_LABELS = ("A", "2", "3", "4", "5", "6", "7", "8", "9", "T")
# Cards of each rank in one deck, in RANK_LABELS order.
RANK_WEIGHTS = (4, 4, 4, 4, 4, 4, 4, 4, 4, 16)
RANK_ORDER = (1, 2, 3, 4, 5, 6, 7, 8, 9, 10)

# Published systems, indexed in RANK_LABELS order (A first, tens last).
SYSTEMS: Dict[str, Tuple[float, ...]] = {
    "hi-lo":     (-1, 1, 1, 1, 1, 1, 0, 0, 0, -1),
    "hi-opt-ii": (0, 1, 1, 2, 2, 1, 1, 0, 0, -2),
    "zen":       (-1, 1, 1, 2, 2, 2, 1, 0, 0, -2),
    "halves":    (-1, 0.5, 1, 1, 1.5, 1, 0.5, 0, -0.5, -1),
    "ko":        (-1, 1, 1, 1, 1, 1, 1, 0, 0, -1),
}


@dataclass(frozen=True)
class EORTable:
    rules: DDMRules
    baseline_ev: float
    eor: Tuple[float, ...]          # in RANK_LABELS order, change in player EV
    flavour: str

    def render(self) -> str:
        lines = ["%s  (%s strategy)" % (self.rules.describe(), self.flavour),
                 "  baseline player EV %+0.6f  (house edge %.4f%%)"
                 % (self.baseline_ev, -100 * self.baseline_ev),
                 "  rank    EOR(%)      EOR normalised"]
        scale = max(abs(v) for v in self.eor) or 1.0
        for label, value in zip(RANK_LABELS, self.eor):
            lines.append("  %-4s %+9.5f   %+7.3f" % (label, 100 * value, value / scale))
        return "\n".join(lines)


def _weighted_center(values: Sequence[float]) -> List[float]:
    total = sum(RANK_WEIGHTS)
    mean = sum(w * v for w, v in zip(RANK_WEIGHTS, values)) / total
    return [v - mean for v in values]


def correlation(tags: Sequence[float], effects: Sequence[float]) -> float:
    """Griffin-style correlation between a tag vector and an effect vector.

    Both are centred and summed over all 52 cards, so the sixteen ten-value
    cards carry four times the weight of any other rank.
    """
    t = _weighted_center(tags)
    e = _weighted_center(effects)
    num = sum(w * a * b for w, a, b in zip(RANK_WEIGHTS, t, e))
    dt = sum(w * a * a for w, a in zip(RANK_WEIGHTS, t))
    de = sum(w * b * b for w, b in zip(RANK_WEIGHTS, e))
    if dt <= 0 or de <= 0:
        return 0.0
    return num / (dt * de) ** 0.5


def betting_correlation(tags: Sequence[float], table: EORTable) -> float:
    """Correlation of a count's tags with what removing a card actually does."""
    return correlation(tags, table.eor)


def insurance_eor(rules: Optional[DDMRules] = None) -> Tuple[float, ...]:
    """Effect of removal on the insurance bet, computed in closed form.

    Insurance pays 2:1 when the hole card is a ten, so its EV is 3*p10 - 1 where
    p10 is the ten density of the cards unseen to the player.  Removing a ten
    lowers p10; removing anything else raises it.
    """
    rules = rules or DDMRules()
    shoe = fresh_shoe(rules.decks)
    n = sum(shoe)
    base = 3.0 * shoe[10] / n - 1.0
    out = []
    for rank in RANK_ORDER:
        depleted = remove(shoe, rank)
        out.append((3.0 * depleted[10] / sum(depleted) - 1.0) - base)
    return tuple(out)


def integer_tags(table: EORTable, scale: int) -> Tuple[int, ...]:
    """Small-integer tags approximating EOR at a given granularity."""
    peak = max(abs(v) for v in table.eor) or 1.0
    return tuple(int(round(scale * v / peak)) for v in table.eor)


def balance(tags: Sequence[float]) -> float:
    """Sum of tags over a full deck; zero means the count is balanced."""
    return sum(w * t for w, t in zip(RANK_WEIGHTS, tags))


def describe_systems(table: EORTable, extra: Optional[Dict[str, Sequence[float]]] = None) -> str:
    catalog: Dict[str, Sequence[float]] = dict(SYSTEMS)
    if extra:
        catalog.update(extra)
    ins = insurance_eor(table.rules)
    lines = ["  %-14s %8s %8s  %-s" % ("system", "BC", "IC", "tags (A 2 3 4 5 6 7 8 9 T)")]
    for name, tags in catalog.items():
        lines.append("  %-14s %8.4f %8.4f  %s%s" % (
            name,
            betting_correlation(tags, table),
            correlation(tags, ins),
            " ".join("%g" % t for t in tags),
            "" if abs(balance(tags)) < 1e-9 else "   (unbalanced, sum=%+g)" % balance(tags),
        ))
    return "\n".join(lines)
