"""Canonical Chase the Flush evaluator."""

from collections import defaultdict
from typing import Iterable
from .cards import Card, rank, suit

def flush_rank(cards: Iterable[Card]) -> tuple[int, ...]:
    """Return (length, ranks descending) for the best (longest, then highest) suit."""
    groups: dict[int, list[int]] = defaultdict(list)
    cards = tuple(cards)
    if len(set(cards)) != len(cards): raise ValueError("duplicate card")
    for card in cards: groups[suit(card)].append(rank(card))
    return max((len(rs), *sorted(rs, reverse=True)) for rs in groups.values())

QUALIFIER = (3, 9, 0, 0)

def dealer_qualifies(cards: Iterable[Card]) -> bool:
    value = flush_rank(cards)
    return value[0] > 3 or (value[0] == 3 and value[1] >= 9)
