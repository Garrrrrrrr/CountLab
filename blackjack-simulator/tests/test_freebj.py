import numpy as np

from freebj import DOUBLE, HIT, SPLIT, STAND, SURRENDER, freebj_action


def hand(*cards):
    result = np.zeros(12, dtype=np.int8)
    result[:len(cards)] = cards
    return result


def action(cards, dealer, tc=0, surrender=True):
    return freebj_action(hand(*cards), len(cards), dealer, True, len(cards) == 2, surrender, False, tc)


def test_freebj_departures_obey_the_published_boundaries():
    assert action((10, 6), 8, 4, False) == HIT
    assert action((10, 6), 8, 5, False) == STAND
    assert action((10, 3), 3, -2, False) == STAND
    assert action((10, 3), 3, -3, False) == HIT
    assert action((1, 8), 5, 1, False) == STAND
    assert action((1, 8), 5, 2, False) == DOUBLE
    assert action((10, 10), 4, 6, False) == STAND
    assert action((10, 10), 4, 7, False) == SPLIT


def test_freebj_no_surrender_departures_do_not_replace_late_surrender():
    # FreeBJ's default catalog is for no surrender. CountLab's baseline has
    # late surrender, which remains the valid basic-strategy action here.
    assert action((10, 6), 9, 10, True) == SURRENDER
    assert action((10, 5), 10, 10, True) == SURRENDER
