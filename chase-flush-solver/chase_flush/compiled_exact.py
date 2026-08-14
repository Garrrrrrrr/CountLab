"""Numba-compiled exact enumeration for exposed-card decision states.

The evaluator represents each suit by a 13-bit rank mask.  For equal card
counts, integer mask order is exactly lexicographic rank order, so a hand score
is simply ``flush_length << 13 | rank_mask``.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from itertools import combinations
from time import perf_counter

import numpy as np
from numba import njit, prange

from .cards import DECK
from .state import InformationState


@dataclass(frozen=True, slots=True)
class ExactActionResult:
    action_a: str
    action_b: str
    ev_a: float
    ev_b: float
    difference: float
    best_action: str
    terminal_states: int
    runtime_seconds: float


@njit(cache=True, inline="always")
def _popcount(value: int) -> int:
    count = 0
    while value:
        value &= value - 1
        count += 1
    return count


@njit(cache=True, inline="always")
def _score7(c0: int, c1: int, c2: int, c3: int, c4: int, c5: int, c6: int) -> int:
    masks = np.zeros(4, dtype=np.int64)
    cards = np.empty(7, dtype=np.int64)
    cards[0], cards[1], cards[2], cards[3] = c0, c1, c2, c3
    cards[4], cards[5], cards[6] = c4, c5, c6
    for card in cards:
        masks[card // 13] |= 1 << (card % 13)
    best = 0
    for suit_index in range(4):
        score = (_popcount(masks[suit_index]) << 13) | masks[suit_index]
        if score > best:
            best = score
    return best


@njit(cache=True, inline="always")
def _qualifies(score: int) -> bool:
    length = score >> 13
    if length > 3:
        return True
    if length < 3:
        return False
    mask = score & 8191
    # Rank bit zero is a deuce, so a nine is bit seven.
    return mask >= (1 << 7)


@njit(cache=True, inline="always")
def _profit(player_score: int, dealer_score: int, wager: int, six_payout: int) -> int:
    if player_score == dealer_score:
        return 0
    dealer_qualifies = _qualifies(dealer_score)
    if player_score < dealer_score:
        return -(1 if dealer_qualifies else 0) - wager - 1
    length = player_score >> 13
    xtra = 1 if length == 4 else 5 if length == 5 else six_payout if length == 6 else 250 if length == 7 else 0
    return (1 if dealer_qualifies else 0) + wager + xtra


def _remaining(state: InformationState) -> np.ndarray:
    visible = set(state.visible)
    return np.asarray([card for card in DECK if card not in visible], dtype=np.int16)


def _pairs(n: int) -> np.ndarray:
    return np.asarray(tuple(combinations(range(n), 2)), dtype=np.int16)


@njit(cache=True, parallel=True)
def _stage2_kernel(player: np.ndarray, board0: int, board1: int, visible: int,
                   remaining: np.ndarray, pairs: np.ndarray, six_payout: int):
    board_bet = np.zeros(len(pairs), dtype=np.int64)
    board_call = np.zeros(len(pairs), dtype=np.int64)
    dealer_counts = np.zeros(len(pairs), dtype=np.int64)
    for fi in prange(len(pairs)):
        ia, ib = pairs[fi, 0], pairs[fi, 1]
        ba, bb = int(remaining[ia]), int(remaining[ib])
        player_score = _score7(int(player[0]), int(player[1]), int(player[2]), board0, board1, ba, bb)
        bet_sum = 0
        call_sum = 0
        count = 0
        for di in range(len(remaining) - 1):
            if di == ia or di == ib:
                continue
            for dj in range(di + 1, len(remaining)):
                if dj == ia or dj == ib:
                    continue
                d0, d1 = int(remaining[di]), int(remaining[dj])
                dealer_score = _score7(visible, d0, d1, board0, board1, ba, bb)
                bet_sum += _profit(player_score, dealer_score, 2, six_payout)
                call_sum += _profit(player_score, dealer_score, 1, six_payout)
                count += 1
        board_bet[fi], board_call[fi], dealer_counts[fi] = bet_sum, call_sum, count
    return board_bet, board_call, dealer_counts


@lru_cache(maxsize=4096)
def exact_stage2_compiled(state: InformationState, six_payout: int = 50) -> ExactActionResult:
    if state.stage != 2:
        raise ValueError("compiled stage-2 enumeration requires two board cards")
    started = perf_counter()
    remaining = _remaining(state)
    pairs = _pairs(len(remaining))
    if state.dealer_visible is None:
        bet, call, counts = _stage2_normal_kernel(
            np.asarray(state.player, dtype=np.int16), state.board[0], state.board[1],
            remaining, pairs, int(six_payout),
        )
    else:
        bet, call, counts = _stage2_kernel(
            np.asarray(state.player, dtype=np.int16), state.board[0], state.board[1],
            state.dealer_visible, remaining, pairs, int(six_payout),
        )
    total = int(counts.sum())
    ev_bet = float(bet.sum() / total)
    # Each future board is equiprobable.  The final action is conditioned only
    # on that visible board; hidden dealer cards are averaged before max().
    continuation = np.maximum(call / counts, -2.0)
    ev_check = float(continuation.mean())
    difference = ev_bet - ev_check
    return ExactActionResult("2x", "check", ev_bet, ev_check, difference,
                             "2x" if difference >= 0 else "check", total,
                             perf_counter() - started)


@njit(cache=True, parallel=True)
def _stage2_normal_kernel(player: np.ndarray, board0: int, board1: int,
                          remaining: np.ndarray, pairs: np.ndarray, six_payout: int):
    board_bet = np.zeros(len(pairs), dtype=np.int64)
    board_call = np.zeros(len(pairs), dtype=np.int64)
    dealer_counts = np.zeros(len(pairs), dtype=np.int64)
    for fi in prange(len(pairs)):
        ia, ib = pairs[fi, 0], pairs[fi, 1]
        ba, bb = int(remaining[ia]), int(remaining[ib])
        player_score = _score7(int(player[0]), int(player[1]), int(player[2]), board0, board1, ba, bb)
        bet_sum = 0
        call_sum = 0
        count = 0
        for d0 in range(len(remaining) - 2):
            if d0 == ia or d0 == ib:
                continue
            for d1 in range(d0 + 1, len(remaining) - 1):
                if d1 == ia or d1 == ib:
                    continue
                for d2 in range(d1 + 1, len(remaining)):
                    if d2 == ia or d2 == ib:
                        continue
                    dealer_score = _score7(int(remaining[d0]), int(remaining[d1]), int(remaining[d2]), board0, board1, ba, bb)
                    bet_sum += _profit(player_score, dealer_score, 2, six_payout)
                    call_sum += _profit(player_score, dealer_score, 1, six_payout)
                    count += 1
        board_bet[fi], board_call[fi], dealer_counts[fi] = bet_sum, call_sum, count
    return board_bet, board_call, dealer_counts


@njit(cache=True, parallel=True)
def _river_kernel(player: np.ndarray, board: np.ndarray, visible: int,
                  remaining: np.ndarray, exposed: bool, six_payout: int):
    partial = np.zeros(len(remaining), dtype=np.int64)
    counts = np.zeros(len(remaining), dtype=np.int64)
    player_score = _score7(int(player[0]), int(player[1]), int(player[2]),
                           int(board[0]), int(board[1]), int(board[2]), int(board[3]))
    for d0 in prange(len(remaining)):
        total = 0
        count = 0
        if exposed:
            for d1 in range(d0 + 1, len(remaining)):
                dealer_score = _score7(visible, int(remaining[d0]), int(remaining[d1]),
                                       int(board[0]), int(board[1]), int(board[2]), int(board[3]))
                total += _profit(player_score, dealer_score, 1, six_payout)
                count += 1
        else:
            for d1 in range(d0 + 1, len(remaining) - 1):
                for d2 in range(d1 + 1, len(remaining)):
                    dealer_score = _score7(int(remaining[d0]), int(remaining[d1]), int(remaining[d2]),
                                           int(board[0]), int(board[1]), int(board[2]), int(board[3]))
                    total += _profit(player_score, dealer_score, 1, six_payout)
                    count += 1
        partial[d0], counts[d0] = total, count
    return partial, counts


@lru_cache(maxsize=16384)
def exact_river_compiled(state: InformationState, six_payout: int = 50) -> ExactActionResult:
    if state.stage != 3:
        raise ValueError("compiled river enumeration requires four board cards")
    started = perf_counter()
    remaining = _remaining(state)
    exposed = state.dealer_visible is not None
    totals, counts = _river_kernel(
        np.asarray(state.player, dtype=np.int16), np.asarray(state.board, dtype=np.int16),
        state.dealer_visible if exposed else -1, remaining, exposed, int(six_payout),
    )
    terminal_states = int(counts.sum())
    call = float(totals.sum() / terminal_states)
    difference = call + 2.0
    return ExactActionResult("1x", "fold", call, -2.0, difference,
                             "1x" if difference >= 0 else "fold", terminal_states,
                             perf_counter() - started)


@njit(cache=True, parallel=True)
def _opening_kernel(player: np.ndarray, visible: int, remaining: np.ndarray,
                    first_pairs: np.ndarray, six_payout: int):
    opening_bet = np.zeros(len(first_pairs), dtype=np.int64)
    opening_check = np.zeros(len(first_pairs), dtype=np.float64)
    terminal_counts = np.zeros(len(first_pairs), dtype=np.int64)
    for first_index in prange(len(first_pairs)):
        f0i, f1i = first_pairs[first_index, 0], first_pairs[first_index, 1]
        f0, f1 = int(remaining[f0i]), int(remaining[f1i])
        rest = np.empty(len(remaining) - 2, dtype=np.int16)
        cursor = 0
        for i in range(len(remaining)):
            if i != f0i and i != f1i:
                rest[cursor] = remaining[i]
                cursor += 1
        bet3_sum = 0
        bet2_sum = 0
        check2_sum = 0.0
        total_count = 0
        board2_count = 0
        for b0i in range(len(rest) - 1):
            for b1i in range(b0i + 1, len(rest)):
                b0, b1 = int(rest[b0i]), int(rest[b1i])
                player_score = _score7(int(player[0]), int(player[1]), int(player[2]), f0, f1, b0, b1)
                call_sum = 0
                hidden_count = 0
                for d0i in range(len(rest) - 1):
                    if d0i == b0i or d0i == b1i:
                        continue
                    for d1i in range(d0i + 1, len(rest)):
                        if d1i == b0i or d1i == b1i:
                            continue
                        dealer_score = _score7(visible, int(rest[d0i]), int(rest[d1i]), f0, f1, b0, b1)
                        bet3_sum += _profit(player_score, dealer_score, 3, six_payout)
                        bet2_sum += _profit(player_score, dealer_score, 2, six_payout)
                        call_sum += _profit(player_score, dealer_score, 1, six_payout)
                        hidden_count += 1
                check2_sum += max(call_sum / hidden_count, -2.0)
                total_count += hidden_count
                board2_count += 1
        ev2 = bet2_sum / total_count
        ev_check2 = check2_sum / board2_count
        opening_bet[first_index] = bet3_sum
        opening_check[first_index] = max(ev2, ev_check2)
        terminal_counts[first_index] = total_count
    return opening_bet, opening_check, terminal_counts


@lru_cache(maxsize=4096)
def exact_opening_compiled(state: InformationState, six_payout: int = 50) -> ExactActionResult:
    if state.stage != 1:
        raise ValueError("compiled opening enumeration requires no board")
    started = perf_counter()
    remaining = _remaining(state)
    pairs = _pairs(len(remaining))
    if state.dealer_visible is None:
        bet_sums, check_values, counts = _opening_normal_kernel(
            np.asarray(state.player, dtype=np.int16), remaining, pairs, int(six_payout),
        )
    else:
        bet_sums, check_values, counts = _opening_kernel(
            np.asarray(state.player, dtype=np.int16), state.dealer_visible,
            remaining, pairs, int(six_payout),
        )
    ev_bet = float(bet_sums.sum() / counts.sum())
    ev_check = float(check_values.mean())
    difference = ev_bet - ev_check
    return ExactActionResult("3x", "check", ev_bet, ev_check, difference,
                             "3x" if difference >= 0 else "check", int(counts.sum()),
                             perf_counter() - started)


@njit(cache=True, parallel=True)
def _opening_normal_kernel(player: np.ndarray, remaining: np.ndarray,
                           first_pairs: np.ndarray, six_payout: int):
    opening_bet = np.zeros(len(first_pairs), dtype=np.int64)
    opening_check = np.zeros(len(first_pairs), dtype=np.float64)
    terminal_counts = np.zeros(len(first_pairs), dtype=np.int64)
    for first_index in prange(len(first_pairs)):
        f0i, f1i = first_pairs[first_index, 0], first_pairs[first_index, 1]
        f0, f1 = int(remaining[f0i]), int(remaining[f1i])
        rest = np.empty(len(remaining) - 2, dtype=np.int16)
        cursor = 0
        for i in range(len(remaining)):
            if i != f0i and i != f1i:
                rest[cursor] = remaining[i]
                cursor += 1
        bet3_sum = 0
        bet2_sum = 0
        check2_sum = 0.0
        total_count = 0
        board2_count = 0
        for b0i in range(len(rest) - 1):
            for b1i in range(b0i + 1, len(rest)):
                b0, b1 = int(rest[b0i]), int(rest[b1i])
                player_score = _score7(int(player[0]), int(player[1]), int(player[2]), f0, f1, b0, b1)
                call_sum = 0
                dealer_count = 0
                for d0 in range(len(rest) - 2):
                    if d0 == b0i or d0 == b1i:
                        continue
                    for d1 in range(d0 + 1, len(rest) - 1):
                        if d1 == b0i or d1 == b1i:
                            continue
                        for d2 in range(d1 + 1, len(rest)):
                            if d2 == b0i or d2 == b1i:
                                continue
                            dealer_score = _score7(int(rest[d0]), int(rest[d1]), int(rest[d2]), f0, f1, b0, b1)
                            bet3_sum += _profit(player_score, dealer_score, 3, six_payout)
                            bet2_sum += _profit(player_score, dealer_score, 2, six_payout)
                            call_sum += _profit(player_score, dealer_score, 1, six_payout)
                            dealer_count += 1
                check2_sum += max(call_sum / dealer_count, -2.0)
                total_count += dealer_count
                board2_count += 1
        opening_bet[first_index] = bet3_sum
        opening_check[first_index] = max(bet2_sum / total_count, check2_sum / board2_count)
        terminal_counts[first_index] = total_count
    return opening_bet, opening_check, terminal_counts
