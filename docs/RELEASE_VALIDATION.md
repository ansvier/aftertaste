# Release validation — 0.1.0 public preview

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
