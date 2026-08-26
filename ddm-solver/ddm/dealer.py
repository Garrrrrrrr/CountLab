"""Exact, composition-aware dealer outcome distributions.

The dealer's final total is bucketed into seven outcomes:

    index 0..4 -> stands on 17, 18, 19, 20, 21
    index 5    -> busts with exactly 22   (Double Down Madness pushes these)
    index 6    -> busts with 23 or more

A hand busts on its *hard* pip sum: promoting an ace to 11 only ever adds 10, so
once the hard total passes 21 no promotion can rescue it, and the bust total is
the hard total itself.  That is what makes "dealer draws to 22" well defined.

Every probability here is exact for the supplied composition -- cards the dealer
draws are removed as it draws them, so the distribution accounts for its own
depletion as well as whatever the caller already removed.
"""

from __future__ import annotations

from typing import Dict, Sequence, Tuple

from .cards import Composition, fresh_shoe, remove
from .hand import totals

N_OUTCOMES = 7
IDX_22 = 5
IDX_BUST_OTHER = 6

Distribution = Tuple[float, ...]

_ZERO: Distribution = (0.0,) * N_OUTCOMES


def _one_hot(index: int) -> Distribution:
    out = [0.0] * N_OUTCOMES
    out[index] = 1.0
    return tuple(out)


def _bust_bucket(hard: int) -> Distribution:
    return _one_hot(IDX_22 if hard == 22 else IDX_BUST_OTHER)


class DealerSolver:
    """Memoized dealer recursion.

    One instance per solve; the memo is keyed by the dealer's hand and the exact
    remaining composition, so it pays off within a subtree (the dealer's own
    draws) even though callers hand it a different deck for every player hand.
    """

    def __init__(self, hits_soft17: bool = True) -> None:
        self.hits_soft17 = hits_soft17
        self._memo: Dict[Tuple[int, int, Composition], Distribution] = {}

    def stands(self, hard: int, aces: int) -> bool:
        total, soft = totals(hard, aces)
        if total < 17:
            return False
        if total == 17 and soft and self.hits_soft17:
            return False
        return True

    def distribution(self, hard: int, aces: int, comp: Composition) -> Distribution:
        if hard > 21:
            return _bust_bucket(hard)
        if self.stands(hard, aces):
            return _one_hot(totals(hard, aces)[0] - 17)

        key = (hard, aces, comp)
        cached = self._memo.get(key)
        if cached is not None:
            return cached

        n = sum(comp)
        if n <= 0:
            raise ValueError(
                "dealer must draw at %d but the composition is exhausted" % hard
            )

        acc = [0.0] * N_OUTCOMES
        for rank in range(1, 11):
            count = comp[rank]
            if count == 0:
                continue
            p = count / n
            child = self.distribution(
                hard + rank, aces + (1 if rank == 1 else 0), remove(comp, rank)
            )
            for i in range(N_OUTCOMES):
                acc[i] += p * child[i]

        result = tuple(acc)
        self._memo[key] = result
        return result

    def from_two_cards(self, upcard: int, hole: int, comp: Composition) -> Distribution:
        """Distribution for a dealer holding ``upcard`` + ``hole``.

        ``comp`` must already exclude both of those cards (and any player cards).
        """
        hard = upcard + hole
        aces = (1 if upcard == 1 else 0) + (1 if hole == 1 else 0)
        return self.distribution(hard, aces, comp)


def fresh_shoe_outcome_distribution(
    decks: int = 6, hits_soft17: bool = True
) -> Distribution:
    """Dealer outcome distribution dealing both dealer cards off a full shoe.

    This is the Push 22 side bet's reference distribution: the bet resolves on
    the dealer's hand alone, and the dealer plays out even when every player has
    busted.  Blackjack lands in the 21 bucket, so it is already excluded from 22.
    """
    solver = DealerSolver(hits_soft17=hits_soft17)
    shoe = fresh_shoe(decks)
    n = sum(shoe)
    acc = [0.0] * N_OUTCOMES
    for up in range(1, 11):
        if shoe[up] == 0:
            continue
        p_up = shoe[up] / n
        after_up = remove(shoe, up)
        n2 = sum(after_up)
        for hole in range(1, 11):
            if after_up[hole] == 0:
                continue
            p = p_up * after_up[hole] / n2
            child = solver.from_two_cards(up, hole, remove(after_up, hole))
            for i in range(N_OUTCOMES):
                acc[i] += p * child[i]
    return tuple(acc)


def push22_house_edge(prob_22: float, payout: float = 11.0) -> float:
    """House edge of the Push 22 side bet at ``payout``-to-1."""
    return -(prob_22 * (payout + 1.0) - 1.0)
