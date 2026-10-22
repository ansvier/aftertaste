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

The release handoff records the platform builds and UI checks actually completed. Cross-platform build success does not establish runtime behavior on an untested operating system.

## Account eligibility boundary

The integration follows OpenAI's published open-source SIWC protocol. Automated OAuth / inference tests use synthetic tokens, signatures, accounts, and streams. They do not sign in to a real ChatGPT account or consume plan usage. Real authorization and inference depend on the user's account and workspace eligibility, network, and interactive consent.

This preview does not claim automatic ChatGPT history access or guaranteed free / unlimited AI. No separate developer API-key route is included.
