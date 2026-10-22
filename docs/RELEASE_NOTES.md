# Aftertaste 0.1.0 — public preview

A quiet local library for stories and the thoughts they leave behind.

Search books, manga and games, collect covers, and keep written or voice impressions. Import chosen ChatGPT conversations or text documents, then ask for a few personal recommendations directly inside the app. Recommendations discover candidates from public catalogs instead of a predefined list.

Connect through the documented **Continue with ChatGPT** flow. No separate API key is needed. Eligible requests use your ChatGPT plan and its limits; account / workspace availability varies. Signing in does not grant access to ChatGPT history. All imports are chosen locally and recommendations run only when requested.

## Downloads

- **macOS Apple silicon:** `Aftertaste-0.1.0-mac-arm64.zip`
- **macOS Intel:** `Aftertaste-0.1.0-mac-x64.zip`
- **Windows x64:** `Aftertaste-0.1.0-win-x64.exe` (portable)
- **Linux x64:** `Aftertaste-0.1.0-linux-x64.AppImage`

Check `SHA256SUMS.txt` before opening a download. The preview is unsigned and macOS builds are not notarized; your OS may show an unidentified-publisher warning or block first launch. See the installation guide in the repository.

## What stays local

Your library, notes, recordings, chosen sources, and generated recommendations are saved on your computer. OAuth tokens are encrypted using the system credential store and excluded from exports. Each registration has its own shelf. The app ships with an empty library and no personal data.

Selected text context goes directly to OpenAI when you request recommendations. Catalog searches and remote cover images use their respective providers. There is no Aftertaste cloud account, telemetry, background import, or sync.

## Preview limitations

English-only interface and documentation. Imports support ChatGPT `conversations.json`, text / Markdown, and Aftertaste backups. Audio recordings are local playback only; no transcription. No cloud sync, mobile build, or automatic updater. Catalog coverage and covers vary. A real account must authorize ChatGPT access interactively; protocol tests do not establish availability for every account.

Read `docs/RELEASE_VALIDATION.md` for the checks actually performed. Report bugs in English, using synthetic examples and removing all private data.
