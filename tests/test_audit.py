#!/usr/bin/env python3
"""Offline tests for audit.py — local HTML fixtures only, no network."""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import audit
import update

# ─── Local HTML fixtures (hand-made, no network) ───

STOCK_FULL_HTML = """
<html><body>
<div class="compInfo">
  <p>SM Investments Corporation</p>
</div>
<img src="/clogo/SM.png" alt="Logo" />
<span class="asof">As of Nov 11, 2026 03:20 PM</span>
<table>
<tr><th>Status</th><td>Trading</td></tr>
<tr><th>Last Traded Price</th><td>525.00</td></tr>
<tr><th>Previous Close and Date</th><td>520.00 (Nov 10, 2026)</td></tr>
<tr><th>Change(% Change)</th><td><span>up 5.00 (0.96%)</span></td></tr>
<tr><th>Open</th><td>521.00</td></tr>
<tr><th>High</th><td>526.50</td></tr>
<tr><th>Low</th><td>519.00</td></tr>
<tr><th>Volume</th><td>1,234,567&nbsp;</td></tr>
<tr><th>Value</th><td>648,645,675.00</td></tr>
<tr><th>Market Capitalization</th><td>633,000,000,000</td></tr>
</table>
</body></html>
"""

STOCK_SUSPENDED_HTML = """
<html><body>
<div class="compInfo">
  <p>SM Investments Corporation</p>
</div>
<span>As of Nov 11, 2026 03:20 PM</span>
<table>
<tr><th>Status</th><td>Suspended</td></tr>
<tr><th>Previous Close and Date</th><td>520.00 (Nov 10, 2026)</td></tr>
<tr><th>Volume</th><td>0</td></tr>
</table>
</body></html>
"""

STOCK_NO_PRICE_HTML = """
<html><body>
<div class="compInfo">
  <p>SM Investments Corporation</p>
</div>
<span>As of Nov 11, 2026 03:20 PM</span>
<table>
<tr><th>Status</th><td>Trading</td></tr>
<tr><th>Volume</th><td>1,234,567</td></tr>
</table>
</body></html>
"""

INDEX_FULL_HTML = """
<html><body>
<th colspan="4">As of Nov 11, 2026 03:20 PM</th>
<span>MARKET: OPEN</span>
<table>
<tr><td class="label">PSEi</td><td>7,456.78</td><td>12.34</td><td>▲0.17</td></tr>
<tr><td class="label">All Shares</td><td>3,456.78</td><td>5.67</td><td>▼0.16</td></tr>
</table>
<table>
<tr><td class="alignL">Total Value Turnover</td><td class="alignR">5,678,901,234.00</td></tr>
<tr><td class="alignL">Advances</td><td class="alignR">105</td></tr>
</table>
</body></html>
"""

INDEX_EMPTY_CHANGE_HTML = """
<html><body>
<th colspan="4">As of Nov 11, 2026 03:20 PM</th>
<span>MARKET: OPEN</span>
<table>
<tr><td class="label">PSEi</td><td>7,456.78</td><td></td><td></td></tr>
</table>
<table>
<tr><td class="alignL">Advances</td><td class="alignR">105</td></tr>
</table>
</body></html>
"""


def check_names(result):
    return {c["name"]: c for c in result["checks"]}


class TestStockHappyPath(unittest.TestCase):
    def test_fields_match_parse_exactly(self):
        parsed = update.parse(STOCK_FULL_HTML, "SM", "SM Investments Corporation")
        result = audit.audit_stock(STOCK_FULL_HTML, "SM", "SM Investments Corporation")
        for key, value in parsed.items():
            self.assertIn(key, result)
            self.assertEqual(result[key], value, f"field {key!r} diverges from parse()")

    def test_all_checks_pass(self):
        result = audit.audit_stock(STOCK_FULL_HTML, "SM", "SM Investments Corporation")
        failed = [c for c in result["checks"] if not c["passed"]]
        self.assertEqual(failed, [])

    def test_expected_values(self):
        result = audit.audit_stock(STOCK_FULL_HTML, "SM", "SM Investments Corporation")
        self.assertEqual(result["symbol"], "SM")
        self.assertEqual(result["name"], "SM Investments Corporation")
        self.assertEqual(result["as_of"], "Nov 11, 2026 03:20 PM")
        self.assertEqual(result["last_traded_price"], 525.0)
        self.assertEqual(result["previous_close"], 520.0)
        self.assertEqual(result["change"], "up")
        self.assertEqual(result["change_amount"], 5.0)
        self.assertEqual(result["change_pct"], 0.96)
        self.assertEqual(result["volume"], 1234567.0)  # commas + &nbsp; tolerated
        self.assertEqual(result["value"], 648645675.0)
        self.assertEqual(result["market_cap"], 633000000000.0)
        self.assertEqual(result["status"], "Trading")
        self.assertIsNone(result["note"])

    def test_json_serializable_no_nan(self):
        result = audit.audit_stock(STOCK_FULL_HTML, "SM", "SM Investments Corporation")
        json.dumps(result, allow_nan=False)


class TestIndexHappyPath(unittest.TestCase):
    def test_fields_match_parse_idx_exactly(self):
        parsed = update.parse_idx(INDEX_FULL_HTML)
        result = audit.audit_index(INDEX_FULL_HTML)
        for key, value in parsed.items():
            self.assertIn(key, result)
            self.assertEqual(result[key], value, f"field {key!r} diverges from parse_idx()")

    def test_all_checks_pass(self):
        result = audit.audit_index(INDEX_FULL_HTML)
        failed = [c for c in result["checks"] if not c["passed"]]
        self.assertEqual(failed, [])

    def test_expected_values(self):
        result = audit.audit_index(INDEX_FULL_HTML)
        self.assertEqual(result["market_status"], "OPEN")
        self.assertEqual(result["as_of"], "Nov 11, 2026 03:20 PM")
        self.assertEqual(len(result["indices"]), 2)
        self.assertEqual(result["indices"][0]["name"], "PSEi")
        self.assertEqual(result["indices"][0]["value"], 7456.78)
        self.assertEqual(result["indices"][0]["change"], 12.34)
        self.assertEqual(result["indices"][0]["change_pct"], 0.17)
        self.assertEqual(result["market_summary"]["Advances"], 105.0)


class TestNegativePath(unittest.TestCase):
    def test_missing_price_not_suspended(self):
        result = audit.audit_stock(STOCK_NO_PRICE_HTML, "SM", "SM Investments Corporation")
        self.assertIsNone(result["last_traded_price"])
        self.assertIsNone(result["note"])
        checks = check_names(result)
        self.assertFalse(checks["last_traded_price"]["passed"])
        self.assertIn("不可用", checks["last_traded_price"]["reason"])
        self.assertNotIn("suspended_fallback", checks)
        json.dumps(result, allow_nan=False)

    def test_change_unparsed_flagged(self):
        result = audit.audit_stock(STOCK_NO_PRICE_HTML, "SM", "SM Investments Corporation")
        self.assertIsNone(result["change"])
        self.assertIsNone(result["change_amount"])
        self.assertIsNone(result["change_pct"])
        checks = check_names(result)
        self.assertFalse(checks["change_parsed"]["passed"])
        self.assertTrue(checks["change_parsed"]["reason"])

    def test_wrong_page_no_exception(self):
        result = audit.audit_stock("<html><body>404 not found</body></html>",
                                   "SM", "SM Investments Corporation")
        self.assertFalse(check_names(result)["page_recognized"]["passed"])
        self.assertIsNone(result["last_traded_price"])
        json.dumps(result, allow_nan=False)


class TestEdgeCases(unittest.TestCase):
    def test_suspended_fallback(self):
        result = audit.audit_stock(STOCK_SUSPENDED_HTML, "SM", "SM Investments Corporation")
        self.assertEqual(result["last_traded_price"], 520.0)
        self.assertEqual(result["previous_close"], 520.0)
        self.assertEqual(result["note"], "Suspended — showing previous close")
        checks = check_names(result)
        self.assertIn("suspended_fallback", checks)
        self.assertTrue(checks["suspended_fallback"]["passed"])
        self.assertIn("停牌回退到前收", checks["suspended_fallback"]["reason"])
        self.assertTrue(checks["last_traded_price"]["passed"])
        json.dumps(result, allow_nan=False)

    def test_empty_html_stock(self):
        result = audit.audit_stock("", "SM", "SM Investments Corporation")
        self.assertEqual(result["symbol"], "SM")
        self.assertIsNone(result["as_of"])
        self.assertIsNone(result["last_traded_price"])
        checks = check_names(result)
        self.assertFalse(checks["page_recognized"]["passed"])
        self.assertFalse(checks["as_of"]["passed"])
        self.assertIn("As of", checks["as_of"]["reason"])
        json.dumps(result, allow_nan=False)

    def test_empty_html_index(self):
        result = audit.audit_index("")
        self.assertIsNone(result["market_status"])
        self.assertIsNone(result["as_of"])
        self.assertEqual(result["indices"], [])
        self.assertEqual(result["market_summary"], {})
        self.assertFalse(check_names(result)["page_recognized"]["passed"])
        json.dumps(result, allow_nan=False)

    def test_index_empty_change_stays_none(self):
        result = audit.audit_index(INDEX_EMPTY_CHANGE_HTML)
        self.assertEqual(len(result["indices"]), 1)
        row = result["indices"][0]
        self.assertIsNone(row["change"])  # None, never 0
        self.assertNotEqual(row["change"], 0)
        self.assertIsNone(row["change_pct"])
        json.dumps(result, allow_nan=False)  # no NaN

    def test_input_html_not_mutated(self):
        html = STOCK_FULL_HTML
        audit.audit_stock(html, "SM", "SM Investments Corporation")
        audit.audit_index(INDEX_FULL_HTML)
        self.assertEqual(html, STOCK_FULL_HTML)


if __name__ == "__main__":
    unittest.main()
