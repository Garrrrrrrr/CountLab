import pytest

from chase_flush.cards import parse_card, parse_cards
from chase_flush.compiled_exact import exact_opening_compiled, exact_stage2_compiled
from chase_flush.exact_analysis import exact_second_decision
from chase_flush.state import InformationState


def test_compiled_stage2_matches_independent_python_enumeration():
    state = InformationState(parse_cards("As Ks Js"), parse_cards("Ts 9s"), parse_card("Kh"))
    compiled = exact_stage2_compiled(state)
    reference = exact_second_decision(state)
    assert compiled.ev_a == pytest.approx(reference.bet_2x.total, abs=1e-12)
    assert compiled.ev_b == pytest.approx(reference.check.total, abs=1e-12)
    assert compiled.best_action == "2x"
    assert compiled.terminal_states == 979_110


def test_compiled_exact_opening_regression():
    state = InformationState(parse_cards("Ks Js Ts"), (), parse_card("9s"))
    result = exact_opening_compiled(state)
    assert result.ev_a == pytest.approx(4.467089548541369, abs=1e-12)
    assert result.ev_b == pytest.approx(3.773906393930919, abs=1e-12)
    assert result.best_action == "3x"
    assert result.terminal_states == 1_104_436_080
