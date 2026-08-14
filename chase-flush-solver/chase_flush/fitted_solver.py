"""High-throughput fitted backward induction for whole-game analysis.

Each training row is an independent legal ten-card deal.  Features contain only
the information available at that decision.  Targets use the complete deal to
produce an unbiased Monte Carlo sample of action regret.  Policies are fitted
strictly backward on independent datasets, preventing hidden-card leakage.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from math import sqrt
from pathlib import Path
from time import perf_counter
from typing import Any

import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor

P15 = np.array([15**i for i in range(7, -1, -1)], dtype=np.int64)
XTRA = np.array([0, 0, 0, 0, 1, 5, 50, 250], dtype=np.float64)

def set_six_card_payout(value: float) -> None:
    XTRA[6] = value


def random_deals(rng: np.random.Generator, n: int) -> np.ndarray:
    """Uniform ordered ten-card deals, vectorized Fisher-Yates."""
    deck = np.broadcast_to(np.arange(52, dtype=np.int8), (n, 52)).copy()
    rows = np.arange(n)
    for i in range(10):
        j = rng.integers(i, 52, size=n)
        old = deck[rows, i].copy()
        deck[rows, i] = deck[rows, j]
        deck[rows, j] = old
    return deck[:, :10]


def _hand_value(cards: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    ranks = cards % 13 + 2
    suits = cards // 13
    scores = np.empty((len(cards), 4), dtype=np.int64)
    counts = np.empty((len(cards), 4), dtype=np.int8)
    for s in range(4):
        selected = np.where(suits == s, ranks, 0)
        ordered = np.sort(selected, axis=1)[:, ::-1]
        counts[:, s] = (selected > 0).sum(axis=1)
        padded = np.zeros((len(cards), 7), dtype=np.int16)
        padded[:, : ordered.shape[1]] = ordered
        digits = np.column_stack((counts[:, s], padded))
        scores[:, s] = (digits * P15).sum(axis=1)
    best_suit = scores.argmax(axis=1)
    rows = np.arange(len(cards))
    return scores[rows, best_suit], counts[rows, best_suit]


def terminal_profit(deals: np.ndarray, wager: int) -> np.ndarray:
    board = deals[:, 6:10]
    player_value, player_len = _hand_value(np.column_stack((deals[:, :3], board)))
    dealer_value, dealer_len = _hand_value(np.column_stack((deals[:, 3:6], board)))
    # Extract the high card of the dealer's best flush from base-15 score.
    dealer_high = (dealer_value // (15**6)) % 15
    qualifies = (dealer_len > 3) | ((dealer_len == 3) & (dealer_high >= 9))
    win, loss = player_value > dealer_value, player_value < dealer_value
    result = np.zeros(len(deals), dtype=np.float64)
    result[win] = qualifies[win].astype(float) + wager + XTRA[player_len[win]]
    result[loss] = -qualifies[loss].astype(float) - wager - 1
    return result


def features(deals: np.ndarray, board_count: int, exposed: bool) -> np.ndarray:
    """Suit-canonical feature vector containing no hidden dealer cards."""
    n = len(deals)
    player, board = deals[:, :3], deals[:, 6 : 6 + board_count]
    visible = deals[:, 3] if exposed else np.full(n, -1, dtype=np.int8)
    blocks = np.zeros((n, 4, 11), dtype=np.int16)
    for s in range(4):
        p = np.where(player // 13 == s, player % 13 + 2, 0)
        b = np.where(board // 13 == s, board % 13 + 2, 0)
        blocks[:, s, 0] = (p > 0).sum(axis=1)
        blocks[:, s, 1:4] = np.sort(p, axis=1)[:, ::-1]
        blocks[:, s, 4] = (b > 0).sum(axis=1)
        if board_count:
            blocks[:, s, 5 : 5 + board_count] = np.sort(b, axis=1)[:, ::-1]
        blocks[:, s, 9] = (visible // 13 == s).astype(np.int16)
        blocks[:, s, 10] = np.where(visible // 13 == s, visible % 13 + 2, 0)
    # Canonicalize suit names. Key is injective for each 11-field suit block.
    key = np.zeros((n, 4), dtype=np.int64)
    for j in range(11): key = key * 16 + blocks[:, :, j]
    order = np.argsort(key, axis=1)[:, ::-1]
    canon = np.take_along_axis(blocks, order[:, :, None], axis=1).reshape(n, -1)
    # Best visible player flush ranks are useful smooth summaries for trees.
    holding = np.column_stack((player, board))
    value, length = _hand_value(holding)
    best_digits = np.empty((n, 8), dtype=np.int16)
    rem = value.copy()
    for j, power in enumerate(P15):
        best_digits[:, j] = rem // power
        rem %= power
    return np.column_stack((canon, best_digits, length)).astype(np.float32)


def make_model(seed: int) -> HistGradientBoostingRegressor:
    return HistGradientBoostingRegressor(
        loss="squared_error", learning_rate=0.075, max_iter=220,
        max_leaf_nodes=63, max_depth=10, min_samples_leaf=40,
        l2_regularization=1.0, random_state=seed,
    )


@dataclass
class PolicySet:
    d3_normal: Any; d3_exposed: Any
    d2_baseline: Any; d2_final_only: Any; d2_exposed: Any
    d1_baseline: Any; d1_final_only: Any; d1_from2: Any; d1_exposed: Any
    thresholds: dict[str, float] = field(default_factory=dict)

    def save(self, path: str | Path) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True); joblib.dump(self, path, compress=3)

    @staticmethod
    def load(path: str | Path) -> "PolicySet": return joblib.load(path)


def _predict(model: Any, deals: np.ndarray, stage: int, exposed: bool) -> np.ndarray:
    prediction = model.predict(features(deals, {1:0, 2:2, 3:4}[stage], exposed))
    # Regret cannot be worse than losing the maximum wager instead of taking
    # the continuation's minimum -2. Tree extrapolation can cross this bound.
    return np.maximum(prediction, {1:-3.0, 2:-2.0, 3:-1.0}[stage])


def _continuation_d3(deals: np.ndarray, model: Any, exposed: bool, threshold: float = 0.0) -> np.ndarray:
    bet = _predict(model, deals, 3, exposed) >= threshold
    return np.where(bet, terminal_profit(deals, 1), -2.0)


def _continuation_d2(deals: np.ndarray, d2: Any, d2_exposed: bool, d3: Any, d3_exposed: bool,
                     d2_threshold: float = 0.0, d3_threshold: float = 0.0) -> np.ndarray:
    bet2 = _predict(d2, deals, 2, d2_exposed) >= d2_threshold
    return np.where(bet2, terminal_profit(deals, 2), _continuation_d3(deals, d3, d3_exposed, d3_threshold))


def _fit(name: str, deals: np.ndarray, stage: int, exposed: bool, regret: np.ndarray, seed: int):
    started = perf_counter(); model = make_model(seed); model.fit(features(deals, {1:0,2:2,3:4}[stage], exposed), regret)
    print(f"trained {name:14s} n={len(deals):,} in {perf_counter()-started:.1f}s")
    return model


def train_policies(n: int, seed: int = 12345) -> PolicySet:
    """Fit nine schedule-aware policies on independent datasets."""
    ss = np.random.SeedSequence(seed).spawn(9)
    def deal(i: int): return random_deals(np.random.default_rng(ss[i]), n)
    d = deal(0); p1 = terminal_profit(d, 1)
    d3n = _fit("d3 normal", d, 3, False, p1 + 2, seed)
    d = deal(1); d3e = _fit("d3 exposed", d, 3, True, terminal_profit(d,1)+2, seed+1)

    d = deal(2); d2n = _fit("d2 baseline", d, 2, False, terminal_profit(d,2)-_continuation_d3(d,d3n,False), seed+2)
    d = deal(3); d2f = _fit("d2 final-only", d, 2, False, terminal_profit(d,2)-_continuation_d3(d,d3e,True), seed+3)
    d = deal(4); d2e = _fit("d2 exposed", d, 2, True, terminal_profit(d,2)-_continuation_d3(d,d3e,True), seed+4)

    d = deal(5); d1n = _fit("d1 baseline", d, 1, False, terminal_profit(d,3)-_continuation_d2(d,d2n,False,d3n,False), seed+5)
    d = deal(6); d1f = _fit("d1 final-only", d, 1, False, terminal_profit(d,3)-_continuation_d2(d,d2f,False,d3e,True), seed+6)
    d = deal(7); d1c = _fit("d1 from-2x", d, 1, False, terminal_profit(d,3)-_continuation_d2(d,d2e,True,d3e,True), seed+7)
    d = deal(8); d1e = _fit("d1 exposed", d, 1, True, terminal_profit(d,3)-_continuation_d2(d,d2e,True,d3e,True), seed+8)
    return PolicySet(d3n,d3e,d2n,d2f,d2e,d1n,d1f,d1c,d1e)


def play_variant(deals: np.ndarray, p: PolicySet, variant: str) -> tuple[np.ndarray,np.ndarray,np.ndarray]:
    if variant == "baseline": d1,d2,d3,e1,e2,e3,k1,k2,k3=p.d1_baseline,p.d2_baseline,p.d3_normal,False,False,False,"d1_baseline","d2_baseline","d3_normal"
    elif variant == "final_only": d1,d2,d3,e1,e2,e3,k1,k2,k3=p.d1_final_only,p.d2_final_only,p.d3_exposed,False,False,True,"d1_final_only","d2_final_only","d3_exposed"
    elif variant == "from_2x": d1,d2,d3,e1,e2,e3,k1,k2,k3=p.d1_from2,p.d2_exposed,p.d3_exposed,False,True,True,"d1_from2","d2_exposed","d3_exposed"
    elif variant == "full_exposed": d1,d2,d3,e1,e2,e3,k1,k2,k3=p.d1_exposed,p.d2_exposed,p.d3_exposed,True,True,True,"d1_exposed","d2_exposed","d3_exposed"
    else: raise ValueError(variant)
    thresholds=getattr(p,"thresholds",{})
    a1=_predict(d1,deals,1,e1)>=thresholds.get(k1,0.0);a2=_predict(d2,deals,2,e2)>=thresholds.get(k2,0.0);a3=_predict(d3,deals,3,e3)>=thresholds.get(k3,0.0)
    action=np.where(a1,3,np.where(a2,2,np.where(a3,1,0))).astype(np.int8)
    profits=np.where(action==3,terminal_profit(deals,3),np.where(action==2,terminal_profit(deals,2),np.where(action==1,terminal_profit(deals,1),-2.0)))
    return profits, 2+action, action


def _optimal_threshold(prediction: np.ndarray, regret: np.ndarray) -> float:
    """Choose the out-of-sample cutoff maximizing realized paired improvement."""
    order = np.argsort(prediction)[::-1]
    cumulative = np.cumsum(regret[order], dtype=np.float64)
    best_count = int(np.argmax(np.concatenate(([0.0], cumulative))))
    if best_count == 0:
        return float(np.nextafter(prediction.max(), np.inf))
    if best_count == len(prediction):
        return float(np.nextafter(prediction.min(), -np.inf))
    high = prediction[order[best_count - 1]]
    low = prediction[order[best_count]]
    return float((high + low) / 2)


def calibrate_policies(p: PolicySet, n: int = 2_000_000, seed: int = 987654) -> PolicySet:
    """Calibrate nine action cutoffs on independent paired outcomes, backward."""
    ss = np.random.SeedSequence(seed).spawn(9)
    thresholds: dict[str, float] = {}
    def deal(i): return random_deals(np.random.default_rng(ss[i]), n)
    def fit_threshold(key, model, deals, stage, exposed, regret):
        threshold = _optimal_threshold(_predict(model, deals, stage, exposed), regret)
        thresholds[key] = threshold
        print(f"calibrated {key:14s} threshold={threshold:+.6f}")

    d=deal(0);fit_threshold("d3_normal",p.d3_normal,d,3,False,terminal_profit(d,1)+2)
    d=deal(1);fit_threshold("d3_exposed",p.d3_exposed,d,3,True,terminal_profit(d,1)+2)
    d=deal(2);c=_continuation_d3(d,p.d3_normal,False,thresholds["d3_normal"]);fit_threshold("d2_baseline",p.d2_baseline,d,2,False,terminal_profit(d,2)-c)
    d=deal(3);c=_continuation_d3(d,p.d3_exposed,True,thresholds["d3_exposed"]);fit_threshold("d2_final_only",p.d2_final_only,d,2,False,terminal_profit(d,2)-c)
    d=deal(4);c=_continuation_d3(d,p.d3_exposed,True,thresholds["d3_exposed"]);fit_threshold("d2_exposed",p.d2_exposed,d,2,True,terminal_profit(d,2)-c)
    d=deal(5);c=_continuation_d2(d,p.d2_baseline,False,p.d3_normal,False,thresholds["d2_baseline"],thresholds["d3_normal"]);fit_threshold("d1_baseline",p.d1_baseline,d,1,False,terminal_profit(d,3)-c)
    d=deal(6);c=_continuation_d2(d,p.d2_final_only,False,p.d3_exposed,True,thresholds["d2_final_only"],thresholds["d3_exposed"]);fit_threshold("d1_final_only",p.d1_final_only,d,1,False,terminal_profit(d,3)-c)
    d=deal(7);c=_continuation_d2(d,p.d2_exposed,True,p.d3_exposed,True,thresholds["d2_exposed"],thresholds["d3_exposed"]);fit_threshold("d1_from2",p.d1_from2,d,1,False,terminal_profit(d,3)-c)
    d=deal(8);c=_continuation_d2(d,p.d2_exposed,True,p.d3_exposed,True,thresholds["d2_exposed"],thresholds["d3_exposed"]);fit_threshold("d1_exposed",p.d1_exposed,d,1,True,terminal_profit(d,3)-c)
    p.thresholds = thresholds
    return p


def summary(values: np.ndarray, wagers: np.ndarray) -> dict[str, Any]:
    n=len(values); mean=float(values.mean()); var=float(values.var(ddof=1)); se=sqrt(var/n)
    return {"hands":n,"mean":mean,"variance":var,"standard_error":se,"ci95":[mean-1.95996398454*se,mean+1.95996398454*se],"average_wager":float(wagers.mean()),"edge_vs_ante":mean,"edge_vs_initial_two_units":mean/2,"edge_vs_average_total_wager":mean/float(wagers.mean())}


def evaluate(policies: PolicySet, hands: int, seed: int, batch: int = 200_000):
    rng=np.random.default_rng(seed); variants=("baseline","final_only","from_2x","full_exposed")
    values={v:[] for v in variants}; wagers={v:[] for v in variants}; actions={v:np.zeros(4,dtype=np.int64) for v in variants}
    ranks={r:{"ev":[],"delta":[]} for r in range(2,15)}
    suit_groups={k:{"ev":[],"delta":[]} for k in ("matches_player_dominant","other_suit","matches_no_player_card","matches_one_player_card","matches_two_player_cards","higher_than_player_in_suit","not_higher_than_player_in_suit","high_card_9_to_A","low_card_2_to_8")}
    remaining=hands
    while remaining:
        d=random_deals(rng,min(batch,remaining)); remaining-=len(d); batch_results={}
        for v in variants:
            val,wag,act=play_variant(d,policies,v); values[v].append(val);wagers[v].append(wag);actions[v]+=np.bincount(act,minlength=4);batch_results[v]=val
        delta=batch_results["full_exposed"]-batch_results["baseline"]
        exposed_rank=d[:,3]%13+2
        full=batch_results["full_exposed"]
        for r in range(2,15):
            mask=exposed_rank==r;ranks[r]["ev"].append(full[mask]);ranks[r]["delta"].append(delta[mask])
        psuits=d[:,:3]//13; esuit=d[:,3]//13; dominant=np.array([np.bincount(x,minlength=4).argmax() for x in psuits]); match=esuit==dominant
        same_count=(psuits==esuit[:,None]).sum(axis=1);pranks=d[:,:3]%13+2;higher=(same_count>0)&(exposed_rank>np.where(psuits==esuit[:,None],pranks,0).max(axis=1))
        masks={"matches_player_dominant":match,"other_suit":~match,"matches_no_player_card":same_count==0,"matches_one_player_card":same_count==1,"matches_two_player_cards":same_count==2,"higher_than_player_in_suit":higher,"not_higher_than_player_in_suit":(same_count>0)&~higher,"high_card_9_to_A":exposed_rank>=9,"low_card_2_to_8":exposed_rank<9}
        for name,mask in masks.items():suit_groups[name]["ev"].append(full[mask]);suit_groups[name]["delta"].append(delta[mask])
        print(f"evaluated {hands-remaining:,}/{hands:,}",end="\r")
    values={k:np.concatenate(v) for k,v in values.items()}; wagers={k:np.concatenate(v) for k,v in wagers.items()}
    paired=values["full_exposed"]-values["baseline"]
    return ({k:summary(values[k],wagers[k]) for k in variants}, summary(paired,np.ones(len(paired))),
            {k:{str(i):int(x) for i,x in enumerate(a)} for k,a in actions.items()},
            {str(r):{label:summary(np.concatenate(parts),np.ones(sum(map(len,parts)))) for label,parts in x.items()} for r,x in ranks.items()},
            {k:{label:summary(np.concatenate(parts),np.ones(sum(map(len,parts)))) for label,parts in x.items()} for k,x in suit_groups.items()})
