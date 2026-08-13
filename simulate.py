import argparse, json, os, platform, subprocess, time
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from chase_flush.monte_carlo import simulate
from chase_flush.rules import RULES_VERSION, WIZARD_AVERAGE_WAGER, WIZARD_EV_PER_ANTE, XTRA_PAYTABLE
from chase_flush.reports import edge_metrics

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--hands", type=int, default=1000)
    p.add_argument("--seed", type=int, default=12345)
    p.add_argument("--decision-samples", type=int, default=8)
    p.add_argument("--output", default="results/latest.json")
    args = p.parse_args(); started = time.perf_counter()
    summaries, paired, actions = simulate(args.hands, args.seed, args.decision_samples)
    runtime = time.perf_counter()-started
    try: commit = subprocess.check_output(["git","rev-parse","HEAD"], text=True, stderr=subprocess.DEVNULL).strip()
    except Exception: commit = "unknown"
    baseline = summaries["baseline"]
    # A result is not "close" when the published value lies outside our 95% CI.
    # The 0.005 floor prevents tiny numerical noise from failing a very large run.
    tolerance = max(0.005, 1.95996398454*baseline.standard_error)
    passed = abs(baseline.mean-WIZARD_EV_PER_ANTE) <= tolerance
    result = {"metadata":{"git_commit":commit,"date":datetime.now(timezone.utc).isoformat(),"rules_version":RULES_VERSION,"paytable":XTRA_PAYTABLE,"hands":args.hands,"seed":args.seed,"solver_type":"sampled backward induction; paired terminal deals","decision_samples":args.decision_samples,"runtime_seconds":runtime,"cpu_count":os.cpu_count(),"platform":platform.platform()},"validation":{"passed":passed,"tolerance":tolerance,"difference":baseline.mean-WIZARD_EV_PER_ANTE},"wizard":{"ev_per_ante":WIZARD_EV_PER_ANTE,"average_wager":WIZARD_AVERAGE_WAGER},"variants":{k:edge_metrics(v) for k,v in summaries.items()},"paired_information_value":asdict(paired),"actions":actions}
    out = Path(args.output); out.parent.mkdir(parents=True, exist_ok=True); out.write_text(json.dumps(result, indent=2))
    print("NORMAL GAME VALIDATION")
    print(f"Wizard EV:       {WIZARD_EV_PER_ANTE:+.6f}")
    print(f"Simulator EV:    {baseline.mean:+.6f}")
    print(f"Difference:      {baseline.mean-WIZARD_EV_PER_ANTE:+.6f}")
    print(f"PASS/FAIL:       {'PASS' if passed else 'FAIL'} (tolerance {tolerance:.6f})")
    for key in ("baseline","final_only","from_2x","full_exposed"):
        s=summaries[key]; print(f"\n{key.upper()}: EV {s.mean:+.6f}; 95% CI [{s.ci95[0]:+.6f}, {s.ci95[1]:+.6f}]; avg wager {s.average_wager:.6f}; edge/action {s.mean/s.average_wager:+.4%}")
    print(f"\nINFORMATION VALUE: {paired.mean:+.6f}; paired 95% CI [{paired.ci95[0]:+.6f}, {paired.ci95[1]:+.6f}]; SE {paired.standard_error:.6f}")
    print(f"Runtime: {runtime:.2f}s; JSON: {out}")
    if not passed: raise SystemExit(2)

if __name__ == "__main__": main()
