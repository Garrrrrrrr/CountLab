from collections import defaultdict
from itertools import combinations

import pytest

from chase_flush.cards import DECK, parse_card, parse_cards, rank, suit
from chase_flush.exact_analysis import (
    exact_second_decision,
    monte_carlo_second_decision,
    payoff_bounds,
)
from chase_flush.hand_rank import flush_rank
from chase_flush.solver import Solver
from chase_flush.state import ActualState, InformationState


STATE = InformationState(
    parse_cards("As Ks Js"), parse_cards("Ts 9s"), parse_card("Kh")
)


@pytest.fixture(scope="module")
def exact_result():
    return exact_second_decision(STATE)


def _reference_rank(cards):
    groups = {s: [] for s in range(4)}
    for card in cards:
        groups[suit(card)].append(rank(card))
    return max((len(values), *sorted(values, reverse=True)) for values in groups.values())


def _reference_payoff(player, dealer, wager):
    player_rank, dealer_rank = _reference_rank(player), _reference_rank(dealer)
    qualifies = dealer_rank[0] > 3 or (dealer_rank[0] == 3 and dealer_rank[1] >= 9)
    if player_rank == dealer_rank:
        return 0.0, 0.0, 0.0
    if player_rank < dealer_rank:
        return (-1.0 if qualifies else 0.0), -1.0, -float(wager)
    xtra = {4: 1.0, 5: 5.0, 6: 50.0, 7: 250.0}.get(player_rank[0], 0.0)
    return (1.0 if qualifies else 0.0), xtra, float(wager)


def brute_force_ev_second_decision(state):
    """Dealer-first reference, deliberately independent of the optimized loop."""
    remaining = tuple(card for card in DECK if card not in state.visible)
    bet = [0.0, 0.0, 0.0]
    by_board = defaultdict(lambda: [0.0, 0.0, 0.0, 0])
    terminals = 0
    for hidden in combinations(remaining, 2):
        hidden_set = set(hidden)
        board_pool = tuple(card for card in remaining if card not in hidden_set)
        dealer = (state.dealer_visible, *hidden)
        for future in combinations(board_pool, 2):
            board = state.board + future
            player_cards, dealer_cards = state.player + board, dealer + board
            two = _reference_payoff(player_cards, dealer_cards, 2)
            one = _reference_payoff(player_cards, dealer_cards, 1)
            for index in range(3):
                bet[index] += two[index]
                by_board[tuple(sorted(future))][index] += one[index]
            by_board[tuple(sorted(future))][3] += 1
            terminals += 1
    check = [0.0, 0.0, 0.0]
    for ante, xtra, all_in, count in by_board.values():
        if (ante + xtra + all_in) / count >= -2.0:
            check[0] += ante / count
            check[1] += xtra / count
            check[2] += all_in / count
        else:
            check[0] -= 1.0
            check[1] -= 1.0
    boards = len(by_board)
    return (
        tuple(value / terminals for value in bet),
        tuple(value / boards for value in check),
        terminals,
    )


def test_five_card_flush_regression(exact_result):
    assert flush_rank(parse_cards("As Ks Js Ts 9s")) == (5, 14, 13, 11, 10, 9)
    assert exact_result.bet_2x.total == pytest.approx(27.644914258867747)
    assert exact_result.check.total == pytest.approx(26.64547190816148)
    assert exact_result.best_action == "2x"
    assert exact_result.margin == pytest.approx(0.999442350706267)
    assert exact_result.terminal_states == 979_110


def test_xtra_same_for_2x_and_check(exact_result):
    assert exact_result.folded_boards == 0
    assert abs(exact_result.bet_2x.xtra - exact_result.check.xtra) < 1e-12


def test_exact_matches_bruteforce(exact_result):
    bet, check, terminals = brute_force_ev_second_decision(STATE)
    assert bet == pytest.approx((exact_result.bet_2x.ante, exact_result.bet_2x.xtra, exact_result.bet_2x.all_in))
    assert check == pytest.approx((exact_result.check.ante, exact_result.check.xtra, exact_result.check.all_in))
    assert terminals == exact_result.terminal_states


def test_optimized_solver_matches_exact(exact_result):
    decision = Solver(samples=2, seed=7).decision(STATE)
    assert decision.exact
    assert decision.action_evs == pytest.approx({"2x": exact_result.bet_2x.total, "check": exact_result.check.total})


def test_monte_carlo_matches_exact(exact_result):
    sampled = monte_carlo_second_decision(STATE, exact_result, samples=1_000_000, seed=12345)
    assert abs(sampled.bet_mean - exact_result.bet_2x.total) <= 4 * sampled.bet_standard_error
    assert abs(sampled.check_mean - exact_result.check.total) <= 4 * sampled.check_standard_error


def test_no_hidden_dealer_information_leakage():
    board = parse_cards("Ts 9s 4c 5d")
    actual_a = ActualState(STATE.player, parse_cards("Kh 2c 3d"), board)
    actual_b = ActualState(STATE.player, parse_cards("Kh Qc Qd"), board)
    info_a, info_b = actual_a.information(4), actual_b.information(4)
    assert info_a == info_b
    solver = Solver()
    assert solver.action(info_a) == solver.action(info_b)


def test_check_does_not_double_count_child_ev(exact_result):
    assert exact_result.check.total == pytest.approx(
        exact_result.check.ante + exact_result.check.xtra + exact_result.check.all_in
    )
    assert exact_result.check.ante == pytest.approx(exact_result.bet_2x.ante)


def test_ante_not_double_counted(exact_result):
    assert -1 <= exact_result.bet_2x.ante <= 1
    assert -1 <= exact_result.check.ante <= 1


def test_ev_within_payoff_bounds(exact_result):
    for action, ev in (("2x", exact_result.bet_2x.total), ("1x", exact_result.check.total)):
        low, high = payoff_bounds(STATE, action)
        assert low <= ev <= high


def test_flush_evaluator_five_six_and_seven_spades():
    five = parse_cards("As Ks Js Ts 9s 2c 3d")
    six = parse_cards("As Ks Js Ts 9s 8s 3d")
    seven = parse_cards("As Ks Js Ts 9s 8s 7s")
    assert flush_rank(five) == (5, 14, 13, 11, 10, 9)
    assert flush_rank(six) == (6, 14, 13, 11, 10, 9, 8)
    assert flush_rank(seven) == (7, 14, 13, 11, 10, 9, 8, 7)
