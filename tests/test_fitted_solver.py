import numpy as np
from chase_flush.fitted_solver import features, random_deals, terminal_profit
from chase_flush.payouts import settle

def test_vectorized_settlement_matches_canonical_engine():
    deals=random_deals(np.random.default_rng(91),10_000)
    for wager in (1,2,3):
        vector=terminal_profit(deals,wager)
        scalar=np.array([settle(tuple(map(int,d[:3]))+tuple(map(int,d[6:10])),tuple(map(int,d[3:6]))+tuple(map(int,d[6:10])),wager).net for d in deals])
        np.testing.assert_array_equal(vector,scalar)

def test_features_cannot_see_hidden_dealer_cards():
    deals=random_deals(np.random.default_rng(7),100)
    altered=deals.copy(); altered[:,[4,5]]=altered[:,[5,4]]
    for stage,board_count in ((1,0),(2,2),(3,4)):
        np.testing.assert_array_equal(features(deals,board_count,True),features(altered,board_count,True))
        np.testing.assert_array_equal(features(deals,board_count,False),features(altered,board_count,False))

def test_suit_canonical_features_are_invariant_to_suit_permutation():
    deals=random_deals(np.random.default_rng(8),100)
    perm=np.array([2,0,3,1])
    changed=perm[deals//13]*13+deals%13
    for board_count in (0,2,4):
        np.testing.assert_array_equal(features(deals,board_count,True),features(changed,board_count,True))
