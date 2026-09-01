"""Rule set for Double Down Madness.

Sources for every field below:

* Wizard of Odds, https://wizardofodds.com/games/blackjack/double-down-madness/
* Canterbury Park posted rules, https://www.canterburypark.com/blackjack/double-down-madness/

The two sources disagree on exactly one point, the first-card Ace restriction,
which is the crux of the Reddit thread this project reviews.  Wizard restricts
only the double ("If the player doubles with only an ace, he shall get one
additional card only"); the casino's posted rules restrict both ("When your
initial starting card is an Ace, you will only receive one card regardless of a
hit or double").  ``ace_rule`` selects between them; the casino text is the
default because it is the rule actually dealt at the table.
"""

from __future__ import annotations

from dataclasses import dataclass

ACE_RULES = ("strict", "double_only")
BJ_VERSIONS = (1, 2, 3)

# Suited/unsuited blackjack payouts by configurable version.
BJ_PAYOUTS = {
    1: (2.0, 1.5),   # New York New York
    2: (1.5, 1.5),
    3: (3.0, 1.0),
}

# An ace pairs with 16 ten-value cards per deck, 4 of which share its suit, so a
# blackjack is suited exactly 1/4 of the time regardless of shoe depletion.
P_SUITED_GIVEN_BLACKJACK = 0.25


@dataclass(frozen=True)
class DDMRules:
    decks: int = 6
    dealer_hits_soft17: bool = True
    # "strict": any first-card Ace draws exactly one more card, hit or double.
    # "double_only": only the double is restricted; hitting continues normally.
    ace_rule: str = "strict"
    bj_version: int = 1
    dealer_22_push: bool = True
    peek: bool = True
    offer_insurance: bool = True
    # 0 means unlimited re-doubling; a positive value caps it (table maximum).
    max_doubles: int = 0
    # Canterbury allows doubling for less. EV is linear in the added stake so a
    # partial double is never EV-optimal, but it matters for variance.
    double_fraction: float = 1.0

    def __post_init__(self) -> None:
        if self.ace_rule not in ACE_RULES:
            raise ValueError("ace_rule must be one of %r" % (ACE_RULES,))
        if self.bj_version not in BJ_VERSIONS:
            raise ValueError("bj_version must be one of %r" % (BJ_VERSIONS,))
        if self.decks < 1:
            raise ValueError("decks must be >= 1")
        if not 0.0 <= self.double_fraction <= 1.0:
            raise ValueError("double_fraction must be in [0, 1]")

    @property
    def bj_multiplier(self) -> float:
        """Expected blackjack payout per unit staked, blending suited/unsuited.

        Versions 2 and 3 both come to 1.5, which is why Wizard reports an
        identical 2.07% house edge for them -- a free check on this blend.
        """
        suited, unsuited = BJ_PAYOUTS[self.bj_version]
        p = P_SUITED_GIVEN_BLACKJACK
        return p * suited + (1.0 - p) * unsuited

    @property
    def double_multiplier(self) -> float:
        """Total wager multiplier applied by one double."""
        return 1.0 + self.double_fraction

    def describe(self) -> str:
        return (
            "DDM v%d, %d decks, %s, ace_rule=%s, dealer22=%s, BJ pays %.4gx"
            % (
                self.bj_version,
                self.decks,
                "H17" if self.dealer_hits_soft17 else "S17",
                self.ace_rule,
                "push" if self.dealer_22_push else "lose",
                self.bj_multiplier,
            )
        )
