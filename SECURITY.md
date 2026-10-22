# Security

This is an early public preview. Keep your operating system and the application current, and back up your library before testing a new version.

Report a suspected vulnerability using GitHub's **Security → Report a vulnerability** feature for this repository. Do not publish credentials, private notes, chat exports, or exploit details in a public issue. If private reporting is unavailable, open an issue containing only a request for a private reporting channel.

The supported release line is 0.1.x. Security fixes will be published as new releases. The app does not silently update itself.

## Boundaries

- OAuth uses PKCE, random state and nonce, loopback-only callbacks, signature-validated ID tokens, and separately stored registrations.
- Credentials are encrypted with Electron's system-backed secure storage. Connection is refused when the supported secure store is unavailable; plaintext fallback is not enabled.
- Library content and exports are ordinary local files, not an encrypted vault. Disk encryption and OS access controls remain important.
- The renderer has a sandbox, context isolation, a restrictive content security policy, no Node integration, no remote scripts, and validated IPC senders. Only the app's own page can call the narrow desktop bridge.
- Imported documents, notes, and catalog descriptions are untrusted data. The model receives no shell, local-file, or connector tools.
- Signing out clears local tokens and attempts remote session revocation. If remote revocation cannot be confirmed, the app tells the user to disconnect in ChatGPT settings.
