import argparse

from chase_flush.fitted_solver import PolicySet, calibrate_policies, set_six_card_payout


def main():
    parser = argparse.ArgumentParser(description="Calibrate fitted decision cutoffs on independent paired deals")
    parser.add_argument("--models", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--hands", type=int, default=2_000_000)
    parser.add_argument("--seed", type=int, default=987654)
    parser.add_argument("--six-payout", type=float, default=50)
    args = parser.parse_args()
    set_six_card_payout(args.six_payout)
    policies = calibrate_policies(PolicySet.load(args.models), args.hands, args.seed)
    policies.save(args.output)
    print(f"Saved calibrated policies to {args.output}")


if __name__ == "__main__":
    main()
