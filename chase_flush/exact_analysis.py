"""Exact, auditable decision analysis for the two-board-card decision."""
from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations
from math import sqrt
from random import Random

from .cards import DECK, Card
from .hand_rank import flush_rank
from .payouts import settle
from .rules import XTRA_PAYTABLE
from .state import InformationState


@dataclass(frozen=True, slots=True)
class PayoffExpectation:
    ante: float
    xtra: float
    all_in: float

    @property
    def total(self) -> float:
        return self.ante + self.xtra + self.all_in


@dataclass(frozen=True, slots=True)
class ExactSecondDecision:
    bet_2x: PayoffExpectation
    check: PayoffExpectation
    best_action: str
    margin: float
    remaining_cards: int
    dealer_hidden_combinations_per_board: int
    future_board_combinations: int
    terminal_states: int
    folded_boards: int
    board_actions: dict[tuple[Card, Card], str]


def _expectation(values: list[float], denominator: int) -> PayoffExpectation:
    return PayoffExpectation(*(value / denominator for value in values))


def exact_second_decision(state: InformationState) -> ExactSecondDecision:
    """Enumerate board pairs first, then condition the final action on each board.

    Both dealer and board pairs are unordered. Every disjoint assignment has
    probability 1 / (C(n,2) C(n-2,2)), exactly matching the physical deal after
    the six observed cards. Grouping by board is required so 1x/fold cannot see
    the two hidden dealer cards.
    """
    if state.stage != 2 or state.dealer_visible is None:
        raise ValueError("exact second-decision analysis requires two board cards and one exposed dealer card")
    remaining = tuple(card for card in DECK if card not in state.visible)
    bet_sums = [0.0, 0.0, 0.0]
    check_sums = [0.0, 0.0, 0.0]
    board_actions: dict[tuple[Card, Card], str] = {}
    terminal_states = folded_boards = board_count = dealer_count = 0
    for future in combinations(remaining, 2):
        future_set = set(future)
        dealer_pool = tuple(card for card in remaining if card not in future_set)
        board = state.board + future
        call_sums = [0.0, 0.0, 0.0]
        bet_board_sums = [0.0, 0.0, 0.0]
        dealer_count = 0
        for hidden in combinations(dealer_pool, 2):
            dealer = (state.dealer_visible, *hidden)
            player_cards, dealer_cards = state.player + board, dealer + board
            bet = settle(player_cards, dealer_cards, 2)
            call = settle(player_cards, dealer_cards, 1)
            for index, value in enumerate((bet.ante, bet.xtra, bet.all_in)):
                bet_board_sums[index] += value
            for index, value in enumerate((call.ante, call.xtra, call.all_in)):
                call_sums[index] += value
            dealer_count += 1
        for index, value in enumerate(bet_board_sums):
            bet_sums[index] += value
        call_ev = sum(call_sums) / dealer_count
        key = tuple(sorted(future))
        if call_ev >= -2.0:
            board_actions[key] = "1x"
            for index, value in enumerate(call_sums):
                check_sums[index] += value / dealer_count
        else:
            board_actions[key] = "fold"
            check_sums[0] -= 1.0
            check_sums[1] -= 1.0
            folded_boards += 1
        terminal_states += dealer_count
        board_count += 1
    bet = _expectation(bet_sums, terminal_states)
    check = _expectation(check_sums, board_count)
    action = "2x" if bet.total >= check.total else "check"
    return ExactSecondDecision(
        bet, check, action, abs(bet.total - check.total), len(remaining),
        dealer_count, board_count, terminal_states, folded_boards, board_actions,
    )


@dataclass(frozen=True, slots=True)
class MonteCarloComparison:
    samples: int
    bet_mean: float
    bet_standard_error: float
    check_mean: float
    check_standard_error: float


def monte_carlo_second_decision(
    state: InformationState,
    exact: ExactSecondDecision,
    samples: int = 1_000_000,
    seed: int = 12345,
) -> MonteCarloComparison:
    """Sample terminal assignments; use only the board-indexed exact policy."""
    if samples < 2:
        raise ValueError("samples must be at least two")
    remaining = tuple(card for card in DECK if card not in state.visible)
    rng = Random(seed)
    bet_sum = bet_sq = check_sum = check_sq = 0.0
    for _ in range(samples):
        draw = rng.sample(remaining, 4)
        hidden, future = tuple(draw[:2]), tuple(draw[2:])
        board = state.board + future
        dealer = (state.dealer_visible, *hidden)
        player_cards, dealer_cards = state.player + board, dealer + board
        bet_value = settle(player_cards, dealer_cards, 2).net
        if exact.board_actions[tuple(sorted(future))] == "1x":
            check_value = settle(player_cards, dealer_cards, 1).net
        else:
            check_value = -2.0
        bet_sum += bet_value; bet_sq += bet_value * bet_value
        check_sum += check_value; check_sq += check_value * check_value
    bet_mean, check_mean = bet_sum / samples, check_sum / samples
    bet_var = (bet_sq - samples * bet_mean * bet_mean) / (samples - 1)
    check_var = (check_sq - samples * check_mean * check_mean) / (samples - 1)
    return MonteCarloComparison(samples, bet_mean, sqrt(bet_var / samples), check_mean, sqrt(check_var / samples))


def payoff_bounds(state: InformationState, action: str) -> tuple[float, float]:
    """Conservative attainable final-net-profit bounds from an information state."""
    future = 4 - len(state.board)
    current = flush_rank(state.player + state.board)[0]
    max_flush = min(7, current + future)
    max_xtra = max((pay for length, pay in XTRA_PAYTABLE.items() if length <= max_flush), default=0.0)
    if action == "fold":
        return -2.0, -2.0
    wager = {"1x": 1, "2x": 2, "3x": 3}[action]
    return -2.0 - wager, 1.0 + wager + max_xtra
