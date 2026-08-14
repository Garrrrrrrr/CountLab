import argparse,json,os,platform,subprocess,time
from datetime import datetime,timezone
from pathlib import Path
from chase_flush.fitted_solver import PolicySet,evaluate,set_six_card_payout,train_policies
from chase_flush.rules import RULES_VERSION,WIZARD_AVERAGE_WAGER,WIZARD_EV_PER_ANTE,XTRA_PAYTABLE

def main():
    ap=argparse.ArgumentParser(description="Fitted backward-induction Chase the Flush solver")
    ap.add_argument("--train-hands",type=int,default=500_000);ap.add_argument("--hands",type=int,default=5_000_000)
    ap.add_argument("--seed",type=int,default=12345);ap.add_argument("--models",default="results/fitted-policies.joblib")
    ap.add_argument("--six-payout",type=float,default=50.0)
    ap.add_argument("--reuse-models",action="store_true");ap.add_argument("--output",default="results/fitted-results.json")
    a=ap.parse_args(); started=time.perf_counter(); set_six_card_payout(a.six_payout)
    policies=PolicySet.load(a.models) if a.reuse_models else train_policies(a.train_hands,a.seed)
    if not a.reuse_models: policies.save(a.models)
    variants,paired,actions,by_rank,by_suit=evaluate(policies,a.hands,a.seed+1_000_000)
    baseline=variants["baseline"]
    # Wizard's published analysis table uses 20:1 for six-card flushes even
    # though the current displayed paytable says 50:1. Direct validation is
    # therefore meaningful only in legacy-20 mode.
    validation_target=WIZARD_EV_PER_ANTE if a.six_payout==20 else None
    diff=None if validation_target is None else baseline["mean"]-validation_target
    tolerance=max(.002,1.95996398454*baseline["standard_error"])
    passed=None if diff is None else abs(diff)<=tolerance
    try: commit=subprocess.check_output(["git","rev-parse","HEAD"],text=True,stderr=subprocess.DEVNULL).strip()
    except Exception: commit="unknown"
    paytable=dict(XTRA_PAYTABLE);paytable[6]=a.six_payout
    result={"metadata":{"git_commit":commit,"date":datetime.now(timezone.utc).isoformat(),"rules_version":RULES_VERSION,"paytable":paytable,"train_hands_per_policy":a.train_hands,"evaluation_hands":a.hands,"seed":a.seed,"solver_type":"schedule-aware fitted backward induction","runtime_seconds":time.perf_counter()-started,"cpu_count":os.cpu_count(),"platform":platform.platform()},"validation":{"applicable":validation_target is not None,"target":validation_target,"passed":passed,"difference":diff,"tolerance":tolerance,"note":"Wizard analysis rows use 20:1 for six-card wins; displayed current paytable uses 50:1."},"wizard":{"published_ev_per_ante_legacy_20_table":WIZARD_EV_PER_ANTE,"average_wager_legacy_20_strategy":WIZARD_AVERAGE_WAGER},"variants":variants,"paired_information_value":paired,"actions":actions,"information_value_by_exposed_rank":by_rank,"information_value_by_suit_relationship":by_suit}
    out=Path(a.output);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(result,indent=2))
    print("\nNORMAL GAME VALIDATION")
    if validation_target is None: print("N/A: current 50:1 paytable conflicts with Wizard's legacy-20 analysis table")
    else: print(f"Wizard EV: {validation_target:+.6f}\nSimulator EV: {baseline['mean']:+.6f}\nDifference: {diff:+.6f}\nPASS/FAIL: {'PASS' if passed else 'FAIL'}")
    for k,v in variants.items(): print(f"{k:12s} EV {v['mean']:+.6f} CI [{v['ci95'][0]:+.6f},{v['ci95'][1]:+.6f}] wager {v['average_wager']:.6f}")
    print(f"Information value {paired['mean']:+.6f} CI [{paired['ci95'][0]:+.6f},{paired['ci95'][1]:+.6f}]")
    if passed is False: raise SystemExit(2)

if __name__=="__main__":main()
