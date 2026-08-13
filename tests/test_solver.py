from chase_flush.cards import parse_card, parse_cards
from chase_flush.state import ActualState, InformationState
from chase_flush.solver import Solver

def test_river_action_values_and_no_leakage():
    info = InformationState(parse_cards("Ah 8h 4c"), parse_cards("2h 7s 3d 9c"), parse_card("Kh"))
    a = ActualState(info.player, (parse_card("Kh"), parse_card("Qc"), parse_card("Jd")), info.board)
    b = ActualState(info.player, (parse_card("Kh"), parse_card("2c"), parse_card("3c")), info.board)
    assert a.information(4) == b.information(4) == info
    solver = Solver(samples=5, seed=9)
    assert solver.get_decision(a.information(4)) == solver.get_decision(b.information(4))
    assert set(solver.decision(info).action_evs) == {"1x", "fold"}

def test_reveal_stages():
    p = parse_cards("Ah 8h 4c")
    assert InformationState(p).stage == 1
    assert InformationState(p, parse_cards("2h 7s")).stage == 2
    assert InformationState(p, parse_cards("2h 7s 3d 9c")).stage == 3
