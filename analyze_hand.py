import argparse
from chase_flush.cards import card_name, parse_card, parse_cards
from chase_flush.solver import Solver
from chase_flush.state import InformationState

def main():
    p = argparse.ArgumentParser(description="Analyze a Chase the Flush information state")
    p.add_argument("--player", required=True)
    p.add_argument("--dealer-visible")
    p.add_argument("--board", default="")
    p.add_argument("--samples", type=int, default=40)
    p.add_argument("--seed", type=int, default=1)
    args = p.parse_args()
    player, board = parse_cards(args.player), parse_cards(args.board)
    visible = parse_card(args.dealer_visible) if args.dealer_visible else None
    state = InformationState(player, board, visible)
    solver = Solver(args.samples, args.seed)
    informed = solver.decision(state)
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

if __name__ == "__main__": main()
