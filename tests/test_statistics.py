import math

import pytest

from chase_flush.statistics import RunningMoments, decision_status


def test_integer_moments_and_merge_match_direct_calculation():
    left, right = RunningMoments(), RunningMoments()
    left.update_aggregates(2, 3, 5)   # 1, 2
    right.update_aggregates(2, 7, 25) # 3, 4
    left.merge(right)
    assert left.count == 4
    assert left.mean == 2.5
    assert left.variance == pytest.approx(5 / 3)
    assert left.standard_error == pytest.approx(math.sqrt(5 / 12))


def test_decision_requires_precision_and_interval_excluding_zero():
    clear = RunningMoments(1_000_000, 1_000_000, 2_000_000)
    assert decision_status(clear, 0.999, 0.01) == "ACTION_A_CONFIRMED"
    noisy = RunningMoments(100, 1, 100)
    assert decision_status(noisy, 0.999, 0.01) == "INCONCLUSIVE"


def test_round_trip_preserves_exact_large_integer_aggregates():
    original = RunningMoments(4_000_000_000_000, 1234567890123, 9876543210987654)
    restored = RunningMoments.from_dict(original.to_dict())
    assert restored == original
