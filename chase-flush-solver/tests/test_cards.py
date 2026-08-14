import pytest
from chase_flush.cards import DECK, card_name, parse_card, parse_cards, rank, suit
from chase_flush.state import ActualState

def test_deck_unique_and_round_trips():
    assert len(DECK) == len(set(DECK)) == 52
    assert all(parse_card(card_name(c)) == c for c in DECK)
    assert rank(parse_card("Ah")) == 14
    assert suit(parse_card("Tc")) == 0

def test_duplicates_rejected():
    with pytest.raises(ValueError): parse_cards("Ah Ah")
    with pytest.raises(ValueError): ActualState((0,1,2), (3,4,5), (6,7,8,0))
