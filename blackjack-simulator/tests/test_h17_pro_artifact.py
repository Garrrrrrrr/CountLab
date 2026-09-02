import json
import hashlib
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARTIFACT = ROOT / "results" / "h17-pro-coefficients.json"
TYPESCRIPT = ROOT.parent / "blackjack" / "lib" / "blackjack" / "h17ProCoefficients.ts"
SOURCE = ROOT / "h17_pro.py"


def normalized_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def test_published_h17_production_artifact_is_internally_consistent():
    payload = json.loads(ARTIFACT.read_text(encoding="utf-8"))
    metadata = payload["metadata"]

    # The JSON evidence and the TypeScript curve are generated together; this
    # prevents a policy-corrected simulator run from being published only on
    # one side of the application boundary.
    assert metadata["source_sha256"] == normalized_sha256(SOURCE)
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
