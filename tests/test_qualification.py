from chase_flush.cards import parse_cards
from chase_flush.hand_rank import dealer_qualifies

def q(s): return dealer_qualifies(parse_cards(s))

def test_exact_boundary():
    assert not q("8h 7h 6h Ac Kd Qs 2c")
    assert q("9h 3h 2h Ac Kd Qs 4c")
    assert q("Th 3h 2h Ac Kd Qs 4c")
    assert q("5h 4h 3h 2h Ac Kd Qs")
