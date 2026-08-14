import argparse
import json

from chase_flush.high_precision import auto_workers, run_adaptive
from chase_flush.rules import WIZARD_EV_PER_ANTE


def main():
    parser = argparse.ArgumentParser(description="Resumable high-precision Chase the Flush policy evaluation")
    parser.add_argument("--mode", choices=("baseline", "full_exposed", "paired"), default="paired")
    parser.add_argument("--hands", type=int)
    parser.add_argument("--until-converged", action="store_true")
    parser.add_argument("--precision", type=float, default=0.005)
    parser.add_argument("--confidence", type=float, default=0.999)
    parser.add_argument("--max-hands", type=int, default=100_000_000_000)
    parser.add_argument("--min-hands", type=int, default=0)
    parser.add_argument("--batch-size", type=int, default=200_000)
    parser.add_argument("--workers", default="1")
    parser.add_argument("--seed", type=int, default=12345)
    parser.add_argument("--models", default="results/current50-policies-2m.joblib")
    parser.add_argument("--six-payout", type=float, default=50)
    parser.add_argument("--output", default="results/high-precision.json")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--quality", choices=("standard", "near-exact", "extreme"), default="standard")
    args = parser.parse_args()
    if args.quality == "near-exact":
        args.confidence, args.precision, args.min_hands = 0.999, 0.001, max(args.min_hands, 100_000_000)
    elif args.quality == "extreme":
        args.confidence, args.precision, args.min_hands = 0.9999, 0.0001, max(args.min_hands, 100_000_000)
    if args.hands is None and not args.until_converged:
        parser.error("provide --hands or --until-converged")
    workers = auto_workers(args.workers)
    result = run_adaptive(mode=args.mode, model_path=args.models, output=args.output,
                          seed=args.seed, hands=args.hands, until_converged=args.until_converged,
                          precision=args.precision, confidence=args.confidence,
                          max_hands=args.max_hands, min_hands=args.min_hands,
                          batch_size=args.batch_size, workers=workers,
                          six_payout=args.six_payout, resume=args.resume)
    report = result.to_dict(args.confidence, args.precision, workers)
    print("\nFULL HIGH-PRECISION ANALYSIS")
    print(f"Hands:       {result.hands:,}")
    print(f"Runtime:     {result.runtime_seconds:.2f}s")
    print(f"Throughput:  {result.hands/result.runtime_seconds:,.0f} hands/sec")
    for name, value in report["variants"].items():
        ci = value["ci99_9"]
        print(f"{name:13s} EV {value['mean']:+.6f}; SE {value['standard_error']:.6f}; 99.9% CI [{ci[0]:+.6f}, {ci[1]:+.6f}]")
    if args.mode == "paired":
        value = report["paired_difference"]; ci = value["ci99_9"]
        print(f"Information value: {value['mean']:+.6f}; paired SE {value['standard_error']:.6f}; 99.9% CI [{ci[0]:+.6f}, {ci[1]:+.6f}]")
    if args.mode == "baseline" and args.six_payout == 20:
        value = report["variants"]["baseline"]
        z = (value["mean"] - WIZARD_EV_PER_ANTE) / value["standard_error"]
        passed = abs(z) <= 3.290526731
        print("\nBASELINE VALIDATION")
        print(f"Wizard EV:      {WIZARD_EV_PER_ANTE:+.6f}")
        print(f"Our EV:         {value['mean']:+.6f}")
        print(f"Difference:     {value['mean']-WIZARD_EV_PER_ANTE:+.6f}")
        print(f"Standard error: {value['standard_error']:.6f}")
        print(f"Z-score:        {z:+.3f}")
        print(f"PASS / FAIL:    {'PASS' if passed else 'FAIL'}")
        if not passed:
            raise SystemExit(2)
    print(f"Status: {report['stopping']['status']}")
    print(f"JSON: {args.output}")


if __name__ == "__main__":
    main()
