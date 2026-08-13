from chase_flush.cards import parse_cards
from chase_flush.hand_rank import flush_rank

def r(s): return flush_rank(parse_cards(s))

def test_flush_lengths_and_ranks():
    assert r("Ah Kh Qh Jh Th 9h 8h") == (7,14,13,12,11,10,9,8)
    assert r("Ah Kh Qh Jh Th 9h 2c")[:2] == (6,14)
    assert r("Ah Kh Qh Jh Th 2c 3d")[0] == 5
    assert r("Ah Kh 8h 4h Qc Jc Td") == (4,14,13,8,4)
    assert r("Ah Kh 8h 4c Qc Jc Td")[0] == 3

def test_comparison_tie_kickers_and_length():
    assert r("Ah Kh 8h 4h 2c 3d 5s") > r("Ah Qh Jh Th 2c 3d 5s")
    assert r("Ah Kh Qh 2c 3d 4s 5s") == r("As Ks Qs 2c 3d 4h 5h")
    assert r("2h 3h 4h 5h 2c 3d 6s") > r("Ah Kh Qh 2c 3d 4s 6d")
