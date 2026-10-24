# Development and releases

## Structure

- `src/main.cjs`: isolated desktop bridge, local file access, lifecycle and permissions.
- `src/auth.cjs`: documented open-source SIWC flow, identity verification, encrypted sessions and token renewal.
- `src/storage.cjs`: atomic local writes and per-registration shelves.
- `src/backups.cjs`: version-change snapshots, recovery copies, portable exports and first-connection library continuity.
- `renderer/i18n.js` and `renderer/locales/`: English, Russian and French text; local keyword tag rules.
- `renderer/library-tools.js`: local note search, excerpts and automatic topic tags.
- `src/import.cjs`: local, reviewable text and ChatGPT JSON extraction.
- `src/catalog.cjs`: public catalogs, with no model or catalog API key.
- `src/inference.cjs`: complete SSE handling, bounded evidence, catalog discovery, grounded selection.
- `src/chat-bridge.cjs`: opt-in, account-pinned local socket / pipe, scoped context merges, backups and selection receipts.
- `agent/aftertaste.cjs`: dependency-free stdio MCP and command-line client, also packaged outside the ASAR for local assistants.
- `renderer/`: English-only desktop interface and bundled assets; no Node access or remote scripts.
- `site/`: static English download website. `npm run site` produces `site-dist/`.

## Check and build

Use Node.js 22 or newer. `npm ci` installs locked development dependencies. Run `npm test` and `npm run check`, then `npm start`. Build on the target OS with `npm run dist:mac`, `npm run dist:win`, or `npm run dist:linux`.

Release jobs build macOS arm64 / x64 ZIPs, a Windows x64 portable executable, and a Linux x64 AppImage. They collect checksums and attach artifacts to a public-preview release after all build jobs succeed. The first preview has no signing certificate, notarization, or automatic update channel.

Before tagging a release, inspect the tracked source and packaged ASAR. Do not copy a private checkout's Git history, runtime databases, `.openai` state, `.env` files, application-data folder, work notes, credentials, or personal fixtures. This repository starts from a fresh history and ships an empty library.

Automated checks cover OIDC security boundaries, actual loopback callbacks with synthetic credentials, rotating-token serialization, per-account isolation and restart persistence, import branch / author filtering, enabled-source controls, bounded model inputs, and terminal stream failures. A real interactive ChatGPT consent and recommendation check must be reported separately from synthetic protocol tests.

## External integration constraints

Do not substitute private ChatGPT backend endpoints, reuse another application's OAuth client ID, or read another application's credentials. Keep the issued dynamic client ID associated with its verified identity. Do not hard-code a model that may not be available to the user's account. Preserve `store: false` and `stream: true` and handle errors after partial output.

Catalog search is not access to every published work. The app discovers candidates dynamically from live catalogs, then ranks a bounded set. Metadata, cover availability, and provider rate limits vary.
