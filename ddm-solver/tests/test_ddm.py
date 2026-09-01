"""Golden tests for the Double Down Madness engine.

Everything here is exact: no sampling, so every assertion is an equality up to
floating-point tolerance rather than a statistical bound.
"""

from __future__ import annotations

import numpy as np
import pytest

from ddm import hand
from ddm.bankroll import (finite_horizon_risk, normal_cdf, required_bankroll,
                          simultaneous_hand_variance_factor)
from ddm.cards import fresh_shoe, remove, total_cards
from ddm.dealer import (IDX_22, IDX_BUST_OTHER, DealerSolver,
                        fresh_shoe_outcome_distribution, push22_house_edge)
from ddm.eor import EORTable, SYSTEMS, betting_correlation, integer_tags
from ddm.exact import DOUBLE, ExactSolver
from ddm.indices import biased_composition
from ddm.montecarlo import MCConfig, run
from ddm.rules import DDMRules
from ddm.strategy import chart_from_json, chart_to_json, wizard_chart


# --- primitives -----------------------------------------------------------

def test_fresh_shoe_sizes():
    assert total_cards(fresh_shoe(6)) == 312
    assert total_cards(fresh_shoe(8)) == 416
    assert fresh_shoe(6)[10] == 96  # sixteen ten-value cards per deck


def test_hand_totals():
    assert hand.totals(*hand.from_ranks([1, 6])) == (17, True)      # soft 17
    assert hand.totals(*hand.from_ranks([1, 6, 10])) == (17, False)  # reverts to hard
    assert hand.totals(*hand.from_ranks([1, 1])) == (12, True)
    assert hand.totals(*hand.from_ranks([1])) == (11, True)          # lone ace
    assert hand.is_bust(hand.from_ranks([10, 10, 10])[0])


def test_blackjack_needs_exactly_two_cards():
    assert hand.is_blackjack((1, 10)) and hand.is_blackjack((10, 1))
    assert not hand.is_blackjack((1, 5, 5))
    assert not hand.is_blackjack((10, 10))


def test_version_2_and_3_pay_the_same_on_average():
    # Suited blackjacks are exactly 1/4 of all blackjacks, so 3:2/3:2 and
    # 3:1/1:1 blend to the same expected payout. Wizard reporting an identical
    # house edge for both versions is the external confirmation.
    assert DDMRules(bj_version=2).bj_multiplier == pytest.approx(1.5)
    assert DDMRules(bj_version=3).bj_multiplier == pytest.approx(1.5)
    assert DDMRules(bj_version=1).bj_multiplier == pytest.approx(1.625)


# --- dealer ---------------------------------------------------------------

def test_dealer_distribution_is_a_distribution():
    dist = fresh_shoe_outcome_distribution(decks=6, hits_soft17=True)
    assert sum(dist) == pytest.approx(1.0, abs=1e-12)
    assert all(p >= 0.0 for p in dist)


def test_dealer_draws_to_22_matches_wizard():
    """The Push 22 reference number, published to six decimals."""
    dist = fresh_shoe_outcome_distribution(decks=6, hits_soft17=True)
    assert dist[IDX_22] == pytest.approx(0.073536, abs=5e-7)
    assert push22_house_edge(dist[IDX_22]) == pytest.approx(0.1176, abs=5e-5)


def test_dealer_hits_soft_17_only_when_configured():
    h17 = DealerSolver(hits_soft17=True)
    s17 = DealerSolver(hits_soft17=False)
    assert not h17.stands(7, 1)   # A+6 is soft 17
    assert s17.stands(7, 1)
    assert h17.stands(17, 0)      # hard 17 always stands
    assert h17.stands(7, 1) is False


def test_dealer_bust_total_is_the_hard_total():
    solver = DealerSolver()
    # 10+6 then a forced 6 from a deck of nothing but sixes lands on exactly 22.
    comp = tuple([0] * 6 + [12] + [0] * 4)  # twelve sixes, nothing else
    dist = solver.distribution(16, 0, comp)
    assert dist[IDX_22] == pytest.approx(1.0)
    assert dist[IDX_BUST_OTHER] == pytest.approx(0.0)


# --- settlement -----------------------------------------------------------

def _one_hot(index):
    out = [0.0] * 7
    out[index] = 1.0
    return tuple(out)


def test_dealer_22_pushes_standing_wagers():
    push = ExactSolver(DDMRules(dealer_22_push=True))
    lose = ExactSolver(DDMRules(dealer_22_push=False))
    dist = _one_hot(IDX_22)
    assert push._settle(20, dist) == pytest.approx(0.0)
    assert lose._settle(20, dist) == pytest.approx(1.0)
    # Any other bust total is an ordinary win under both.
    assert push._settle(20, _one_hot(IDX_BUST_OTHER)) == pytest.approx(1.0)


def test_settlement_compares_totals():
    solver = ExactSolver(DDMRules())
    assert solver._settle(20, _one_hot(19 - 17)) == pytest.approx(1.0)
    assert solver._settle(19, _one_hot(19 - 17)) == pytest.approx(0.0)
    assert solver._settle(18, _one_hot(19 - 17)) == pytest.approx(-1.0)
    assert solver._settle(16, _one_hot(17 - 17)) == pytest.approx(-1.0)


# --- doubling and blackjack ----------------------------------------------

def test_double_multiplier_escalates_the_whole_wager():
    assert DDMRules().double_multiplier == pytest.approx(2.0)
    assert DDMRules(double_fraction=0.5).double_multiplier == pytest.approx(1.5)


def test_blackjack_after_a_double_pays_on_the_doubled_wager():
    """A lone ten that can only draw an ace must double into a blackjack.

    Canterbury's posted rules: "If you choose to double down and receive a
    blackjack, you will receive a complete blackjack payout."  With a full
    double the stake is 2 units and version 1 blends to 1.625, so the hand is
    worth 3.25 units.
    """
    rules = DDMRules(bj_version=1)
    solver = ExactSolver(rules)
    solver._upcard = 6
    solver._banned_hole = 0
    comp = tuple([0, 12] + [0] * 9)  # twelve aces and nothing else
    ev, wager, action = solver._value(10, 0, 1, comp)
    assert action == DOUBLE
    assert ev == pytest.approx(2.0 * rules.bj_multiplier)
    assert wager == pytest.approx(2.0)


def test_peek_adjusted_draw_probabilities_match_brute_force():
    """The closed form must equal explicit enumeration over the hole card.

    Conditioning on "the hole card is not a ten" leaves the unseen pile the
    player draws from slightly ten-rich; the solver folds that into a closed
    form, and this pins it to the definition.
    """
    solver = ExactSolver(DDMRules())
    comp = (0, 5, 3, 4, 2, 6, 3, 4, 5, 2, 20)
    for banned in (0, 1, 10):
        solver._banned_hole = banned
        got = solver._draw_probs(comp)
        m = sum(comp)
        allowed = m if banned == 0 else m - comp[banned]
        brute = [0.0] * 11
        for h in range(1, 11):
            if comp[h] == 0 or h == banned:
                continue
            p_h = comp[h] / allowed
            after = remove(comp, h)
            for r in range(1, 11):
                brute[r] += p_h * after[r] / sum(after)
        assert sum(got) == pytest.approx(1.0)
        for r in range(1, 11):
            assert got[r] == pytest.approx(brute[r], abs=1e-12)


def test_all_pushes_when_only_tens_remain():
    """A tens-only shoe: player stands 20, dealer makes 20, everything pushes."""
    rules = DDMRules(bj_version=1, peek=False)
    shoe = tuple([0] * 10 + [40])
    result = ExactSolver(rules, shoe).solve()
    assert result.ev == pytest.approx(0.0, abs=1e-12)
    assert result.avg_final_wager == pytest.approx(1.0)


# --- counting analysis and deviations -------------------------------------

def test_betting_count_correlates_with_effect_of_removed_cards():
    # Removing low cards helps the player in the audited V1 EOR table, so the
    # standard positive Hi-Lo low-card tags must have a positive correlation.
    eor = (-0.0024360, 0.0017863, 0.0016890, 0.0020040, 0.0021609,
           0.0020536, 0.0010304, 0.0002333, -0.0005991, -0.0019806)
    table = EORTable(DDMRules(), -0.008860, tuple(eor), "fixed")
    assert betting_correlation(SYSTEMS["hi-lo"], table) > 0.97
    assert integer_tags(table, 1) == SYSTEMS["hi-lo"]


@pytest.mark.parametrize("target", (-8, -3, 0, 4, 8))
def test_biased_composition_preserves_size_and_true_count(target):
    rules = DDMRules(decks=6)
    shoe, actual = biased_composition(rules, SYSTEMS["hi-lo"], target, 4.0)
    assert sum(shoe) == 4 * 52
    assert actual == pytest.approx(target)
    assert all(0 <= shoe[r] <= fresh_shoe(6)[r] for r in range(11))


def test_bankroll_math_matches_countlab_conventions():
    assert normal_cdf(0) == pytest.approx(0.5, abs=1e-6)
    assert normal_cdf(1.96) == pytest.approx(0.975, abs=1e-3)
    assert finite_horizon_risk(10_000, 1, 100, 0) == 0
    assert required_bankroll(0.5, 100, 0.05) == pytest.approx(299.573, abs=0.01)
    assert simultaneous_hand_variance_factor(2) == pytest.approx(2 * 1.3724)


def test_always_firing_deviation_matches_changed_chart():
    base = wizard_chart(1)
    changed = chart_from_json(chart_to_json(base))
    changed.hard[(17, 2)] = "H"
    deviation = {
        "plane": "hard", "row": 17, "upcard": 2,
        "threshold": -999, "action": "H", "direction": 1,
    }
    common = dict(rules=DDMRules(), rounds=20_000, tasks=1, seed=4242,
                  cut_decks=1.0)
    via_deviation = run(MCConfig(chart=base, deviations=(deviation,), **common))
    via_chart = run(MCConfig(chart=changed, **common))
    assert via_deviation.rounds == via_chart.rounds
    assert np.array_equal(via_deviation.counts, via_chart.counts)
    assert np.array_equal(via_deviation.profit_sum, via_chart.profit_sum)
    assert np.array_equal(via_deviation.square_sum, via_chart.square_sum)
    assert via_deviation.counts.sum() == via_deviation.rounds
