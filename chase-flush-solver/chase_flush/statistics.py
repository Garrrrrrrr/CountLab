"""Mergeable, numerically stable-enough exact aggregates for integer payoffs."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from math import sqrt
from statistics import NormalDist


SUPPORTED_CONFIDENCE = (0.95, 0.99, 0.999, 0.9999)


@dataclass(slots=True)
class RunningMoments:
    """Online moments backed by exact Python integer sums.

    Chase the Flush terminal payoffs are integers.  Retaining sum and sum of
    squares as arbitrary-precision integers avoids cancellation and permits
    exact merging across workers and resumed runs, even at trillion scale.
    """
    count: int = 0
    total: int = 0
    total_squares: int = 0

    def update_aggregates(self, count: int, total: int, total_squares: int) -> None:
        if count < 0 or total_squares < 0:
            raise ValueError("invalid aggregate")
        self.count += int(count)
        self.total += int(total)
        self.total_squares += int(total_squares)

    def merge(self, other: "RunningMoments") -> None:
        self.update_aggregates(other.count, other.total, other.total_squares)

    @property
    def mean(self) -> float:
        return self.total / self.count if self.count else float("nan")

    @property
    def variance(self) -> float:
        if self.count < 2:
            return 0.0
        # Algebraically identical to sample variance.  The integer numerator is
        # evaluated exactly before its final conversion to float.
        numerator = self.count * self.total_squares - self.total * self.total
        return numerator / (self.count * (self.count - 1))

    @property
    def standard_error(self) -> float:
        return sqrt(self.variance / self.count) if self.count else float("inf")

    def interval(self, confidence: float) -> tuple[float, float]:
        if not 0 < confidence < 1:
            raise ValueError("confidence must be between zero and one")
        z = NormalDist().inv_cdf((1 + confidence) / 2)
        half = z * self.standard_error
        return self.mean - half, self.mean + half

    def half_width(self, confidence: float) -> float:
        low, high = self.interval(confidence)
        return (high - low) / 2

    def to_dict(self) -> dict[str, object]:
        result: dict[str, object] = asdict(self)
        result.update(mean=self.mean, variance=self.variance, standard_error=self.standard_error)
        for confidence in SUPPORTED_CONFIDENCE:
            label = f"ci{confidence * 100:g}".replace(".", "_")
            result[label] = list(self.interval(confidence))
        return result

    @classmethod
    def from_dict(cls, value: dict[str, object]) -> "RunningMoments":
        return cls(int(value["count"]), int(value["total"]), int(value["total_squares"]))


def decision_status(delta: RunningMoments, confidence: float, precision: float) -> str:
    if delta.count < 2 or delta.half_width(confidence) > precision:
        return "INCONCLUSIVE"
    low, high = delta.interval(confidence)
    if low > 0:
        return "ACTION_A_CONFIRMED"
    if high < 0:
        return "ACTION_B_CONFIRMED"
    return "INCONCLUSIVE"
