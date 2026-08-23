import hashlib
import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARTIFACT = ROOT / "results" / "ap-toolbox-h17-pro-coefficients.json"
GENERATOR = ROOT / "ap_toolbox_h17.py"
TYPESCRIPT = ROOT.parent / "blackjack" / "lib" / "blackjack" / "apToolboxH17ProCoefficients.ts"


def normalized_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def test_h17_production_artifact_matches_the_corrected_generator():
    payload = json.loads(ARTIFACT.read_text(encoding="utf-8"))
    metadata = payload["metadata"]
    source_hash = normalized_sha256(GENERATOR)

    assert metadata["source_sha256"] == source_hash
    assert f'sourceSha256: "{source_hash}"' in TYPESCRIPT.read_text(encoding="utf-8")
    assert metadata["requested_shoes_per_configuration"] == 250_000_000
    assert len(payload["profiles"]) == 9

    for profile in payload["profiles"].values():
        assert profile["shoes"] == 250_000_000
        assert len(profile["rows"]) == 17
        assert sum(row["rounds"] for row in profile["rows"]) == profile["rounds"]
        assert math.isclose(sum(row["frequency"] for row in profile["rows"]), 1.0, abs_tol=1e-12)
        for row in profile["rows"]:
            assert row["ci95"][0] <= row["advantage"] <= row["ci95"][1]
