# Project operating notes

This is a public repository containing the production website and reviewed activity data.

- Keep private raw responses, staging, credentials, logs, machine paths, deployment identifiers, and personal information outside tracked content. `.gitignore` uses an allowlist; review before extending it.
- Run `npm run validate`, `npm test`, `npm run export`, `npm run check:public`, and `npm run build` before publishing. Use `npm run export -- --check` in CI.
- Preserve explicit source URLs, checked dates, uncertain availability, eligibility rules, and bilingual copy. Never relabel old events as a fresh collection.
- Historical assertions use `datasets/2026-10-24/`; current-data validation remains separate.
- Collectors produce candidates; they do not independently verify all facts or automatically approve publication. Read `docs/collection.md`.
- Keep original source-text rights and geocoder provenance. New coordinates must have redistributable provenance. Do not introduce results from a restricted geocoder.
- Production must be built from an exact clean commit already pushed to the canonical remote. The operator verifies both production mounts after deploying.
