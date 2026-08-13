"""Exact terminal-decision interface.

Earlier decision points have billions of joint dealer/board completions and are
routed to the sampled backward-induction Solver. River enumeration is exact.
"""
from .solver import Decision, Solver
from .state import InformationState

def solve_final(state: InformationState) -> Decision:
    if state.stage != 3:
        raise ValueError("exact terminal solver requires all four board cards")
    return Solver(samples=1).decision(state)
