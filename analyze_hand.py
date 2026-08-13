import argparse
from chase_flush.cards import card_name, parse_card, parse_cards
from chase_flush.exact_analysis import exact_second_decision
from chase_flush.solver import Decision, Solver
from chase_flush.state import InformationState

def main():
    p = argparse.ArgumentParser(description="Analyze a Chase the Flush information state")
    p.add_argument("--player", required=True)
    p.add_argument("--dealer-visible")
    p.add_argument("--board", default="")
    p.add_argument("--samples", type=int, default=40)
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--exact", action="store_true", help="use exact enumeration when supported")
    p.add_argument("--debug-payoff", action="store_true", help="print component EVs and enumeration counts")
    args = p.parse_args()
    player, board = parse_cards(args.player), parse_cards(args.board)
    visible = parse_card(args.dealer_visible) if args.dealer_visible else None
    state = InformationState(player, board, visible)
    solver = Solver(args.samples, args.seed)
    exact = None
    if args.exact or args.debug_payoff:
        if state.stage != 2 or state.dealer_visible is None:
            p.error("--exact/--debug-payoff currently require two board cards and an exposed dealer card")
        exact = exact_second_decision(state)
    if exact is None:
        informed = solver.decision(state)
    else:
        evs = {"2x": exact.bet_2x.total, "check": exact.check.total}
        other = "check" if exact.best_action == "2x" else "2x"
        informed = Decision(
            state, exact.best_action, evs[exact.best_action], evs[other],
            exact.margin, evs, True,
        )
    normal = solver.decision(InformationState(player, board))
    print("VISIBLE STATE")
    print("Player:", " ".join(map(card_name, player)))
    print("Dealer exposed:", card_name(visible) if visible is not None else "none")
    print("Board:", " ".join(map(card_name, board)) or "none")
    print("\nAVAILABLE ACTIONS")
    for action, ev in informed.action_evs.items(): print(f"{action:>6} EV: {ev:+.6f}")
    print(f"\nOPTIMAL ACTION: {informed.best_action.upper()}")
    print(f"Difference: {informed.ev_difference:.6f} units")
    print(f"Normal strategy: {normal.best_action.upper()} ({normal.ev_best:+.6f})")
    print("Method:", "exact enumeration" if informed.exact else f"sampled backward induction ({args.samples} samples/node; exact river)")
    if exact is not None and args.debug_payoff:
        print("\nEXACT PAYOFF AUDIT")
        print(f"Remaining deck size: {exact.remaining_cards}")
        print(f"Dealer hidden combinations per future board: {exact.dealer_hidden_combinations_per_board}")
        print(f"Future board combinations: {exact.future_board_combinations}")
        print(f"Total terminal states evaluated: {exact.terminal_states}")
        print("\n2X EV")
        print(f"  Ante component:   {exact.bet_2x.ante:+.12f}")
        print(f"  X-Tra component:  {exact.bet_2x.xtra:+.12f}")
        print(f"  All-In component: {exact.bet_2x.all_in:+.12f}")
        print(f"  Total:            {exact.bet_2x.total:+.12f}")
        print("\nCHECK EV")
        print(f"  Ante component:         {exact.check.ante:+.12f}")
        print(f"  X-Tra component:        {exact.check.xtra:+.12f}")
        print(f"  Future All-In component:{exact.check.all_in:+.12f}")
        print(f"  Total:                  {exact.check.total:+.12f}")
        print(f"\nBest action: {exact.best_action.upper()}")
        print(f"Decision margin: {exact.margin:.12f}")
        print(f"EV without dealer information (sampled independently): {normal.ev_best:+.6f}")

if __name__ == "__main__": main()
