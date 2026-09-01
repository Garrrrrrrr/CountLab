import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARTIFACT = ROOT / "results" / "h17-pro-coefficients.json"
TYPESCRIPT = ROOT.parent / "blackjack" / "lib" / "blackjack" / "h17ProCoefficients.ts"


def test_published_h17_production_artifact_is_internally_consistent():
    payload = json.loads(ARTIFACT.read_text(encoding="utf-8"))
    metadata = payload["metadata"]

    # A policy correction can legitimately be regenerating for days. Until its
    # replacement artifact lands, the checked-in JSON and TypeScript export
    # must continue to identify the same prior audited run.
    assert f'sourceSha256: "{metadata["source_sha256"]}"' in TYPESCRIPT.read_text(encoding="utf-8")
    assert metadata["requested_shoes_per_configuration"] == 250_000_000
    assert len(payload["profiles"]) == 9

    for profile in payload["profiles"].values():
        assert profile["shoes"] == 250_000_000
        assert len(profile["rows"]) == 17
        assert sum(row["rounds"] for row in profile["rows"]) == profile["rounds"]
        assert math.isclose(sum(row["frequency"] for row in profile["rows"]), 1.0, abs_tol=1e-12)
        for row in profile["rows"]:
            assert row["ci95"][0] <= row["advantage"] <= row["ci95"][1]
