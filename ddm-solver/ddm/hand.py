"""Player and dealer hand arithmetic.

Hands are carried as ``(hard, aces)`` where ``hard`` is the pip sum counting
every ace as 1 and ``aces`` is how many aces are present.  A hand is soft when
promoting one ace to 11 keeps the total at or below 21.
"""

from __future__ import annotations

from typing import Iterable, Tuple

BUST = 22  # any total strictly above 21; callers compare against 21 directly


def add_card(hard: int, aces: int, rank: int) -> Tuple[int, int]:
    return hard + rank, aces + (1 if rank == 1 else 0)


def totals(hard: int, aces: int) -> Tuple[int, bool]:
    """Return ``(best_total, is_soft)``."""
    if aces > 0 and hard + 10 <= 21:
        return hard + 10, True
    return hard, False


def best_total(hard: int, aces: int) -> int:
    return totals(hard, aces)[0]


def is_soft(hard: int, aces: int) -> bool:
    return totals(hard, aces)[1]


def is_bust(hard: int) -> bool:
    """A hand busts on its hard total; ace promotion can never rescue it."""
    return hard > 21


def from_ranks(ranks: Iterable[int]) -> Tuple[int, int]:
    hard = 0
    aces = 0
    for rank in ranks:
        hard, aces = add_card(hard, aces, rank)
    return hard, aces


def is_blackjack(ranks: Tuple[int, ...]) -> bool:
    """True for exactly two cards making ace + ten-value."""
    return len(ranks) == 2 and sorted(ranks) == [1, 10]
