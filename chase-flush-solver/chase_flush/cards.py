"""Compact, deterministic 0..51 card representation."""

from typing import Iterable, TypeAlias

Card: TypeAlias = int
RANK_CHARS = "23456789TJQKA"
SUIT_CHARS = "cdhs"

def rank(card: Card) -> int:
    if not 0 <= card < 52: raise ValueError(f"invalid card: {card}")
    return card % 13 + 2

def suit(card: Card) -> int:
    if not 0 <= card < 52: raise ValueError(f"invalid card: {card}")
    return card // 13

def card_name(card: Card) -> str:
    return RANK_CHARS[rank(card)-2] + SUIT_CHARS[suit(card)]

def parse_card(value: str) -> Card:
    value = value.strip()
    if len(value) != 2: raise ValueError(f"card must have two characters: {value!r}")
    r, s = value[0].upper(), value[1].lower()
    if r not in RANK_CHARS or s not in SUIT_CHARS: raise ValueError(f"invalid card: {value!r}")
    return SUIT_CHARS.index(s) * 13 + RANK_CHARS.index(r)

def parse_cards(value: str | Iterable[str]) -> tuple[Card, ...]:
    values = value.split() if isinstance(value, str) else value
    cards = tuple(parse_card(v) for v in values)
    if len(set(cards)) != len(cards): raise ValueError("duplicate card")
    return cards

DECK = tuple(range(52))
