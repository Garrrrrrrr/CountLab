"""Extract CBJN casino/game candidates into a private review JSON file.

This script never writes to Supabase or publishes the source. Install PyMuPDF
(`python -m pip install pymupdf`) and run from the repository root:

    python blackjack/scripts/directory/import_cbjn.py original_132.pdf \
      --out tmp/directory/cbjn-2026-09-staging.json

The PDF's columns are positioned text; splitting plain extracted text by
whitespace misassigns casino names, especially on pages 3-7 and 35-40.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import pymupdf


PARSER_VERSION = "1.0.0"
MONTH_RE = re.compile(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(20\d{2})\b")
NUMBER_RE = re.compile(r"^\$?\d+(?:[.,]\d+)?$")
LOCALITY_RE = re.compile(r"^(?P<province>[A-Z]{2}):\s*(?P<city>.+?)\s*$")
KNOWN_RULES = {
    "ddd", "ds", "dsa", "d3", "d8", "d9", "d10", "enhc", "esxa", "es10",
    "hide", "h17", "ls", "lsxa", "min", "nhsa", "ni", "nm", "nmm", "nmo",
    "nms", "notch", "nrs", "nsa", "nso", "nsjq", "ns10", "nto", "pv",
    "rsa", "rsa3", "rs3", "sc", "shoe", "spanish", "s17", "toke", "ur",
    "uria", "1spot", "winnipeg",
}


@dataclass(frozen=True)
class Span:
    x: float
    y: float
    text: str
    bold: bool


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\ufffd", "'").replace("\u2019", "'")).strip()


def page_lines(page: pymupdf.Page) -> list[list[Span]]:
    rows: dict[int, list[Span]] = defaultdict(list)
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for raw in line.get("spans", []):
                value = clean(raw["text"])
                if not value:
                    continue
                x, y = raw["bbox"][:2]
                rows[round(y)].append(Span(x, y, value, "Bold" in raw["font"]))
    return [sorted(spans, key=lambda item: item.x) for _, spans in sorted(rows.items())]


def columns(lines: list[list[Span]]) -> dict[str, float]:
    for row in lines[:8]:
        labels = {item.text.lower(): item.x for item in row}
        if {"casino", "tables", "edge", "decks", "cut", "min", "max", "rules"} <= labels.keys():
            return labels
    raise ValueError("Could not find expected column headings")


def cell(row: list[Span], left: float, right: float = float("inf")) -> str:
    return clean(" ".join(item.text for item in row if left <= item.x < right))


def parse_month(text: str) -> str | None:
    match = MONTH_RE.search(text)
    if not match:
        return None
    month = datetime.strptime(match.group(1), "%b").month
    return f"{match.group(2)}-{month:02d}-01"


def number(text: str) -> int | float | None:
    value = text.replace(",", "").replace("$", "").strip()
    if not NUMBER_RE.fullmatch(value):
        return None
    result = float(value)
    return int(result) if result.is_integer() else result


def region_for_page(page_number: int, locality: str | None) -> tuple[str, str | None]:
    if page_number <= 7:
        return "Las Vegas", "US"
    if page_number <= 22:
        return "USA West", "US"
    if page_number <= 34:
        return "USA Midwest", "US"
    if page_number <= 40:
        if locality and locality.startswith("BS:"):
            return "Bahamas", "BS"
        if locality and locality.startswith("PR:"):
            return "Puerto Rico", "PR"
        return "USA South / Bahamas", "US"
    if page_number <= 47:
        return "USA East", "US"
    return "Canada", "CA"


def location_name(heading: str) -> str:
    # Most bold headings are "Casino (operator), address". Keep the full raw
    # heading in staging because some exceptions need human resolution.
    candidate = re.split(r"\s+\([^)]+\)|,\s+(?=\d|[A-Z]\.)", heading, maxsplit=1)[0]
    candidate = re.split(r",\s+(?:near|off|at|on|next to)\b", candidate, maxsplit=1, flags=re.IGNORECASE)[0]
    return clean(candidate.rstrip(".,"))


def location_address(heading: str) -> str | None:
    match = re.search(r"(?:\),|,)\s*((?:\d+|I-\d+|Highway\s+\d+).+)$", heading)
    return clean(match.group(1)) if match else None


def location_geo(locality: str | None, page_number: int) -> dict[str, Any]:
    region, country = region_for_page(page_number, locality)
    province = None
    city = None
    if page_number <= 7:
        province, city = "NV", "Las Vegas"
    elif locality:
        match = LOCALITY_RE.match(locality)
        if match:
            province = match.group("province")
            city = match.group("city")
            if city.startswith("Tahoe, South ("):
                city = "Tahoe, South (Stateline)"
            if province in {"BS", "PR"}:
                province = None
        else:
            city = locality
    if country == "US" and province == "ON":
        country = "CA"
    return {"country": country, "subdivision": province, "city": city, "region": region}


def game_rules(raw: str, country: str | None, province: str | None) -> tuple[dict[str, Any], list[str]]:
    tokens = [part.strip() for part in raw.split(",") if part.strip()]
    normalized = {part.lower() for part in tokens}
    unknown = sorted(normalized - KNOWN_RULES)
    spanish = "spanish" in normalized
    surrender = "none"
    if "ls" in normalized:
        surrender = "late"
    if "lsxa" in normalized:
        surrender = "mixed"
    if "esxa" in normalized:
        surrender = "early_except_ace"
    if "es10" in normalized:
        surrender = "mixed"
    soft_17 = "H17" if "h17" in normalized else "S17" if "s17" in normalized else None
    if "enhc" in normalized:
        procedure = "no_hole_card"
        wager_treatment = "all_bets_lost"
    elif province == "AB" and country == "CA":
        procedure = "no_hole_card"
        wager_treatment = "original_bets_only"
    else:
        # CBJN's documented baseline assumes a conventional dealer peek and
        # one original wager lost to a dealer natural. Keep these inferred
        # values explicit so ordinary listings can be compared with the lab;
        # preserve the provenance in extra_rules.inferred_defaults.
        procedure = "hole_card_peek"
        wager_treatment = "original_bets_only"
    entry = "not_allowed" if normalized & {"nm", "nmm", "nms"} else "restricted" if normalized & {"min", "nmo"} else None
    return {
        "game_type": "spanish_21" if spanish else "blackjack",
        "payout": None if spanish else "3:2",
        "soft_17": soft_17,
        "double_after_split": "ds" in normalized,
        "double_rules": next((code for code in ("d3", "d8", "d9", "d10", "ddd") if code in normalized), "any_two"),
        "resplit_aces": bool(normalized & {"rsa", "rsa3", "uria"}),
        "surrender": surrender,
        "dealer_procedure": procedure,
        "dealer_blackjack_wager_treatment": wager_treatment,
        "mid_shoe_entry": entry,
        "dealing_method": "shoe" if "shoe" in normalized else None,
        "extra_rules": {
            "source_codes": tokens,
            "unknown_codes": unknown,
            "inferred_defaults": {
                "dealer_procedure": "hole_card_peek",
                "dealer_blackjack_wager_treatment": "original_bets_only",
            } if "enhc" not in normalized and not (province == "AB" and country == "CA") else {},
        },
    }, unknown


def parse_pdf(path: Path) -> dict[str, Any]:
    source_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    pdf = pymupdf.open(path)
    if len(pdf) < 54:
        raise ValueError(f"Expected CBJN layout of at least 54 pages; got {len(pdf)}")
    rows: list[dict[str, Any]] = []
    locations: dict[str, dict[str, Any]] = {}
    warnings: list[str] = []
    active: dict[str, Any] | None = None
    active_locality: str | None = None
    active_month = "2026-09-01"
    issue_updates = pdf[0].get_text() + "\n" + pdf[1].get_text().split("Notes for Lists of Casinos")[0]

    current_columns: dict[str, float] | None = None
    for page_index in range(2, 52):
        page_number = page_index + 1
        active_locality = None
        lines = page_lines(pdf[page_index])
        try:
            col = columns(lines)
            current_columns = col
        except ValueError:
            if current_columns is None:
                warnings.append(f"Page {page_number}: column headings not found and no prior layout")
                continue
            col = current_columns
        vegas = page_number <= 7
        expected_games = sum(
            number(cell(line, col["edge"], col["decks"])) is not None
            and number(cell(line, col["decks"], col["cut"])) is not None
            for line in lines
        )
        starting_games = len(rows)
        for line in lines:
            y = round(line[0].y)
            if y > 745:
                continue
            raw_line = clean(" ".join(part.text for part in line))
            if not raw_line or raw_line.startswith("Copyright"):
                continue
            locality = None if vegas else cell(line, col.get("location", -1), col["casino"] - 2)
            name_column = cell(line, col["casino"] - 2, col["tables"])
            tables_text = cell(line, col["tables"], col["edge"])
            edge_text = cell(line, col["edge"], col["decks"])
            decks_text = cell(line, col["decks"], col["cut"])
            cut_text = cell(line, col["cut"], col["min"] - 10)
            min_text = cell(line, col["min"] - 10, col["max"] - 10)
            max_text = cell(line, col["max"] - 10, col["rules"])
            rules_text = cell(line, col["rules"])
            month = parse_month(raw_line)
            bold_locality = not vegas and any(item.bold and item.x < col["casino"] - 3 and item.x >= col["location"] - 3 for item in line)
            bold_name_present = any(item.bold and col["casino"] - 4 <= item.x < col["tables"] for item in line)
            if bold_locality and locality and locality.lower() != "location":
                active_locality = locality
            if month:
                active_month = month
                if locality and not bold_name_present:
                    active_locality = locality
                # A bold casino heading may carry its own report month. A
                # region/city date heading cannot become a casino.
                if not bold_name_present:
                    continue
            game_like = number(edge_text) is not None and number(decks_text) is not None
            if game_like:
                issues: list[str] = []
                if active is None:
                    issues.append("Game row has no preceding casino heading")
                if not name_column:
                    issues.append("Game name is blank or clipped")
                if not rules_text:
                    issues.append("Rules are blank")
                loc = active or {
                    "name": name_column or "Unknown casino",
                    "raw_heading": name_column,
                    "raw_locality": active_locality,
                    "reported_month": active_month,
                    "source_page": page_number,
                    "notes": [],
                    **location_geo(active_locality, page_number),
                }
                if loc["name"] and name_column and not (name_column.lower().startswith(loc["name"][:8].lower()) or loc["name"].lower().startswith(name_column[:8].lower())):
                    issues.append("Printed game name does not clearly match heading")
                game_fields, unknown = game_rules(rules_text, loc.get("country"), loc.get("subdivision"))
                if unknown:
                    issues.append("Unknown rule codes: " + ", ".join(unknown))
                numeric = {
                    "table_count": number(tables_text),
                    "reported_house_edge_pct": number(edge_text),
                    "decks": number(decks_text),
                    "decks_cut": number(cut_text),
                    "min_bet": number(min_text),
                    "max_bet": number(max_text),
                }
                for key, value in numeric.items():
                    if value is None:
                        raw_field = {"table_count": tables_text, "reported_house_edge_pct": edge_text,
                                     "decks": decks_text, "decks_cut": cut_text,
                                     "min_bet": min_text, "max_bet": max_text}[key]
                        issues.append(f"Missing/invalid {key}: {raw_field}")
                if isinstance(numeric["decks"], (int, float)) and isinstance(numeric["decks_cut"], (int, float)) and numeric["decks_cut"] >= numeric["decks"]:
                    issues.append("Cut is greater than or equal to total decks")
                if not loc.get("reported_month"):
                    issues.append("Report month is missing")
                key = f"p{page_number:02d}-y{y:03d}"
                loc_key = f"p{loc['source_page']:02d}-y{loc.get('source_y', 0):03d}"
                normalized_location = {
                    "name": loc["name"], "country": loc["country"],
                    "subdivision": loc["subdivision"], "city": loc["city"],
                    "address": loc.get("address"), "coordinate_quality": "unknown",
                    "publication_status": "draft", "source_heading": loc["raw_heading"],
                    "source_notes": loc["notes"], "source_location_key": loc_key,
                }
                normalized_game = {
                    **numeric, **game_fields,
                    "currency": "CAD" if loc["country"] == "CA" else "USD" if loc["country"] in {"US", "PR"} else None,
                    "availability": "reported", "publication_status": "draft",
                    "reported_month": loc["reported_month"], "verified_at": None,
                }
                rows.append({
                    "source_row_key": key, "page_number": page_number,
                    "region": loc["region"], "raw_location": loc["raw_heading"],
                    "raw_game": {"line": raw_line, "casino": name_column, "tables": tables_text,
                                 "edge": edge_text, "decks": decks_text, "cut": cut_text,
                                 "min": min_text, "max": max_text, "rules": rules_text},
                    "normalized_location": normalized_location,
                    "normalized_game": normalized_game,
                    "validation_issues": issues, "decision": "pending",
                })
                locations.setdefault(loc_key, {**normalized_location, "reported_month": loc["reported_month"], "page_number": loc["source_page"]})
                continue

            # Bold text in the casino/name column introduces a venue. Some long
            # headings continue in a following row; these are flagged later.
            heading = clean(" ".join(item.text for item in line if item.bold and item.x >= col["casino"] - 3 and item.x < col["rules"]))
            if heading and not re.match(r"^(?:casino|location|tables|edge|decks|cut|min|max|rules)$", heading, re.I):
                # A heading can contain a bold location prefix as well; isolate
                # the text from the casino column only.
                bold_name = clean(" ".join(item.text for item in line if item.bold and col["casino"] - 4 <= item.x < col["tables"]))
                if bold_name and bold_name.lower() not in {"casino", "las vegas"} and not bold_name[0].islower():
                    heading = bold_name
                    # The locality often starts on the same row as the first
                    # casino in a group. Its label is not always bold, so the
                    # generic bold-locality check above can miss it and carry
                    # the column header ("Location") into the venue instead.
                    if (locality and re.match(r"^[A-Z]{2}:\s*[^:]+$", locality)
                            and len(locality) < 55
                            and (not active_locality or not active_locality.startswith(locality))):
                        active_locality = locality
                    geo = location_geo(active_locality, page_number)
                    active = {
                        "name": location_name(heading), "raw_heading": heading,
                        "address": location_address(heading),
                        "raw_locality": active_locality, "reported_month": active_month,
                        "source_page": page_number, "source_y": y, "notes": [], **geo,
                    }
                    continue
                if bold_name and bold_name[0].islower() and active:
                    active["raw_heading"] = clean(active["raw_heading"] + " " + bold_name)
                    continue
            if active and name_column and ":" in name_column and not month:
                active["notes"].append(name_column)

        if len(rows) - starting_games != expected_games:
            warnings.append(
                f"Page {page_number}: detected {expected_games} numeric game rows "
                f"but staged {len(rows) - starting_games}"
            )

    for loc in locations.values():
        if loc["name"] == "Unknown casino":
            warnings.append(f"Unmatched game at {loc['source_location_key']}")
    by_region = dict(sorted(Counter(row["region"] for row in rows).items()))
    by_page = dict(sorted(Counter(row["page_number"] for row in rows).items()))
    issues_count = sum(bool(row["validation_issues"]) for row in rows)
    return {
        "source": {"title": "Current Blackjack News", "source_type": "cbjn_pdf", "issue_month": "2026-09-01",
                   "file_sha256": source_hash, "parser_version": PARSER_VERSION,
                   "publication_clearance": "private", "source_file": path.name,
                   "page_count": len(pdf)},
        "summary": {"locations": len(locations), "game_rows": len(rows),
                    "rows_requiring_review": issues_count, "by_region": by_region,
                    "by_page": by_page, "warnings": warnings},
        "issue_updates_for_review": issue_updates,
        "locations": list(locations.values()), "rows": rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path, help="Local CBJN PDF")
    parser.add_argument("--out", type=Path, required=True, help="Private JSON staging output")
    args = parser.parse_args()
    result = parse_pdf(args.pdf)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result["summary"], indent=2))


if __name__ == "__main__":
    main()
