from dataclasses import dataclass
from math import sqrt
from random import Random
from statistics import fmean, variance
from .cards import DECK
from .payouts import settle
from .solver import Solver
from .state import ActualState

@dataclass(frozen=True)
class Summary:
    hands: int; mean: float; variance: float; standard_error: float; ci95: tuple[float,float]; average_wager: float

def summarize(values: list[float], wagers: list[float]) -> Summary:
    n = len(values); mean = fmean(values); var = variance(values) if n > 1 else 0.0; se = sqrt(var/n)
    return Summary(n, mean, var, se, (mean-1.95996398454*se, mean+1.95996398454*se), fmean(wagers))

def play(actual: ActualState, solver: Solver, reveal_from_stage: int) -> tuple[float,float,str]:
    for board_count, wager, stage in ((0,3,1),(2,2,2),(4,1,3)):
        expose = stage >= reveal_from_stage
        decision = solver._decision(actual.information(board_count, expose), False)
        if decision.best_action == "fold": return -2.0, 2.0, "fold"
        if decision.best_action.endswith("x"):
            amount = int(decision.best_action[0])
            result = settle(actual.player + actual.board, actual.dealer + actual.board, amount)
            return result.net, 2.0 + amount, decision.best_action
    raise AssertionError("unreachable")

def simulate(hands: int, seed: int, decision_samples: int = 8):
    rng = Random(seed); solver = Solver(decision_samples, seed)
    variants = {"baseline":99, "final_only":3, "from_2x":2, "full_exposed":1}
    values = {k: [] for k in variants}; wagers = {k: [] for k in variants}; actions = {k: {} for k in variants}
    for _ in range(hands):
        cards = rng.sample(DECK, 10)
        actual = ActualState(tuple(cards[:3]), tuple(cards[3:6]), tuple(cards[6:10]))
        for name, threshold in variants.items():
            value, wager, action = play(actual, solver, threshold)
            values[name].append(value); wagers[name].append(wager)
            actions[name][action] = actions[name].get(action, 0) + 1
    summaries = {k: summarize(values[k], wagers[k]) for k in variants}
    paired = summarize([a-b for a,b in zip(values["full_exposed"], values["baseline"])], [0.0]*hands)
    return summaries, paired, actions
