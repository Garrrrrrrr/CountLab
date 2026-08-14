import argparse
from dataclasses import asdict

from chase_flush.cards import card_name, parse_card, parse_cards
from chase_flush.compiled_exact import (
    ExactActionResult,
    exact_opening_compiled,
    exact_river_compiled,
    exact_stage2_compiled,
)
from chase_flush.exact_analysis import exact_second_decision
from chase_flush.state import InformationState


def calculate_exact(state: InformationState, six_payout: int) -> ExactActionResult:
    if state.stage == 1:
        return exact_opening_compiled(state, six_payout)
    if state.stage == 2:
        return exact_stage2_compiled(state, six_payout)
    return exact_river_compiled(state, six_payout)


def print_action(label: str, ev: float, result: ExactActionResult) -> None:
    print(f"{label.upper()}")
    print(f"  EV:             {ev:+.12f}")
    print("  Standard error: 0 (exact)")
    for confidence in (95, 99, 99.9, 99.99):
        print(f"  {confidence:g}% CI:       [{ev:+.12f}, {ev:+.12f}]")
    print(f"  Samples:        {result.terminal_states:,} exact terminals")
    print(f"  Runtime:        {result.runtime_seconds:.3f}s")
    print(f"  States/sec:     {result.terminal_states / result.runtime_seconds:,.0f}")


def main():
    parser = argparse.ArgumentParser(description="Exact Chase the Flush information-state analyzer")
    parser.add_argument("--player", required=True)
    parser.add_argument("--dealer-visible")
    parser.add_argument("--board", default="")
    parser.add_argument("--six-payout", type=int, choices=(20, 50), default=50)
    parser.add_argument("--exact", action="store_true", help="retained for compatibility; exact is automatic")
    parser.add_argument("--debug-payoff", action="store_true")
    parser.add_argument("--quality", choices=("near-exact", "extreme"), default="near-exact")
    parser.add_argument("--precision", type=float, default=0.001)
    parser.add_argument("--confidence", type=float, default=0.999)
    parser.add_argument("--max-samples", type=int, default=100_000_000_000)
    parser.add_argument("--resume", action="store_true", help="exact calculations need no persisted Monte Carlo state")
    args = parser.parse_args()

    player, board = parse_cards(args.player), parse_cards(args.board)
    visible = parse_card(args.dealer_visible) if args.dealer_visible else None
    state = InformationState(player, board, visible)
    result = calculate_exact(state, args.six_payout)

    print("STATE")
    print("Player:", " ".join(map(card_name, player)))
    print("Dealer exposed:", card_name(visible) if visible is not None else "none")
    print("Board:", " ".join(map(card_name, board)) or "none")
    print("Calculation method: EXACT (compiled exhaustive enumeration)")
    print()
    print_action(result.action_a, result.ev_a, result)
    print()
    print_action(result.action_b, result.ev_b, result)
    print("\nPAIRED DIFFERENCE")
    print(f"  {result.action_a.upper()} - {result.action_b.upper()}: {result.difference:+.12f}")
    print("  Standard error: 0 (exact)")
    print(f"  99.9% CI:       [{result.difference:+.12f}, {result.difference:+.12f}]")
    print(f"\nDECISION: {result.best_action.upper()} (EXACT)")

    if visible is not None:
        normal = calculate_exact(InformationState(player, board), args.six_payout)
        print("\nWITHOUT DEALER INFORMATION — INDEPENDENT EXACT CALCULATION")
        print(f"Action: {normal.best_action.upper()}")
        print(f"{normal.action_a.upper()}: {normal.ev_a:+.12f}")
        print(f"{normal.action_b.upper()}: {normal.ev_b:+.12f}")
        print(f"Difference: {normal.difference:+.12f}")

    if args.debug_payoff and state.stage == 2 and visible is not None:
        audit = exact_second_decision(state)
        print("\nEXACT PAYOFF COMPONENT AUDIT")
        print(f"Remaining deck size: {audit.remaining_cards}")
        print(f"Future board combinations: {audit.future_board_combinations}")
        print(f"Dealer hidden combinations per board: {audit.dealer_hidden_combinations_per_board}")
        print(f"Total terminal states: {audit.terminal_states}")
        print("2X:", asdict(audit.bet_2x), "total", audit.bet_2x.total)
        print("CHECK:", asdict(audit.check), "total", audit.check.total)


if __name__ == "__main__":
    main()
