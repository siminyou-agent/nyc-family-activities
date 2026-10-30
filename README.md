# NYC Family Activities

An open-source, bilingual activity finder for New York City's five boroughs and Nassau County. Browse a compact list or map, with filters for date, area, age, cost, venue type, and official source.

**[Website](https://nyc-family-weekend.pages.dev/)** · **[Current JSON](public/data/events.json)** · **[CSV](public/data/sessions.csv)** · **[Edition archives](datasets/)**

For agents: [llms.txt](https://nyc-family-weekend.pages.dev/llms.txt) lists data endpoints, schema guidance, freshness checks, and attribution. `/llm.txt` is an identical compatibility alias generated at build time. Both also work beneath an existing subdirectory mount.

## Run locally

Requires Node.js 22 or later.

```sh
npm ci
npm run validate
npm test
npm run build
npm start
```

Open http://127.0.0.1:4317. The build output in `dist/` works on static hosting, including under a URL subdirectory. No account, API key, database, or server is needed to use the website. Map tiles come from OpenStreetMap; Leaflet is bundled locally.

## Open data

The initial published edition covers **October 24–November 1, 2026**, with **534 activities, 672 sessions, and 232 venues**. Collection coverage is incomplete and varies by organizer. The dataset is an edition, not a live inventory of registration availability.

- `public/data/events.json`: schema v1; activities, occurrences, public venues, English/Chinese copy, and official provenance.
- `public/data/sessions.csv`: one row per occurrence, UTF-8, with bilingual titles and official links.
- `public/data/sources.json`: source registry, actual review dates, and known limitations.
- `public/data/*_coverage.json`: collection audits.
- `public/data/geocodes.json`: replacement Nassau coordinate provenance (US Census / OpenStreetMap).
- `datasets/<edition-id>/`: versioned reviewed snapshots of the public data.

See [data format](docs/data.md), [collection](docs/collection.md), and [data licensing](DATA_LICENSE.md). Venue coordinates are approximate; check the organizer's directions for the entrance.

## Updates and publication

The intended schedule is Tuesday at 08:00 America/New_York, covering the next 14 days. Collection currently uses an operator-run, agent-assisted process. The first scheduled refresh on October 27 was blocked by collection-service and source-access failures; the previous reviewed edition was retained. A schedule is not a guarantee of a fresh edition.

This repository is the canonical source for website code and reviewed data. The release sequence is: collect into private staging → review sources and facts → validate/export/test → privacy review → commit and push to `main` → build and deploy that exact clean commit → verify the live artifacts. Partial candidates are not published over a successful edition.

CI checks data, public-file boundaries, tests, and the build. Deployment to the existing Cloudflare Pages project is operator-run from a clean repository checkout; credentials stay outside Git. See [deployment](DEPLOY.md).

## Contribute

Issues and pull requests are welcome for incorrect facts, missing official sources, adapters, and interface improvements. Include the organizer's public URL and the applicable date. Do not submit attendee information, private correspondence, credentials, or personal itineraries. Source-access restrictions and cancellations must remain explicit; unknown availability does not mean open registration.

## License and credits

Code: [MIT](LICENSE). Structured database: [ODbL 1.0](DATA_LICENSE.md), including OpenStreetMap-derived coordinates; project-authored summaries and translations: CC BY 4.0. Third-party source text retains its original rights. Attribute **NYC Family Activities**, link this repository and the original event sources, and retain OpenStreetMap attribution.

Interface inspiration: [Bay Area Family Activities](https://ranchen.org/weekend). See [third-party notices](THIRD_PARTY_NOTICES.md).
