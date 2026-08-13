from dataclasses import dataclass
from .cards import Card
from .hand_rank import dealer_qualifies, flush_rank
from .rules import XTRA_PAYTABLE

@dataclass(frozen=True, slots=True)
class Settlement:
    ante: float; all_in: float; xtra: float
    @property
    def net(self) -> float: return self.ante + self.all_in + self.xtra

def settle(player_cards: tuple[Card, ...], dealer_cards: tuple[Card, ...], all_in: int | None, *, folded: bool=False) -> Settlement:
    """Return net profit. Fold surrenders both mandatory bets; no All-In was made."""
    if folded:
        if all_in is not None: raise ValueError("cannot fold after an All-In wager")
        return Settlement(-1, 0, -1)
    if all_in not in (1, 2, 3): raise ValueError("showdown requires a 1x, 2x, or 3x All-In")
    pr, dr = flush_rank(player_cards), flush_rank(dealer_cards)
    comparison = (pr > dr) - (pr < dr)
    if comparison == 0: return Settlement(0, 0, 0)
    if comparison < 0:
        # Rule 11 precedes the comparison rules: a non-qualifying dealer always
        # returns the Ante, even when the dealer's hand subsequently wins.
        return Settlement(-1 if dealer_qualifies(dealer_cards) else 0, -float(all_in), -1)
    ante = 1.0 if dealer_qualifies(dealer_cards) else 0.0
    xtra = XTRA_PAYTABLE.get(pr[0], 0.0)
    return Settlement(ante, float(all_in), xtra)
