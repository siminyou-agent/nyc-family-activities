# Collection and review

Collection is currently operator/agent-assisted. The repository includes reusable extraction helpers, not a guaranteed unattended end-to-end crawler. Raw pages, account responses, agent transcripts, and incomplete candidates belong in ignored local directories.

## Included adapters

- `nassau-discover.py DIRECTORY`: discover member libraries and calendar links from the official Nassau Library System directory. Create a fresh DIRECTORY first.
- `uv run scripts/nassau-collect.py DIRECTORY --start YYYY-MM-DD --end YYYY-MM-DD`: parse LibCal ICS, LibraryCalendar daily feeds, and Assabet JSON-LD. `uv` installs the inline Python dependencies. Optional supplemental discovery results can be supplied as `details_discovery.json` (`{"data":{"results":[]}}` shape); they are not required.
- `python3 scripts/nassau-supplement.py DIRECTORY --start YYYY-MM-DD --end YYYY-MM-DD`: paginate the NLS showcase for cross-checking only; it is not a complete county calendar.
- `node scripts/nypl.mjs OFFICIAL_EVENT_URL --start YYYY-MM-DD --end YYYY-MM-DD`: extract confirmed occurrences from public NYPL Apollo state. Challenge/blocked pages are failures, not empty calendars.
- `parks-crawl.mjs`: parse/index cached Markdown extraction responses, cross-check category pagination, and prepare detail review. `index DIRECTORY START END` takes explicit dates. For `details`, configure a compatible extraction CLI with `EXTRACT_COMMAND`; it receives `extract URL... --output FILE`. No private tool installation is assumed.
- `geocode-census.mjs`: independently query Census for Nassau addresses into ignored staging. Review matches before applying. Street interpolation may be inaccurate or match a similarly named road. OpenStreetMap fallbacks require attribution and ODbL compliance.

## Release requirements

1. Collect official calendars across the real run window; reconcile pagination and refresh previously limited sources. Do not reuse historical verification dates as new evidence.
2. Review child/family suitability, duplicates, dated occurrences, exact venues, prices, age guidance, booking, and residency/card rules. Do not infer free admission from a library location or open signup from an unknown status.
3. Write bilingual candidates and actual source/coverage limitations. Incomplete major sources can block publication; retain the previous successful edition rather than publish a misleading replacement.
4. Validate the contract, inspect changed facts, export snapshots, run privacy checks and tests, and review both language layouts.
5. Commit and push reviewed artifacts, deploy the exact clean commit, then verify live content and release hashes.

The intended weekly window is actual New York run date through +13 days, inclusive. API credentials, source-access restrictions, paid quotas, and operator scheduling are deployment-specific. Historical regression tests use the archived first edition rather than requiring future editions to have its counts or Halloween events.
