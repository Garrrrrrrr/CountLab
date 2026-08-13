import pytest
from chase_flush.cards import parse_cards
from chase_flush.payouts import settle

def test_fold_and_validation():
    assert settle((), (), None, folded=True).net == -2
    with pytest.raises(ValueError): settle((), (), 1, folded=True)

def test_fold_settlement_components():
    result = settle((), (), None, folded=True)
    assert (result.ante, result.xtra, result.all_in, result.net) == (-1, -1, 0, -2)

def test_net_profit_not_gross_return():
    player = parse_cards("Ah Kh Qh 2c 3d 4s 5c")
    dealer = parse_cards("Jh Th 9h 2d 3s 4c 5d")
    result = settle(player, dealer, 1)
    assert result.all_in == 1
    assert result.net == 2

def test_xtra_not_scaled_by_all_in():
    player = parse_cards("Ah Kh Qh Jh Th 2c 3d")
    dealer = parse_cards("9c 8c 7c 2d 3s 4d 5s")
    assert settle(player, dealer, 1).xtra == 5
    assert settle(player, dealer, 3).xtra == 5

@pytest.mark.parametrize("n,pay", [(4,1),(5,5),(6,50),(7,250)])
def test_player_win_xtra_paytable(n, pay):
    p = parse_cards("Ah Kh Qh Jh Th 9h 8h")[:n] + parse_cards("2c 3d 4s")[:7-n]
    d = parse_cards("7c 6c 5c 2d 3s 4d 8s")
    result = settle(p, d, 2)
    assert result.xtra == pay and result.all_in == 2

def test_nonqualifying_ante_push_but_other_bets_resolve():
    p = parse_cards("Ah Kh Qh 2c 3d 4s 5c")
    d = parse_cards("8h 7h 6h Ac Kd Qs 9c")
    win = settle(p, d, 3)
    assert (win.ante, win.all_in, win.xtra) == (0, 3, 0)

def test_nonqualifying_dealer_ante_pushes_even_when_player_loses():
    p = parse_cards("7h 5h 4h 2c 3d 9s Tc")
    d = parse_cards("8h 7h 6h Ac Kd Qs Jc")
    loss = settle(p, d, 2)
    assert (loss.ante, loss.all_in, loss.xtra) == (0, -2, -1)

def test_loss_and_tie():
    weak = parse_cards("8h 7h 6h 2c 3d 4s 5c")
    strong = parse_cards("Ah Kh Qh 2d 3s 4c 5d")
    assert settle(weak, strong, 1).net == -3
    assert settle(strong, strong, 1).net == 0
