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

The source of download configuration is the root-level `release-metadata.json` (`config.js` and page tokens are build artifacts — do not edit them by hand). CI builds resolve the main desktop release and the separately pinned RN mobile release from GitHub. Offline previews use local snapshots; visitors do not query GitHub. The desktop snapshot remains planned until the main release is available. A client release does not automatically trigger this repository's Pages deployment.

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

Desktop downloads follow the main latest release. `mobile_release` independently pins the RN mobile tag, version and source SHA, currently `v0.2.1`; future `rn-vX.Y.Z` tags are also supported. Online builds verify that release's APK and metadata. Mobile cards retain their own version and RN label when the desktop release has no APK. An explicit metadata file may include `mobile_release`; otherwise the pinned local mobile snapshot is used.

iOS reads the channel from metadata attached to that RN release, requiring version/tag/source_sha to match; only explicitly released TestFlight or App Store URLs are accepted. Plain IPA downloads are not offered. When no channel exists or the URL is invalid, a build guide is shown instead. Local desktop snapshots remain planned until the main release is available; an old RN desktop package is never used as the main release.

Channel entries belong under `mobile_release.platforms`. Example iOS entry: `"ios": {"status": "released", "channel": "testflight", "url": "https://testflight.apple.com/join/AbCd1234"}` (example URL, not for production). The Android APK currently belongs to RN `v0.2.1`, not the main desktop version's asset directory. Set released only after confirming the channel is open.

Client releases do not automatically trigger this repository's Pages; trigger the website build and deploy separately.
