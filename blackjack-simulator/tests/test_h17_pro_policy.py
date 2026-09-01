import numpy as np

from h17_pro import HIT, SPLIT, STAND, h17_pro_pro_action


def policy(cards, dealer, tc, surrender=True):
    hand = np.zeros(12, dtype=np.int8)
    hand[:2] = cards
    return h17_pro_pro_action(hand, 2, dealer, True, True, surrender, False, tc)


def test_corrected_chart_only_departures():
    assert policy((10, 10), 4, 5) == STAND
    assert policy((10, 10), 4, 6) == SPLIT
    assert policy((10, 6), 9, 3, surrender=False) == HIT
    assert policy((10, 6), 9, 4, surrender=False) == STAND
    assert policy((8, 8), 10, 8) == SPLIT
