"""Strategy-difference extraction from fitted policies."""
from __future__ import annotations
from typing import Any
import numpy as np
from .cards import card_name
from .fitted_solver import PolicySet, _predict, random_deals

def _shown(deal: np.ndarray, board_count: int) -> dict[str, Any]:
    return {"player":[card_name(int(c)) for c in deal[:3]],"dealer_visible":card_name(int(deal[3])),"board":[card_name(int(c)) for c in deal[6:6+board_count]]}

def strategy_differences(p: PolicySet, seed: int=91, candidates: int=200_000, per_stage: int=12):
    d=random_deals(np.random.default_rng(seed),candidates); out={}
    specs=[("initial",1,0,p.d1_from2,p.d1_exposed,False,True,"check","3x"),
           ("two_card",2,2,p.d2_final_only,p.d2_exposed,False,True,"check","2x"),
           ("final",3,4,p.d3_normal,p.d3_exposed,False,True,"fold","1x")]
    for name,stage,bc,normal,informed,en,ei,negative,positive in specs:
        nr=_predict(normal,d,stage,en);ir=_predict(informed,d,stage,ei)
        na=nr>=0;ia=ir>=0;idx=np.flatnonzero(na!=ia)
        idx=idx[np.argsort(np.minimum(np.abs(nr[idx]),np.abs(ir[idx])))[::-1]][:per_stage]
        out[name]=[{**_shown(d[i],bc),"normal_action":positive if na[i] else negative,"known_action":positive if ia[i] else negative,"known_action_margin":float(abs(ir[i]))} for i in idx]
    return out
