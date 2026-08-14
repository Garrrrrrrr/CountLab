from dataclasses import dataclass
from .cards import Card

@dataclass(frozen=True, slots=True)
class InformationState:
    player: tuple[Card, Card, Card]
    board: tuple[Card, ...] = ()
    dealer_visible: Card | None = None

    def __post_init__(self) -> None:
        if len(self.player) != 3: raise ValueError("player needs exactly 3 cards")
        if len(self.board) not in (0, 2, 4): raise ValueError("board must contain 0, 2, or 4 cards")
        visible = self.player + self.board + (() if self.dealer_visible is None else (self.dealer_visible,))
        if len(set(visible)) != len(visible): raise ValueError("duplicate visible card")

    @property
    def stage(self) -> int: return {0: 1, 2: 2, 4: 3}[len(self.board)]
    @property
    def visible(self) -> tuple[Card, ...]:
        return self.player + self.board + (() if self.dealer_visible is None else (self.dealer_visible,))

@dataclass(frozen=True, slots=True)
class ActualState:
    player: tuple[Card, Card, Card]
    dealer: tuple[Card, Card, Card]
    board: tuple[Card, Card, Card, Card]
    dealer_visible_index: int = 0

    def __post_init__(self) -> None:
        cards = self.player + self.dealer + self.board
        if len(set(cards)) != 10: raise ValueError("deal must contain 10 unique cards")

    def information(self, board_count: int, expose: bool = True) -> InformationState:
        return InformationState(self.player, self.board[:board_count], self.dealer[self.dealer_visible_index] if expose else None)
