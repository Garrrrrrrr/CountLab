import argparse,json
from pathlib import Path
from chase_flush.fitted_solver import PolicySet,set_six_card_payout
from chase_flush.strategy import strategy_differences

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--models",default="results/current50-policies-2m.joblib");p.add_argument("--output",default="results/strategy-differences.json");p.add_argument("--seed",type=int,default=991);a=p.parse_args()
    set_six_card_payout(50);result=strategy_differences(PolicySet.load(a.models),a.seed);Path(a.output).write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
