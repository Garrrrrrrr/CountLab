"""Integration checks against the locally supplied, gitignored CBJN issue."""

from __future__ import annotations

import unittest
from pathlib import Path

from import_cbjn import parse_pdf


PDF = Path(__file__).resolve().parents[3] / "original_132.pdf"


@unittest.skipUnless(PDF.is_file(), "Private source PDF is not present")
class SuppliedIssueTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.result = parse_pdf(PDF)
        cls.rows = cls.result["rows"]

    def test_every_listing_page_reconciles(self) -> None:
        self.assertEqual(self.result["summary"]["warnings"], [])
        self.assertEqual(set(map(int, self.result["summary"]["by_page"])), set(range(3, 53)))
        self.assertEqual(len(self.rows), 1088)
        self.assertEqual(len({row["source_row_key"] for row in self.rows}), 1088)

    def test_known_rules_and_reporting_dates(self) -> None:
        alia = next(row for row in self.rows if row["source_row_key"] == "p03-y098")
        self.assertEqual(alia["normalized_location"]["name"], "Aliante")
        self.assertEqual(alia["normalized_game"]["decks"], 2)
        self.assertEqual(alia["normalized_game"]["decks_cut"], 0.7)
        self.assertEqual(alia["normalized_game"]["payout"], "3:2")
        self.assertEqual(alia["normalized_game"]["soft_17"], "H17")
        self.assertEqual(alia["normalized_game"]["dealer_procedure"], "hole_card_peek")
        self.assertEqual(alia["normalized_game"]["dealer_blackjack_wager_treatment"], "original_bets_only")
        self.assertEqual(alia["normalized_game"]["extra_rules"]["inferred_defaults"]["dealer_procedure"], "hole_card_peek")
        self.assertTrue(any(row["normalized_game"]["reported_month"] == "2025-08-01" for row in self.rows))
        self.assertTrue(any(row["normalized_game"]["dealer_blackjack_wager_treatment"] == "original_bets_only" for row in self.rows))

    def test_geography_and_private_drafts(self) -> None:
        self.assertEqual({row["normalized_location"]["country"] for row in self.rows}, {"US", "CA", "BS", "PR"})
        self.assertEqual(self.result["source"]["publication_clearance"], "private")
        self.assertTrue(all(row["normalized_location"]["publication_status"] == "draft" and row["normalized_game"]["publication_status"] == "draft" for row in self.rows))
        self.assertTrue(all(row["normalized_game"]["decks_cut"] <= row["normalized_game"]["decks"] for row in self.rows))


if __name__ == "__main__":
    unittest.main()
