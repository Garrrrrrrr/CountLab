import hashlib
import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARTIFACT = ROOT / "results" / "coefficients.json"


def test_production_artifact_is_bound_to_generator_and_public_copy():
    payload = json.loads(ARTIFACT.read_text(encoding="utf-8"))
    source_hash = hashlib.sha256((ROOT / "simulate.py").read_bytes()).hexdigest()
    assert payload["metadata"]["source_sha256"] == source_hash
    public = ROOT.parent / "blackjack" / "public" / "data" / "blackjack-coefficients.json"
    assert public.read_bytes() == ARTIFACT.read_bytes()
    validation = json.loads((ROOT / "results" / "validation.json").read_text(encoding="utf-8"))
    assert validation["metadata"]["source_sha256"] == source_hash
    benchmark = validation["profiles"]["6-4.5"]
    assert benchmark["rounds"] == 4_351_969_160
    assert -0.0051 < benchmark["mean"] < -0.0048
    off_top = json.loads((ROOT / "results" / "off-top-validation.json").read_text(encoding="utf-8"))
    assert off_top["metadata"]["source_sha256"] == source_hash
    first_round = off_top["profiles"]["6-0.01"]
    assert first_round["rounds"] == 500_000_000
    assert first_round["ci95"][0] <= -0.00473 <= first_round["ci95"][1]


def test_production_aggregates_are_self_consistent():
    payload = json.loads(ARTIFACT.read_text(encoding="utf-8"))
    assert len(payload["profiles"]) == 9
    assert sum(profile["rounds"] for profile in payload["profiles"].values()) == 46_734_162_152
    for profile in payload["profiles"].values():
        rows = profile["rows"]
        assert len(rows) == 17
        assert sum(row["rounds"] for row in rows) == profile["rounds"]
        assert math.isclose(sum(row["frequency"] for row in rows), 1.0, abs_tol=1e-12)
        assert min(row["rounds"] for row in rows) >= 3_000_000
        for row in rows:
            assert math.isclose(row["advantage"], row["profit_sum"] / row["rounds"], abs_tol=1e-15)
            assert row["ci95"][0] <= row["advantage"] <= row["ci95"][1]
            assert row["standard_deviation"] > 1
