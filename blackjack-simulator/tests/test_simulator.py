import numpy as np

from simulate import (
    DOUBLE,
    HIT,
    SPLIT,
    STAND,
    SURRENDER,
    bucket_index,
    choose_action,
    floored_true_count,
    hand_value,
    hilo,
)


def hand(*cards):
    result = np.zeros(12, dtype=np.int8)
    result[: len(cards)] = cards
    return result


def action(cards, dealer, tc=0, indices=True, surrender=True):
    return choose_action(hand(*cards), len(cards), dealer, True, len(cards) == 2, surrender, False, tc, indices)


def test_hilo_is_balanced():
    assert sum(hilo(rank) * (16 if rank == 10 else 4) for rank in range(1, 11)) == 0


def test_hand_values_soft_aces():
    assert hand_value(hand(1, 6), 2) == (17, True)
    assert hand_value(hand(1, 1, 9), 3) == (21, True)
    assert hand_value(hand(1, 6, 10), 3) == (17, False)


def test_true_count_floor_and_buckets():
    assert floored_true_count(7, 104) == 3
    assert floored_true_count(-7, 104) == -4
    assert bucket_index(-20, 52) == 0
    assert bucket_index(20, 52) == 16


def test_default_h17_basic_strategy():
    assert action((8, 8), 1, indices=False) == SURRENDER
    assert action((10, 7), 1, indices=False) == SURRENDER
    assert action((9, 8), 1, indices=False) == STAND
    assert action((1, 7), 2, indices=False, surrender=False) == DOUBLE
    assert action((9, 9), 7, indices=False, surrender=False) == STAND
    assert action((1, 1), 10, indices=False, surrender=False) == SPLIT


def test_index_boundaries_are_explicit():
    assert action((10, 5), 10, tc=-1) == HIT
    assert action((10, 5), 10, tc=0) == SURRENDER
    assert action((10, 5), 10, tc=4) == STAND
    assert action((7, 7), 10, tc=3) == SURRENDER
    assert action((10, 2), 6, tc=-4, surrender=False) == HIT
    assert action((10, 2), 6, tc=-3, surrender=False) == STAND
    assert action((10, 10), 5, tc=4, surrender=False) == STAND
    assert action((10, 10), 5, tc=5, surrender=False) == SPLIT
