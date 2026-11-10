# /// script
# requires-python = ">=3.11"
# dependencies = ["beautifulsoup4>=4.13,<5", "icalendar>=6,<7", "python-dateutil>=2.9,<3"]
# ///
"""Offline end-to-end feed tests: date spans, recurrence and cache isolation."""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import runpy
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/nassau-collect.py"
FEED = """BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:pickup-span
DTSTART;TZID=America/New_York:20261112T100000
DTEND;TZID=America/New_York:20261116T180000
SUMMARY:Baby Bundles
DESCRIPTION:Pick up a take-home kit.
URL:https://example.libcal.com/event/1
END:VEVENT
BEGIN:VEVENT
UID:weekly-story
DTSTART;TZID=America/New_York:20261031T103000
DTEND;TZID=America/New_York:20261031T110000
RRULE:FREQ=WEEKLY;COUNT=5
SUMMARY:Storytime
URL:https://example.libcal.com/event/2
END:VEVENT
END:VCALENDAR
"""


class CollectorTests(unittest.TestCase):
    def seed(self, directory):
        library = {"id": "example", "name": "Example Library", "url": "https://example.libcal.com/",
                   "address": "Example address", "city": "Example", "calendars": [{"url": "https://example.libcal.com/calendar?cid=1"}]}
        (directory / "discovery.json").write_text(json.dumps({"libraries": [library], "directoryEntries": 1}))
        url = "https://example.libcal.com/ical_subscribe.php?src=p&cid=1"
        path = directory / ("http_" + hashlib.sha256(url.encode()).hexdigest()[:18] + ".txt")
        path.write_text(FEED)
        path.with_suffix(".status.json").write_text(json.dumps({"url": url, "checkedOn": "2026-11-10", "status": 200}))
        return path

    def collect(self, directory, start="2026-11-10", end="2026-11-23"):
        with patch.object(sys, "argv", [str(SCRIPT), str(directory), "--start", start, "--end", end]), \
             patch("urllib.request.urlopen", side_effect=AssertionError("Offline fixture must not use network")), \
             contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            runpy.run_path(str(SCRIPT), run_name="__main__")
        return json.loads((directory / "library_collection.json").read_text())

    def test_multi_day_pickup_remains_a_span_and_recurrence_uses_local_time(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary); self.seed(directory)
            data = self.collect(directory)
            self.assertEqual(data["completedLibraries"], 1)
            pickup = next(r for r in data["records"] if r["rawUID"] == "pickup-span")
            self.assertTrue(pickup["multiDay"])
            self.assertEqual((pickup["date"], pickup["endDate"]), ("2026-11-12", "2026-11-16"))
            weekly = [r for r in data["records"] if r["rawUID"] == "weekly-story"]
            self.assertEqual([r["date"] for r in weekly], ["2026-11-14", "2026-11-21"])
            self.assertTrue(all(r["start"] == "10:30" and r["end"] == "11:00" and not r["multiDay"] for r in weekly))
            with self.assertRaises(SystemExit):
                self.collect(directory, "2026-11-11", "2026-11-24")

    def test_stale_response_is_a_failure_not_fresh_evidence(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary); path = self.seed(directory)
            evidence = json.loads(path.with_suffix(".status.json").read_text())
            evidence["checkedOn"] = "2026-11-03"
            path.with_suffix(".status.json").write_text(json.dumps(evidence))
            data = self.collect(directory)
            self.assertEqual(data["completedLibraries"], 0)
            self.assertEqual(data["records"], [])
            self.assertIn("not verified for this run", data["libraries"][0]["error"])


if __name__ == "__main__":
    unittest.main()
