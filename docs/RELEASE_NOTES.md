# Aftertaste 0.3.0 — public preview

A local library for books, videos, games and your notes. No account required.

- **English, Russian and French:** switch with flags in the header. Language choices persist; new recommendation explanations use the selected language.
- **Search notes directly:** search titles, authors, note text and tags, then open a matching note from its excerpt.
- **Local automatic tags:** topics are detected from explicit keywords in titles, descriptions and written notes. No AI account or background upload is needed. Custom tags remain available.
- **Backups:** download and restore complete backups with notes, context, covers and audio. A local recovery snapshot is created before app updates, restores and deletions. Credentials are excluded.
- **Simpler settings:** optional ChatGPT connection, context import / export, and backups. Detailed source controls and local chat access are tucked into expandable sections.
- **Account-free library:** catalog search, manual entries, notes, audio, search, tags and backups work without ChatGPT. The first connection copies an existing offline library without removing the original.
- **Local chat updates:** an opt-in, account-pinned local connection lets a trusted assistant read enabled context, merge selected chat documents and request recommendations. No manual file exchange, remote proxy or API key.

## Downloads

- macOS Apple silicon: `Aftertaste-0.3.0-mac-arm64.zip`
- macOS Intel: `Aftertaste-0.3.0-mac-x64.zip`
- Windows x64 portable: `Aftertaste-0.3.0-win-x64.exe`
- Linux x64: `Aftertaste-0.3.0-linux-x86_64.AppImage`

Verify `SHA256SUMS.txt`. The preview is unsigned and macOS builds are not notarized. Your OS may warn or block first launch. Follow its supported security flow; do not disable system protections.

## Upgrade safely

Download a backup from the old app, quit it and replace the application. App data lives outside the app bundle. Version 0.3.0 also makes a local library-and-media snapshot on its first launch after a version change. Recover a snapshot through **Settings → Backup → Restore backup** by selecting its `library.json`; adjacent media is restored too.

## Data and availability

The app ships with an empty library. No personal data is included. Selected text context goes directly to OpenAI only for requested AI recommendations. Eligible requests use your ChatGPT plan and limits; availability varies. Catalogs receive search terms, and remote covers load from their providers. There is no automatic collection, cloud sync or telemetry.

Automatic topic tags have limited keyword coverage. Audio is local playback only, without transcription. PDF / DOCX imports, a mobile app and an automatic updater are not included. See `docs/RELEASE_VALIDATION.md` for the checks actually completed.
