# Clarora Website

The Chinese project website for the Clarora client. Pure HTML, CSS, and JavaScript — no third-party runtime dependencies, backend, or analytics tracking.

## Local Preview

Requires Node.js 24:

```sh
npm run dev
```

Open http://127.0.0.1:4173. Use `PORT=4174 npm run dev` to change the port.

## Build & Deploy

```sh
npm run check
npm run build
```

Deploy the `dist/` directory to any static hosting platform. Assets use relative paths and support sub-path deployment. No SPA routing fallback needed. `dist/` is not committed to the repository.

## GitHub Pages

Site URL: <https://a49a.github.io/clarora-web/> (accessible after the first successful deploy).

First-time setup:

1. Open the repository **Settings → Pages**.
2. Under **Build and deployment → Source**, select **GitHub Actions**.
3. Go to **Actions → Deploy GitHub Pages → Run workflow**, select `master` and run; if the first deployment fails after the initial push, you can re-run it after enabling Pages.

Subsequent pushes to `master` or `main` automatically check, build, and deploy. The workflow only uploads site files from `dist/` — it does not publish dev scripts or repository docs; no separate `gh-pages` branch or personal access token is needed.

See [pages.yml](.github/workflows/pages.yml) for the deployment pipeline, and the [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) for configuration reference.

## Updating Download Entries

The sole source of download info is the root-level `release-metadata.json` (`config.js` and page tokens are build artifacts — do not edit them by hand). CI builds fetch the latest version from the GitHub Releases API and merge it into this metadata; local builds without network access use the local file directly. Publishing a new release typically requires no changes to this repository — the deploy workflow automatically picks up the new version number, fixed download links, and source SHA.

Local development preview uses the exact same rendering pipeline as deployment:

```sh
npm run dev        # builds dist/ first, then serves http://127.0.0.1:4173
```

To pin a specific version's metadata (e.g., consuming the `release-metadata.json` shipped with a client Release — same schema):

```sh
CLARORA_RELEASE_METADATA=/path/to/release-metadata.json npm run build
```

The `repository` field points to the client source repository. Unreleased platforms remain `planned` and the page provides build guides.

## Page Content

- Client feature introductions: flashcards, listening, AI, focus tools, and local materials.
- Interactive demos: card flip, favorites, subtitle progress (no audio), and preset AI Q&A.
- Four-platform status with build guides, command copy, and data & sync FAQ.

Feature demos do not send AI requests or persist learning data. Main content remains readable with JavaScript disabled. Release status is maintained via configuration, not queried from GitHub at runtime.

Copy is based on the Clarora client README and platform/sync documentation; when client capabilities change, update the website in sync to avoid describing source code support as completed installer or device acceptance.

## Mobile Release Metadata

Android shows a download based on whether the latest Release includes `Clarora-android.apk`, even if the local status is still planned. iOS reads the channel from the `release-metadata.json` attached to that Release, requiring version/tag/source_sha to match; only explicitly released TestFlight or App Store URLs are accepted — plain IPA downloads are not offered. When no channel exists or the URL is invalid, a build guide is shown instead.

Example iOS entry for an explicit metadata file: `"ios": {"status": "released", "channel": "testflight", "url": "https://testflight.apple.com/join/AbCd1234"}` (example URL, not for production). Android example: `"android": {"status": "released", "asset_name": "Clarora-android.apk", "url": "https://github.com/a49a/clarora/releases/download/v0.1.0/Clarora-android.apk"}`. Set released only after confirming the channel is open.

Client releases do not automatically trigger this repository's Pages; trigger the website build and deploy separately.
