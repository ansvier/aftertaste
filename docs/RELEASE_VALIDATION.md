# Release validation — 0.3.2 public preview

## 0.3.2 changes

Seven new automated catalog checks cover language preferences without an English-only filter, translated-title resolution during a Google Books rate limit, merged work identifiers, translated author lookup, empty-versus-unavailable results, cooldown behavior, equivalent-record deduplication, and rejection of unsafe identifiers / redirect loops. The full suite contains 31 tests.

Live public-catalog checks reproduced the original failure: Open Library returned zero direct matches for the reported Russian title, while Google Books returned HTTP 429. The new lookup resolved that title through Wikidata and loaded the canonical William Golding work and its cover from Open Library. Additional Russian and French queries returned catalog results. In an isolated macOS library, the exact reported query returned the novel, its author, publication year and canonical catalog link in the normal Add dialog. Selecting the result and saving it created the correct book entry. A separate transient service failure displayed the new availability message instead of a false empty result. These are external-service checks, not guarantees of catalog availability or metadata accuracy.


## 0.3.1 changes

The suite has 24 automated tests. New coverage checks supported YouTube link forms, exact allowed hosts, HTTPS, video-ID validation, malformed links, and non-video entries. Existing authentication, local bridge, library isolation, backup, local search and translation checks remain in place.

On macOS Apple silicon, a separate development library containing public book metadata and synthetic notes was opened. The native language dropdown switched among English, Russian and French; English persisted across restarts. Book images, a YouTube thumbnail and a video with an unavailable image were displayed in equal cover frames. A long video title stayed inside its frame. No personal library content or credentials were used in the English screenshot published on the download page.


## 0.3.0 changes

Automated checks cover translation key and interpolation parity, UI string coverage, local note search, local keyword tags, full media backup copies, one snapshot per version change, rejection of unsafe snapshot inputs, preservation of existing libraries on first account connection, and context export re-import. Existing OAuth, stream, account isolation, catalog grounding and local chat bridge checks remain in the suite.

On macOS Apple silicon, an isolated development library with no ChatGPT account was opened. English, Russian and French interfaces were checked. A manual item and written note were saved; note text search returned the exact note excerpt, and local topic tags appeared. A portable backup was saved through the native file dialog, then restored through the normal replacement screen. The item and note remained available, and a pre-restore recovery snapshot was created. Russian copy uses the direct action-oriented vocabulary approved for this release.

These checks use synthetic library content. No personal library data is included in source or release artifacts. Platform build results come from the release workflow; a successful cross-platform build does not establish manual runtime verification on another operating system.

The following records describe earlier manual checks of the same OAuth and local chat flows. The 0.3.0 changes do not add another authentication mechanism or developer API key.


## 0.2.0 source build: local chat connection

The source build adds opt-in local chat access; it is not part of the 0.1.0 downloads. Automated tests cover local credential checks, socket permissions, disable / reconnect, shelf pinning, stale revision rejection, preservation of existing stories / impressions / imports, idempotent context updates, context budget rejection, pre-update snapshots, persistent selection receipts, restart without repeated inference, and stdio MCP discovery / calls. These run alongside the original OAuth, catalog, import and storage tests.

On macOS Apple silicon, the packaged 0.2.0 app replaced an installed 0.1.0 app. The original library was unchanged by installation. A real stdio MCP session read the paired shelf, merged one chosen context document without a file picker, retried that exact update without duplication, and started one recommendation through the existing ChatGPT connection. The job completed and the app displayed two catalog-backed books with evidence from both new and previously chosen context. Previous sources and library impressions were preserved. No API key or remote bridge was used. The private source website was not modified.

The bundled ASAR and standalone client were checked for accidental runtime databases and personal files. Manual bridge testing was on macOS only; Windows / Linux runtime behavior is not established by this check.

The remainder of this document records the original 0.1.0 release validation.

## Automated checks

- ID-token signature, issuer, audience, expiry, nonce, and tamper rejection.
- Dynamic registration, issued client reuse, PKCE, exact callback URI and state validation through an actual loopback listener using synthetic credentials.
- Encrypted persistence boundary, stable host identity across restart, and serialized rotating-token refresh.
- Empty first-run library, per-registration / offline shelf separation, atomic writes, and restart persistence.
- Active-branch / user-only ChatGPT import and enabled-source controls.
- Bounded recommendation context, excluding audio and disabled sources.
- Public Responses endpoint, required streaming / no-storage parameters, account model catalog ordering.
- Interrupted streams, incomplete responses, and usage errors after partial output are rejected.
- English-only source text and scan for credential patterns / private project identifiers.

## Manual and packaging checks

On macOS Apple silicon, the packaged app was launched and visually checked. Live Open Library search returned a book with its cover and metadata. Adding it to a shelf and saving a written impression succeeded. The account shelf was separate from the offline test shelf.

A real interactive ChatGPT registration completed successfully. The app received the account's available model catalog, then made a real recommendation request through ChatGPT plan access. Retrieved catalog books, covers, and explanations appeared inside the app. This check used an ordinary short fiction request, without importing personal conversations or documents. No developer API key was used.

The packaged ASAR was inspected for runtime databases, credentials, host state, private work files, environment files, and hosting configuration; none were present. Other-platform build results are reported by the release workflow. Cross-platform build success does not establish runtime behavior on an untested operating system.

## Account eligibility boundary

The integration follows OpenAI's published open-source SIWC protocol. Automated OAuth / inference tests use synthetic tokens, signatures, accounts, and streams. They do not sign in to a real ChatGPT account or consume plan usage. The separate manual check above establishes one successful account flow, not universal eligibility. Authorization and inference still depend on each user's account, workspace, network, and consent.

This preview does not claim automatic ChatGPT history access or guaranteed free / unlimited AI. No separate developer API-key route is included.
