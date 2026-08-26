"""Exact composition-dependent solver for Double Down Madness.

Why this is tractable at all
---------------------------
Two features of Double Down Madness collapse the usual blackjack analysis:

1. **No splitting.**  Split recursion is the expensive part of exact blackjack
   combinatorics; without it the player's state is just a multiset of drawn
   ranks, and every reachable hand is a partition of some total <= 21 into parts
   from 1..10 -- a few thousand states, not millions.

2. **A double is a hit at a larger stake.**  Doubling adds money and draws a
   card but forfeits nothing: the player may still hit, stand or re-double
   afterwards, and the added wager always doubles the total in play.  So value
   is linear in the stake, V(state, w) = w * v(state), and the recursion is

       v(s) = max( stand(s), hit(s), (1 + f) * hit(s) )
       hit(s) = sum_r p_r * v(s + r)

   with f = ``rules.double_fraction`` (1.0 for a full double).  The double
   branch beats the hit branch exactly when hit(s) > 0, i.e. **double whenever
   the post-draw continuation EV is positive**.

Hole-card treatment
-------------------
The hole card is unseen, not absent.  Dealing is exchangeable, so conditional on
the player's drawn cards the hole card is uniform over the remaining unseen
cards -- restricted, when the dealer peeked, to ranks that cannot make blackjack.
That restriction leaks into the player's own draw probabilities: knowing the
hole is not a ten makes the unseen pile the player draws from slightly ten-rich.
Writing U for the unseen pile (which still contains the hole card), M = |U|,
c_r for its rank counts, and A for the count of ranks the hole may still be:

    P(hole = r)      = c_r / A                       for allowed r
    P(next draw = r) = (c_r / (M - 1)) * (1 - [r allowed] / A)

Both reduce to c_r / M when there is nothing to exclude.  This is exact, not an
approximation -- it is the only place peek bias enters, and dropping it is a
common source of a few hundredths of a percent of error.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from .cards import Composition, fresh_shoe, remove
from .dealer import IDX_22, IDX_BUST_OTHER, DealerSolver
from .hand import totals
from .rules import DDMRules

STAND, HIT, DOUBLE = "S", "H", "D"

# (ev, expected final wager, chosen action) for one state, per unit staked.
Node = Tuple[float, float, str]


@dataclass(frozen=True)
class ExactResult:
    rules: DDMRules
    ev: float
    house_edge: float
    avg_final_wager: float
    element_of_risk: float
    ev_by_upcard: Tuple[float, ...]
    prob_player_blackjack: float
    states_evaluated: int

    def report(self) -> str:
        lines = [
            self.rules.describe(),
            "  house edge        %8.4f%%" % (100.0 * self.house_edge),
            "  player EV/round   %+9.6f" % self.ev,
            "  avg final wager   %8.4f units" % self.avg_final_wager,
            "  element of risk   %8.4f%%" % (100.0 * self.element_of_risk),
            "  P(player BJ)      %8.6f" % self.prob_player_blackjack,
            "  states evaluated  %8d" % self.states_evaluated,
        ]
        return "\n".join(lines)


class ExactSolver:
    """Full-removal composition-dependent solver for one rule set and shoe."""

    def __init__(self, rules: Optional[DDMRules] = None, shoe: Optional[Composition] = None):
        self.rules = rules or DDMRules()
        self.shoe = shoe if shoe is not None else fresh_shoe(self.rules.decks)
        self._memo: Dict[Tuple[int, int, int, Composition], Node] = {}
        self._upcard = 0
        self._banned_hole = 0  # rank the peek ruled out, 0 when none
        # When collecting, every evaluated state records the EV of all three
        # actions so a total-dependent chart can be aggregated from them.
        self.collect = False
        self.action_ev: Dict[Tuple[int, int, int, Composition], Tuple[float, float, float]] = {}
        # Optional hook fired once per (first card, upcard) pair after that
        # sub-problem is solved, so callers can run a forward reach pass over
        # exactly the states the solver just evaluated.
        self.on_round = None

    # ---- probability helpers -------------------------------------------------

    def _draw_probs(self, comp: Composition) -> List[float]:
        """Next-card probabilities out of the unseen pile, peek-adjusted."""
        m = sum(comp)
        banned = self._banned_hole
        if banned == 0:
            return [0.0] + [comp[r] / m for r in range(1, 11)]
        allowed_total = m - comp[banned]
        denom = m - 1
        out = [0.0] * 11
        for r in range(1, 11):
            if comp[r] == 0:
                continue
            adjust = 1.0 if r == banned else (1.0 - 1.0 / allowed_total)
            out[r] = comp[r] * adjust / denom
        return out

    def _hole_probs(self, comp: Composition) -> List[float]:
        m = sum(comp)
        banned = self._banned_hole
        allowed_total = m if banned == 0 else m - comp[banned]
        out = [0.0] * 11
        for r in range(1, 11):
            if comp[r] == 0 or r == banned:
                continue
            out[r] = comp[r] / allowed_total
        return out

    # ---- settlement ----------------------------------------------------------

    def _settle(self, player_total: int, dist) -> float:
        push22 = self.rules.dealer_22_push
        ev = dist[IDX_BUST_OTHER]
        ev += dist[IDX_22] * (0.0 if push22 else 1.0)
        for t in range(17, 22):
            p = dist[t - 17]
            if p == 0.0:
                continue
            ev += p * (1.0 if player_total > t else (0.0 if player_total == t else -1.0))
        return ev

    def _stand_value(self, hard: int, aces: int, comp: Composition) -> float:
        """EV of standing, integrating over the unseen hole card."""
        player_total = totals(hard, aces)[0]
        hole_probs = self._hole_probs(comp)
        solver = DealerSolver(hits_soft17=self.rules.dealer_hits_soft17)
        ev = 0.0
        for h in range(1, 11):
            p = hole_probs[h]
            if p == 0.0:
                continue
            dist = solver.from_two_cards(self._upcard, h, remove(comp, h))
            ev += p * self._settle(player_total, dist)
        return ev

    # ---- player recursion ----------------------------------------------------

    def _value(self, hard: int, aces: int, ncards: int, comp: Composition) -> Node:
        if hard > 21:
            return (-1.0, 1.0, STAND)
        # Ace + ten as the player's first two cards is a blackjack: paid at once,
        # exempt from the dealer-22 push, and on the full doubled wager if the
        # player doubled to get there.
        if ncards == 2 and aces == 1 and hard == 11:
            return (self.rules.bj_multiplier, 1.0, STAND)

        key = (hard, aces, ncards, comp)
        cached = self._memo.get(key)
        if cached is not None:
            return cached

        stand_ev = self._stand_value(hard, aces, comp)

        probs = self._draw_probs(comp)
        hit_ev = 0.0
        hit_wager = 0.0
        for r in range(1, 11):
            p = probs[r]
            if p == 0.0:
                continue
            nh = hard + r
            if nh > 21:
                hit_ev += p * -1.0
                hit_wager += p * 1.0
            else:
                child = self._value(
                    nh, aces + (1 if r == 1 else 0), ncards + 1, remove(comp, r)
                )
                hit_ev += p * child[0]
                hit_wager += p * child[1]

        mult = self.rules.double_multiplier
        double_ev = mult * hit_ev
        double_wager = mult * hit_wager

        best = (stand_ev, 1.0, STAND)
        if hit_ev > best[0]:
            best = (hit_ev, hit_wager, HIT)
        if double_ev > best[0]:
            best = (double_ev, double_wager, DOUBLE)

        self._memo[key] = best
        if self.collect:
            self.action_ev[key] = (stand_ev, hit_ev, double_ev)
        return best

    def _value_ace_start(self, comp: Composition) -> Node:
        """Value of a lone-Ace first card, where the one-card restriction bites.

        Under ``ace_rule="strict"`` (the casino's posted rule) both hitting and
        doubling draw exactly one card and end the hand.  Under
        ``ace_rule="double_only"`` (Wizard's wording) only the double is capped,
        so hitting rejoins the ordinary recursion.
        """
        stand_ev = self._stand_value(1, 1, comp)
        probs = self._draw_probs(comp)

        capped_ev = 0.0  # draw exactly one card, then forced to stand
        free_ev = 0.0    # draw one card and keep playing
        free_wager = 0.0
        for r in range(1, 11):
            p = probs[r]
            if p == 0.0:
                continue
            child_comp = remove(comp, r)
            if r == 10:
                terminal = self.rules.bj_multiplier
                capped_ev += p * terminal
                free_ev += p * terminal
                free_wager += p * 1.0
                continue
            capped_ev += p * self._stand_value(1 + r, 1, child_comp)
            child = self._value(1 + r, 1, 2, child_comp)
            free_ev += p * child[0]
            free_wager += p * child[1]

        mult = self.rules.double_multiplier
        double_ev = mult * capped_ev
        double_wager = mult * 1.0

        best = (stand_ev, 1.0, STAND)
        if self.rules.ace_rule == "strict":
            if capped_ev > best[0]:
                best = (capped_ev, 1.0, HIT)
        else:
            if free_ev > best[0]:
                best = (free_ev, free_wager, HIT)
        if double_ev > best[0]:
            best = (double_ev, double_wager, DOUBLE)
        return best

    # ---- top level -----------------------------------------------------------

    def solve(self) -> ExactResult:
        shoe = self.shoe
        n = sum(shoe)
        ev = 0.0
        wager = 0.0
        p_bj = 0.0
        ev_by_up = [0.0] * 11
        p_by_up = [0.0] * 11

        for p1 in range(1, 11):
            if shoe[p1] == 0:
                continue
            p_first = shoe[p1] / n
            after_first = remove(shoe, p1)
            n2 = sum(after_first)
            for up in range(1, 11):
                if after_first[up] == 0:
                    continue
                joint = p_first * after_first[up] / n2
                unseen = remove(after_first, up)

                self._upcard = up
                if self.rules.peek and up == 1:
                    self._banned_hole = 10
                elif self.rules.peek and up == 10:
                    self._banned_hole = 1
                else:
                    self._banned_hole = 0

                # Dealer blackjack is settled before the player acts and takes
                # the whole original bet; the player holds one card so cannot
                # have a blackjack of their own to push against.
                p_dealer_bj = 0.0
                if self._banned_hole:
                    p_dealer_bj = unseen[self._banned_hole] / sum(unseen)

                if p1 == 1:
                    node = self._value_ace_start(unseen)
                else:
                    node = self._value(p1, 0, 1, unseen)

                round_ev = p_dealer_bj * -1.0 + (1.0 - p_dealer_bj) * node[0]
                round_wager = p_dealer_bj * 1.0 + (1.0 - p_dealer_bj) * node[1]
                if self.on_round is not None:
                    self.on_round(p1, up, unseen, joint * (1.0 - p_dealer_bj), node)

                ev += joint * round_ev
                wager += joint * round_wager
                ev_by_up[up] += joint * round_ev
                p_by_up[up] += joint

                # Reaching ace+ten needs the player to actually draw to it.
                if p1 in (1, 10):
                    partner = 10 if p1 == 1 else 1
                    if node[2] in (HIT, DOUBLE):
                        probs = self._draw_probs(unseen)
                        p_bj += joint * (1.0 - p_dealer_bj) * probs[partner]

        ev_by_upcard = tuple(
            (ev_by_up[u] / p_by_up[u]) if p_by_up[u] else 0.0 for u in range(1, 11)
        )
        house_edge = -ev
        return ExactResult(
            rules=self.rules,
            ev=ev,
            house_edge=house_edge,
            avg_final_wager=wager,
            element_of_risk=house_edge / wager if wager else 0.0,
            ev_by_upcard=ev_by_upcard,
            prob_player_blackjack=p_bj,
            states_evaluated=len(self._memo),
        )


def solve(rules: Optional[DDMRules] = None, shoe: Optional[Composition] = None) -> ExactResult:
    return ExactSolver(rules=rules, shoe=shoe).solve()
