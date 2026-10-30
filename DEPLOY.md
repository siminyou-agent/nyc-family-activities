# Build and publish

The canonical repository is https://github.com/siminyou-agent/nyc-family-activities . Production is hosted at https://nyc-family-weekend.pages.dev/ .

## Validate a candidate

```sh
npm ci
npm run validate
npm test
npm run export
npm run check:public
npm run build
```

Preview with `npm start`. Browser checks use Playwright:

```sh
npx playwright install chromium
npm run test:browser
# Or set CHROME_PATH to an installed Chromium/Chrome executable.
```

Review the exact staged diff and all new files before committing. Never stage credentials or private collection records. The initial repository has no imported workspace history.

## Production

1. Commit reviewed source, data, and edition snapshots; push to `main`.
2. Verify a clean checkout and remote commit, then rebuild from that commit.
3. Supply `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` through the operator's secret manager/environment, never through tracked files.
4. Run the release command with `gh` authenticated. It requires `main`, a clean checkout, the same commit already on GitHub, successful hosted CI, and passing local checks; it deploys only `dist/` and verifies the result:

```sh
npm run publish:site
```

5. The command verifies the entry, GitHub link, `data/release.json`, all public data hashes, and browser behavior. To verify additional existing mounts, pass a comma-separated `VERIFY_BASES` environment variable. Set `CHROME_PATH` if using an installed browser. Existing operator-owned mounts must return the same artifacts.

The build writes `data/release.json` with the source commit and hashes. Deployment is operator-run, not automatically triggered by CI. A failed deployment can leave a reviewed commit ahead of production; the live release manifest identifies what is actually serving. Roll back by building and deploying a previous reviewed commit, not by changing edition dates.

Private mount/proxy configuration and operator-specific secret-manager commands are kept outside the public repository.
