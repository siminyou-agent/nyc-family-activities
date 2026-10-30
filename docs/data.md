# Data format (schema v1)

`public/data/events.json` contains:

- `schemaVersion: 1`
- `edition`: stable ID, title, inclusive `start`/`end`, `verifiedOn`, `timezone: America/New_York`, `mode: manual | scheduled`, and scope.
- `venues`: objects keyed by venue ID, with public name, region, city, address, `[latitude, longitude]`, and optional Nassau `town`/`community`. Points are approximate, not entrance guarantees.
- `events`: stable slug ID, Chinese title/description/tip, `venueId`, category, setting, ages, price, booking, sessions, and official source evidence.
- `translations.en`: English edition metadata and event text keyed by the same IDs. Structured facts are not duplicated.

Each session uses a New York local `date`, `start`, and `end`. Sessions are sorted, unique, within the edition, and same-day; cross-midnight events need a future schema revision. `sourceUrl` links the individual occurrence where available. Availability is `unknown`, `open`, `closed`, `full`, or `waitlist`.

Age basis is `official`, `editorial`, or `unknown`; suggested ages are not entry restrictions. Free entry is distinct from included-with-admission and member benefits. Library-card and residency restrictions must stay visible. `scripts/contract.mjs` is the executable contract.

`sources.json` maps exact official hostnames to registered sources. Statuses are `partial`, `scanned` (all pages in the stated range, not universal coverage), `reviewed`, `limited`, and `pending`. Coverage audits record inclusions, exclusions, and gaps.

`npm run export` creates one CSV row per occurrence plus deterministic edition snapshots. `npm run export -- --check` verifies generated files without writing. CSV text is escaped against spreadsheet formula interpretation.

To prepare another reviewed edition:

```sh
npm run validate -- /path/to/candidate.json
npm run import -- /path/to/candidate.json
# Update the source registry and coverage audits for the same run as well.
npm run export
npm run validate
```

The import command updates local data only; it neither collects facts nor deploys. Archive IDs are write-once: corrections should use a new edition ID rather than silently replacing the old snapshot.
