import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import indextiers


def action(cards: list[int], dealer: int, tc: int = 0) -> int:
    enabled, _ = indextiers.tier_mask("full")
    hand = np.zeros(12, dtype=np.int8)
    hand[:len(cards)] = cards
    return indextiers.action_at(
        hand, len(cards), dealer, cards[0] == cards[1], True, True, False,
        tc, enabled,
    )


def test_table_has_late_surrender_rows_and_preserves_basic_strategy():
    assert indextiers.TABLE_ROWS == 768
    none, _ = indextiers.tier_mask("none")
    hand = np.zeros(12, dtype=np.int8)
    hand[:2] = [5, 6]
    # Disabling departures retains 11 v 6 double, rather than the TDI table's
    # lower-tail hit action.
    assert indextiers.action_at(hand, 2, 6, False, True, True, False, 0, none) == indextiers.DOUBLE
    assert action([10, 6], 10) == indextiers.SURRENDER
    assert action([10, 5], 10, 3) == indextiers.SURRENDER
    assert action([10, 5], 10, 4) == indextiers.STAND


def test_tier_sets_are_nested_except_for_named_i18_fab4():
    assert set(indextiers.TIER_PLAYS["none"]).issubset(indextiers.TIER_PLAYS["70"])
    assert set(indextiers.TIER_PLAYS["70"]).issubset(indextiers.TIER_PLAYS["82"])
    assert "Insurance|A" in indextiers.TIER_PLAYS["70"]
