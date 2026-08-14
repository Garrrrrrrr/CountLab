from dataclasses import asdict
from .monte_carlo import Summary

def edge_metrics(summary: Summary) -> dict[str, float | list[float]]:
    """Keep denominators explicit so Ante edge and element of risk cannot mix."""
    data = asdict(summary)
    data["edge_vs_ante"] = summary.mean
    data["edge_vs_initial_two_units"] = summary.mean / 2
    data["edge_vs_average_total_wager"] = summary.mean / summary.average_wager
    data["ci95"] = list(summary.ci95)
    return data
