"""Conditional-EV solver. Exact at river; reproducible sampled backward induction earlier."""

from dataclasses import dataclass
from itertools import combinations
from random import Random
from statistics import fmean
from .cards import DECK
from .payouts import settle
from .state import InformationState

@dataclass(frozen=True, slots=True)
class Decision:
    state: InformationState
    best_action: str
    ev_best: float
    ev_other: float
    ev_difference: float
    action_evs: dict[str, float]
    exact: bool

class Solver:
    def __init__(self, samples: int = 400, seed: int = 1):
        if samples < 1: raise ValueError("samples must be positive")
        self.samples, self.seed = samples, seed

    @staticmethod
    def _remaining(state: InformationState) -> tuple[int, ...]:
        used = set(state.visible)
        return tuple(c for c in DECK if c not in used)

    @staticmethod
    def _terminal(state: InformationState, dealer: tuple[int, ...], wager: int) -> float:
        return settle(state.player + state.board, dealer + state.board, wager).net

    def _dealer_hands(self, state: InformationState):
        remaining = self._remaining(state)
        if state.dealer_visible is None:
            yield from combinations(remaining, 3)
        else:
            for hidden in combinations(remaining, 2): yield (state.dealer_visible, *hidden)

    def wager_ev(self, state: InformationState, wager: int, *, max_exact: int = 200_000) -> tuple[float, bool]:
        """EV of committing now, integrating all hidden dealer and future board cards."""
        remaining = self._remaining(state)
        future_n = 4 - len(state.board)
        dealer_n = 3 if state.dealer_visible is None else 2
        total = 0; count = 0
        # Exact joint enumeration when tractable; otherwise deterministic unbiased sampling.
        possibilities = 1
        import math
        possibilities = math.comb(len(remaining), dealer_n) * math.comb(len(remaining)-dealer_n, future_n)
        if possibilities <= max_exact:
            for hidden in combinations(remaining, dealer_n):
                left = tuple(c for c in remaining if c not in hidden)
                dealer = hidden if state.dealer_visible is None else (state.dealer_visible, *hidden)
                for future in combinations(left, future_n):
                    terminal = InformationState(state.player, state.board + future, state.dealer_visible)
                    total += self._terminal(terminal, dealer, wager); count += 1
            return total / count, True
        rng = Random(hash((state, wager, self.seed)) & ((1 << 64)-1))
        visible_dealer = () if state.dealer_visible is None else (state.dealer_visible,)
        for _ in range(self.samples):
            draw = rng.sample(remaining, dealer_n + future_n)
            dealer = visible_dealer + tuple(draw[:dealer_n])
            terminal = InformationState(state.player, state.board + tuple(draw[dealer_n:]), state.dealer_visible)
            total += self._terminal(terminal, dealer, wager)
        return total / self.samples, False

    def _final(self, state: InformationState, exact_requested: bool = True) -> Decision:
        bet, exact = self.wager_ev(state, 1, max_exact=200_000 if exact_requested else 0)
        evs = {"1x": bet, "fold": -2.0}
        best = max(evs, key=evs.get)
        other = "fold" if best == "1x" else "1x"
        return Decision(state, best, evs[best], evs[other], evs[best]-evs[other], evs, exact)

    def _sample_future_states(self, state: InformationState, add: int):
        rng = Random(hash((state, add, self.seed, "future")) & ((1 << 64)-1))
        remaining = self._remaining(state)
        # Marginal board distribution conditional on visible information. Hidden dealer cards
        # integrate out uniformly, so a uniform subset of the unseen deck is correct.
        for _ in range(self.samples):
            future = tuple(rng.sample(remaining, add))
            yield InformationState(state.player, state.board + future, state.dealer_visible)

    def _decision(self, state: InformationState, exact_requested: bool) -> Decision:
        if state.stage == 3: return self._final(state, exact_requested)
        if state.stage == 2 and exact_requested and state.dealer_visible is not None:
            # Enumerate by future board first.  That grouping is essential: the
            # later 1x/fold choice may depend on the board, but never on either
            # hidden dealer card.
            from .exact_analysis import exact_second_decision
            result = exact_second_decision(state)
            evs = {"2x": result.bet_2x.total, "check": result.check.total}
            best = result.best_action
            other = "check" if best == "2x" else "2x"
            return Decision(
                state, best, evs[best], evs[other], result.margin, evs, True
            )
        wager = 3 if state.stage == 1 else 2
        bet, bet_exact = self.wager_ev(state, wager)
        child_values = [self._decision(child, False).ev_best for child in self._sample_future_states(state, 2)]
        check = fmean(child_values)
        evs = {f"{wager}x": bet, "check": check}
        best = max(evs, key=evs.get); other = "check" if best != "check" else f"{wager}x"
        return Decision(state, best, evs[best], evs[other], evs[best]-evs[other], evs, False)

    def decision(self, state: InformationState) -> Decision:
        return self._decision(state, True)

    get_decision = decision

    def action(self, state: InformationState) -> str:
        """Return an action using only the supplied information state."""
        return self.decision(state).best_action
