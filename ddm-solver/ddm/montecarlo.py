"""Numba Monte Carlo engine for Double Down Madness.

The exact solver answers everything about a *full* shoe.  It cannot answer the
questions that depend on how a shoe is actually dealt: the cut-card effect,
penetration, what a bet ramp earns per hour, the variance behind it, or how a
continuous shuffler changes the picture.  That is what this kernel is for.

Conventions follow ``blackjack-simulator/simulate.py`` so results stay
comparable with the rest of CountLab: ranks are 1..10 with the ace as 1, the
true count is floored, and per-round profit is bucketed into 17 true-count
buckets from <= -8 to >= +8.

The counting system is a parameter, not a constant: ``tags`` is a vector of
point values by rank, so the same kernel runs Hi-Lo, any published system, or
the system derived from this game's own effects of removal.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np
from numba import njit, prange

from .cards import PER_DECK
from .rules import DDMRules

STAND, HIT, DOUBLE = 0, 1, 2
BUCKETS = 17
Z95 = 1.959963984540054
NO_DEVIATION = 999.0

TC_MODES = {"exact": 0, "half": 1, "full": 2}

PER_DECK_ARR = np.array(PER_DECK, dtype=np.int64)

# Deviation table planes: one per decision family.
PLANE_FIRST, PLANE_HARD, PLANE_SOFT, PLANE_ACE, PLANE_INSURANCE = 0, 1, 2, 3, 4


# ---------------------------------------------------------------------------
# kernel
# ---------------------------------------------------------------------------

@njit(cache=True, inline="always")
def _next_random(state):
    """xorshift64, so a run is reproducible from its seed alone."""
    state ^= state >> np.uint64(12)
    state ^= state << np.uint64(25)
    state ^= state >> np.uint64(27)
    return state


@njit(cache=True)
def _shuffle(shoe, state):
    for i in range(shoe.shape[0] - 1, 0, -1):
        state = _next_random(state)
        j = int(state >> np.uint64(11)) % (i + 1)
        tmp = shoe[i]
        shoe[i] = shoe[j]
        shoe[j] = tmp
    return state


@njit(cache=True, inline="always")
def _true_count(rc, cards_remaining, tc_mode):
    if cards_remaining <= 0:
        return 0
    decks = cards_remaining / 52.0
    if tc_mode == 1:
        decks = math.ceil(decks * 2.0) / 2.0
    elif tc_mode == 2:
        decks = math.ceil(decks)
    if decks <= 0.0:
        return 0
    return int(math.floor(rc / decks))


@njit(cache=True, inline="always")
def _bucket(tc):
    if tc <= -8:
        return 0
    if tc >= 8:
        return 16
    return tc + 8


@njit(cache=True, inline="always")
def _bet_for(tc, ramp_tc, ramp_bet):
    bet = ramp_bet[0]
    for i in range(ramp_tc.shape[0]):
        if tc >= ramp_tc[i]:
            bet = ramp_bet[i]
    return bet


@njit(cache=True, inline="always")
def _soft(hard, aces):
    return aces > 0 and hard + 10 <= 21


@njit(cache=True, inline="always")
def _total(hard, aces):
    if aces > 0 and hard + 10 <= 21:
        return hard + 10
    return hard


@njit(cache=True, inline="always")
def _apply_dev(base, plane, row, up, tc, dev_thr, dev_act, dev_dir):
    thr = dev_thr[plane, row, up]
    if thr >= NO_DEVIATION:
        return base
    direction = dev_dir[plane, row, up]
    if direction > 0 and tc >= thr:
        return dev_act[plane, row, up]
    if direction < 0 and tc <= thr:
        return dev_act[plane, row, up]
    return base


@njit(cache=True)
def _simulate_task(decks, cut_cards, spots, csm, tc_mode,
                   first_a, hard_a, soft_a, ace_a,
                   dev_thr, dev_act, dev_dir,
                   tags, ramp_tc, ramp_bet,
                   h17, ace_strict, bj_mult, push22, offer_insurance,
                   rounds_target, seed,
                   counts, profit_sum, square_sum, wagered_sum, bet_sum,
                   exhausted):
    n = 52 * decks
    shoe = np.empty(n, dtype=np.int8)
    idx = 0
    for rank in range(1, 11):
        for _ in range(PER_DECK_ARR[rank] * decks):
            shoe[idx] = rank
            idx += 1

    other_first = np.empty(max(spots - 1, 1), dtype=np.int8)
    state = np.uint64(seed) * np.uint64(2) + np.uint64(1)
    state = _shuffle(shoe, state)
    pos = 0
    rc = 0.0
    rounds = 0
    while rounds < rounds_target:
        if csm == 1 or pos >= cut_cards:
            state = _shuffle(shoe, state)
            pos = 0
            rc = 0.0

        bet_tc = _true_count(rc, n - pos, tc_mode)
        bucket = _bucket(bet_tc)
        bet = _bet_for(bet_tc, ramp_tc, ramp_bet)

        hero_first = shoe[pos]
        pos += 1
        rc += tags[hero_first]
        for s in range(spots - 1):
            other_first[s] = shoe[pos]
            pos += 1
            rc += tags[other_first[s]]
        up = shoe[pos]
        pos += 1
        rc += tags[up]
        hole = shoe[pos]
        pos += 1

        # The hole card has been physically dealt but is still unseen.  It is
        # therefore excluded from the running count and included in the decks
        # remaining when making insurance and play decisions.
        play_tc = _true_count(rc, n - pos + 1, tc_mode)
        insured = False
        if offer_insurance == 1 and up == 1:
            insured = (_apply_dev(0, PLANE_INSURANCE, 0, up - 1, play_tc,
                                  dev_thr, dev_act, dev_dir) != 0)

        if (up == 1 and hole == 10) or (up == 10 and hole == 1):
            # Dealer blackjack is exposed before anyone acts and takes the whole
            # original bet; the player holds one card so cannot push it.
            rc += tags[hole]
            counts[bucket] += 1
            profit = -bet + (bet if insured else 0.0)
            profit_sum[bucket] += profit
            square_sum[bucket] += profit * profit
            wagered_sum[bucket] += bet * (1.5 if insured else 1.0)
            bet_sum[bucket] += bet
            rounds += 1
            continue

        hero_wagered = 0.0
        hero_total = 0
        hero_busted = False
        hero_bj = False

        for s in range(spots):
            card = hero_first if s == 0 else other_first[s - 1]
            wager = bet if s == 0 else 1.0
            hard = int(card)
            aces = 1 if card == 1 else 0
            ncards = 1
            busted = False
            is_bj = False
            first_from_ace = card == 1

            while True:
                play_tc = _true_count(rc, n - pos + 1, tc_mode)
                if ncards == 1 and first_from_ace:
                    action = _apply_dev(ace_a[up - 1], PLANE_ACE, 0, up - 1, play_tc,
                                        dev_thr, dev_act, dev_dir)
                elif ncards == 1:
                    action = _apply_dev(first_a[hard, up - 1], PLANE_FIRST, hard, up - 1, play_tc,
                                        dev_thr, dev_act, dev_dir)
                elif _soft(hard, aces):
                    t = _total(hard, aces)
                    row = min(max(t, 12), 19)
                    action = _apply_dev(soft_a[t, up - 1], PLANE_SOFT, row, up - 1, play_tc,
                                        dev_thr, dev_act, dev_dir)
                else:
                    t = hard
                    row = min(max(t, 2), 17)
                    action = _apply_dev(hard_a[t, up - 1], PLANE_HARD, row, up - 1, play_tc,
                                        dev_thr, dev_act, dev_dir)

                if action == STAND:
                    break
                if action == DOUBLE:
                    wager *= 2.0

                if pos >= n:
                    exhausted[0] = 1
                    return rounds
                card = shoe[pos]
                pos += 1
                rc += tags[card]
                hard += int(card)
                if card == 1:
                    aces += 1
                ncards += 1

                if hard > 21:
                    busted = True
                    break
                if ncards == 2 and aces == 1 and hard == 11:
                    is_bj = True
                    break
                if first_from_ace and (ace_strict == 1 or action == DOUBLE):
                    break
                first_from_ace = False

            if s == 0:
                hero_wagered = wager
                hero_busted = busted
                hero_bj = is_bj
                hero_total = _total(hard, aces)

        # The dealer draws out even when every player has busted.
        rc += tags[hole]
        dhard = int(up) + int(hole)
        daces = (1 if up == 1 else 0) + (1 if hole == 1 else 0)
        while True:
            if dhard > 21:
                break
            dtotal = _total(dhard, daces)
            if dtotal > 17:
                break
            if dtotal == 17 and not (_soft(dhard, daces) and h17 == 1):
                break
            if pos >= n:
                exhausted[0] = 1
                return rounds
            card = shoe[pos]
            pos += 1
            rc += tags[card]
            dhard += int(card)
            if card == 1:
                daces += 1

        if hero_busted:
            hero_profit = -hero_wagered
        elif hero_bj:
            hero_profit = bj_mult * hero_wagered
        elif dhard > 21:
            if dhard == 22 and push22 == 1:
                hero_profit = 0.0
            else:
                hero_profit = hero_wagered
        else:
            dtotal = _total(dhard, daces)
            if hero_total > dtotal:
                hero_profit = hero_wagered
            elif hero_total == dtotal:
                hero_profit = 0.0
            else:
                hero_profit = -hero_wagered

        if insured:
            hero_profit -= 0.5 * bet
            hero_wagered += 0.5 * bet

        counts[bucket] += 1
        profit_sum[bucket] += hero_profit
        square_sum[bucket] += hero_profit * hero_profit
        wagered_sum[bucket] += hero_wagered
        bet_sum[bucket] += bet
        rounds += 1

    return rounds


@njit(cache=True, parallel=True)
def _simulate_parallel(decks, cut_cards, spots, csm, tc_mode,
                       first_a, hard_a, soft_a, ace_a,
                       dev_thr, dev_act, dev_dir,
                       tags, ramp_tc, ramp_bet,
                       h17, ace_strict, bj_mult, push22, offer_insurance,
                       rounds_per_task, seeds,
                       counts, profit_sum, square_sum, wagered_sum, bet_sum,
                       exhausted):
    for t in prange(seeds.shape[0]):
        _simulate_task(decks, cut_cards, spots, csm, tc_mode,
                       first_a, hard_a, soft_a, ace_a,
                       dev_thr, dev_act, dev_dir,
                       tags, ramp_tc, ramp_bet,
                       h17, ace_strict, bj_mult, push22, offer_insurance,
                       rounds_per_task, seeds[t],
                       counts[t], profit_sum[t], square_sum[t],
                       wagered_sum[t], bet_sum[t], exhausted[t])


# ---------------------------------------------------------------------------
# driver
# ---------------------------------------------------------------------------

_CODE = {"S": STAND, "H": HIT, "D": DOUBLE, "I": 1}


def chart_arrays(chart) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Flatten a :class:`ddm.strategy.Chart` into kernel lookup tables.

    Rows the chart cannot reach (multi-card hard 2 and 3, and soft 12 under the
    strict ace rule) are filled with the obvious action so the kernel never
    reads uninitialised memory, even though it never queries them.
    """
    first_a = np.full((11, 10), HIT, dtype=np.int8)
    hard_a = np.full((22, 10), HIT, dtype=np.int8)
    soft_a = np.full((22, 10), HIT, dtype=np.int8)
    ace_a = np.full(10, DOUBLE, dtype=np.int8)

    for up in range(1, 11):
        ui = up - 1
        ace_a[ui] = _CODE[chart.ace_start.get(up, "D")]
        for rank in range(2, 11):
            first_a[rank, ui] = _CODE[chart.first.get((rank, up), "H")]
        for total in range(2, 22):
            row = min(max(total, 2), 17)
            action = chart.hard.get((row, up))
            if action is None:
                action = "S" if total >= 17 else "H"
            hard_a[total, ui] = _CODE[action]
        for total in range(12, 22):
            row = min(max(total, 12), 19)
            action = chart.soft.get((row, up))
            if action is None:
                action = "S" if total >= 19 else "H"
            soft_a[total, ui] = _CODE[action]
    return first_a, hard_a, soft_a, ace_a


def empty_deviations() -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    return (np.full((5, 22, 10), NO_DEVIATION, dtype=np.float64),
            np.zeros((5, 22, 10), dtype=np.int8),
            np.zeros((5, 22, 10), dtype=np.int8))


def deviation_arrays(deviations: Sequence[Dict]) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Build kernel deviation planes.

    Each entry is ``{"plane": "first"|"hard"|"soft"|"ace"|"insurance", "row": int,
    "upcard": int, "threshold": float, "action": "S"|"H"|"D"|"I",
    "direction": +1|-1}``; direction +1 applies at or above the threshold.
    """
    thr, act, direction = empty_deviations()
    planes = {"first": PLANE_FIRST, "hard": PLANE_HARD, "soft": PLANE_SOFT,
              "ace": PLANE_ACE, "insurance": PLANE_INSURANCE}
    for dev in deviations:
        p = planes[dev["plane"]]
        row = 0 if dev["plane"] in ("ace", "insurance") else int(dev["row"])
        ui = int(dev["upcard"]) - 1
        thr[p, row, ui] = float(dev["threshold"])
        act[p, row, ui] = _CODE[dev["action"]]
        direction[p, row, ui] = int(dev.get("direction", 1))
    return thr, act, direction


def tag_array(tags: Sequence[float]) -> np.ndarray:
    """Convert tags given in A,2..9,T order into a rank-indexed vector."""
    out = np.zeros(11, dtype=np.float64)
    for rank, value in zip((1, 2, 3, 4, 5, 6, 7, 8, 9, 10), tags):
        out[rank] = float(value)
    return out


def ramp_arrays(ramp: Sequence[Tuple[int, float]]) -> Tuple[np.ndarray, np.ndarray]:
    rows = sorted(ramp, key=lambda r: r[0])
    return (np.array([r[0] for r in rows], dtype=np.int64),
            np.array([float(r[1]) for r in rows], dtype=np.float64))


FLAT_RAMP: Tuple[Tuple[int, float], ...] = ((-99, 1.0),)


@dataclass
class MCConfig:
    rules: DDMRules
    chart: object
    tags: Sequence[float] = (-1, 1, 1, 1, 1, 1, 0, 0, 0, -1)  # Hi-Lo
    ramp: Sequence[Tuple[int, float]] = FLAT_RAMP
    cut_decks: float = 1.0        # decks left behind the cut card
    spots: int = 1                 # total players at the table, hero included
    csm: bool = False              # reshuffle every round
    tc_mode: str = "exact"
    rounds: int = 10_000_000
    tasks: int = 0                 # 0 = one per core
    seed: int = 20260825
    deviations: Sequence[Dict] = field(default_factory=tuple)


@dataclass
class MCResult:
    config: MCConfig
    rounds: int
    counts: np.ndarray
    profit_sum: np.ndarray
    square_sum: np.ndarray
    wagered_sum: np.ndarray
    bet_sum: np.ndarray

    @property
    def total_profit(self) -> float:
        return float(self.profit_sum.sum())

    @property
    def total_bet(self) -> float:
        return float(self.bet_sum.sum())

    @property
    def total_wagered(self) -> float:
        return float(self.wagered_sum.sum())

    @property
    def ev_per_round(self) -> float:
        return self.total_profit / self.rounds

    @property
    def avg_bet(self) -> float:
        return self.total_bet / self.rounds

    @property
    def avg_final_wager(self) -> float:
        return self.total_wagered / self.rounds

    @property
    def edge_per_unit_bet(self) -> float:
        """Player edge as a fraction of the money put up at the start of a round."""
        return self.total_profit / self.total_bet

    @property
    def element_of_risk(self) -> float:
        return -self.total_profit / self.total_wagered

    @property
    def sd_per_round(self) -> float:
        mean = self.ev_per_round
        var = float(self.square_sum.sum()) / self.rounds - mean * mean
        return math.sqrt(max(var, 0.0))

    @property
    def se_per_round(self) -> float:
        return self.sd_per_round / math.sqrt(self.rounds)

    def ci95(self) -> Tuple[float, float]:
        half = Z95 * self.se_per_round
        return self.ev_per_round - half, self.ev_per_round + half

    def bucket_rows(self) -> List[Dict]:
        rows = []
        for i in range(BUCKETS):
            n = int(self.counts[i])
            if n == 0:
                continue
            mean = self.profit_sum[i] / n
            var = self.square_sum[i] / n - mean * mean
            sd = math.sqrt(max(var, 0.0))
            se = sd / math.sqrt(n)
            bet = self.bet_sum[i] / n
            rows.append({
                "tc": i - 8,
                "label": ("<=-8" if i == 0 else (">=+8" if i == 16 else "%+d" % (i - 8))),
                "rounds": n,
                "frequency": n / self.rounds,
                "ev_per_round": mean,
                "avg_bet": bet,
                "edge_per_unit_bet": mean / bet if bet else 0.0,
                "sd": sd,
                "se": se,
                "ci95": Z95 * se,
            })
        return rows


def run(config: MCConfig) -> MCResult:
    import os

    rules = config.rules
    first_a, hard_a, soft_a, ace_a = chart_arrays(config.chart)
    if config.deviations:
        dev_thr, dev_act, dev_dir = deviation_arrays(config.deviations)
    else:
        dev_thr, dev_act, dev_dir = empty_deviations()
    tags = tag_array(config.tags)
    ramp_tc, ramp_bet = ramp_arrays(config.ramp)

    tasks = config.tasks or (os.cpu_count() or 4)
    rounds_per_task = max(1, config.rounds // tasks)
    seeds = np.array([config.seed * 1_000_003 + 7919 * t + 1 for t in range(tasks)],
                     dtype=np.uint64)

    shape = (tasks, BUCKETS)
    counts = np.zeros(shape, dtype=np.int64)
    profit = np.zeros(shape, dtype=np.float64)
    square = np.zeros(shape, dtype=np.float64)
    wagered = np.zeros(shape, dtype=np.float64)
    bet = np.zeros(shape, dtype=np.float64)
    exhausted = np.zeros((tasks, 1), dtype=np.int8)

    total_cards = 52 * rules.decks
    cut_cards = total_cards - int(round(config.cut_decks * 52))

    _simulate_parallel(
        rules.decks, cut_cards, config.spots, 1 if config.csm else 0,
        TC_MODES[config.tc_mode],
        first_a, hard_a, soft_a, ace_a,
        dev_thr, dev_act, dev_dir,
        tags, ramp_tc, ramp_bet,
        1 if rules.dealer_hits_soft17 else 0,
        1 if rules.ace_rule == "strict" else 0,
        rules.bj_multiplier,
        1 if rules.dealer_22_push else 0,
        1 if rules.offer_insurance else 0,
        rounds_per_task, seeds,
        counts, profit, square, wagered, bet, exhausted)

    if exhausted.any():
        raise RuntimeError("shoe exhausted while finishing a round; increase cut_decks")

    return MCResult(config=config, rounds=rounds_per_task * tasks,
                    counts=counts.sum(axis=0), profit_sum=profit.sum(axis=0),
                    square_sum=square.sum(axis=0), wagered_sum=wagered.sum(axis=0),
                    bet_sum=bet.sum(axis=0))
