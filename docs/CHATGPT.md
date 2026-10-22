# ChatGPT connection

Aftertaste uses OpenAI's documented **Sign in with ChatGPT for open-source and locally hosted apps**. It does not use a developer API key or private ChatGPT web endpoints.

The desktop main process starts a temporary listener on `127.0.0.1`, creates a stable opaque host ID, and opens the system browser for OAuth authorization with PKCE, state, and nonce. First-time registration starts with `dynamic_agent_client`; the issued registration ID is retained for later sign-ins. The app verifies the ID token's signature, issuer, audience, expiry, and nonce before activating the registration.

Encrypted credentials are stored under the OS's Aftertaste application-data directory, outside the application bundle. Access tokens, rotating refresh tokens, ID tokens, scopes, and expiry stay together. Refreshes are serialized, and each registration has a separate shelf. Sign-out attempts remote revocation and clears tokens locally.

Available models come from the connected account's model catalog. Inference goes to the public Responses endpoint using the OAuth access token, `store: false`, and `stream: true`. An interrupted stream, incomplete response, or late usage-limit error is a failure; partial recommendations are not saved.

The current pipeline sends the selected text context twice: first to identify themes and catalog searches, then to choose from retrieved catalog records. There is no autonomous background loop. Catalog requests contain search terms, not raw chats or notes. Returned recommendations must refer to actual retrieved candidates and known evidence IDs.

The ChatGPT connection does **not** expose conversations, account memory, email, or arbitrary files. Use the local import review to choose initial context. Only the user's messages from the active branch of an exported ChatGPT conversation are extracted. Quoted text inside those messages still needs human review; it is not automatically a personal belief.

No app subscription or API key is required. ChatGPT plan eligibility, limits, and any separately enabled credits remain controlled by OpenAI and the user. A connection may be unavailable for some accounts or workspaces. Aftertaste does not purchase credits or bypass usage limits.

Official references:

- [Open-source plan usage overview](https://developers.openai.com/siwc/token-sharing-open-source)
- [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [Usage UI guidance](https://developers.openai.com/siwc/ui-ux-guidelines)
