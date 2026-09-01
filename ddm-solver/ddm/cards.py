"""Card and shoe-composition primitives.

Ranks are integers 1..10 where 1 is an Ace and 10 covers every ten-value card
(T, J, Q, K).  Suits are never tracked: the only rule that cares about suit is
the Version 1/3 suited-blackjack bonus, and for an ace paired with a ten-value
card exactly 4 of the 16 ten-value cards per deck share the ace's suit, so
P(suited | blackjack) = 1/4 independent of composition.  ``rules.bj_multiplier``
folds that constant into a single expected payout instead.

A shoe composition is a length-11 tuple of counts indexed by rank; index 0 is
unused padding so that ``comp[rank]`` needs no offset arithmetic.
"""

from __future__ import annotations

from typing import Sequence, Tuple

ACE = 1
TEN = 10
RANKS = tuple(range(1, 11))

# Cards per deck by rank: one each of A,2..9 per suit, four ten-value per suit.
PER_DECK = (0, 4, 4, 4, 4, 4, 4, 4, 4, 4, 16)

Composition = Tuple[int, ...]


def fresh_shoe(decks: int) -> Composition:
    """Full composition for ``decks`` standard 52-card decks."""
    return tuple(count * decks for count in PER_DECK)


def total_cards(comp: Sequence[int]) -> int:
    return sum(comp)


def remove(comp: Composition, rank: int) -> Composition:
    """Composition with one card of ``rank`` removed."""
    if comp[rank] <= 0:
        raise ValueError("cannot remove rank %d from an exhausted composition" % rank)
    out = list(comp)
    out[rank] -= 1
    return tuple(out)


def remove_many(comp: Composition, ranks: Sequence[int]) -> Composition:
    out = list(comp)
    for rank in ranks:
        if out[rank] <= 0:
            raise ValueError("cannot remove rank %d from an exhausted composition" % rank)
        out[rank] -= 1
    return tuple(out)


def draw_probabilities(comp: Composition) -> Tuple[float, ...]:
    """Uniform next-card probabilities by rank (index 0 is always 0.0)."""
    n = sum(comp)
    if n <= 0:
        raise ValueError("empty composition has no draw distribution")
    return tuple(count / n for count in comp)


def rank_name(rank: int) -> str:
    return "A" if rank == ACE else ("T" if rank == TEN else str(rank))
