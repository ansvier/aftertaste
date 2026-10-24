# Aftertaste 0.3.1 — public preview

A clearer library and a better introduction for new users.

- **Language dropdown:** choose English, Russian or French from one flag menu in the app and on the download website. The choice stays on your device.
- **Matching cover sizes:** every shelf item uses the same fixed frame, including long titles and unavailable images. Selection highlights the frame without enlarging it.
- **Video previews:** recognized YouTube links show a thumbnail without an API key. Every video has a play badge; unavailable previews keep a local placeholder. Uploaded and manually chosen covers take priority.
- **A look inside:** the download website includes an English screenshot with example books, a video and a written note, followed by three steps for adding material, taking notes and returning to them. The demonstration is separate from user libraries.

## Downloads

- macOS Apple silicon: `Aftertaste-0.3.1-mac-arm64.zip`
- macOS Intel: `Aftertaste-0.3.1-mac-x64.zip`
- Windows x64 portable: `Aftertaste-0.3.1-win-x64.exe`
- Linux x64: `Aftertaste-0.3.1-linux-x86_64.AppImage`

Verify `SHA256SUMS.txt`. The preview is unsigned and macOS builds are not notarized. Your OS may warn or block first launch. Follow its supported security flow; do not disable system protections.

## Upgrade safely

Download a backup from the old app, quit it and replace the application. Libraries and settings live outside the app bundle. A local library-and-media recovery copy is made before opening a changed app version. Restore a portable backup or a recovery snapshot through **Settings → Backup → Restore backup**. OAuth credentials are excluded from backups.

## Data and availability

The app ships with an empty library. The example website library is not bundled or imported. No personal data is included in source or downloads. Remote covers and YouTube preview images load directly from their providers; there is no embedded video player.

The full library works without ChatGPT. Personal recommendations remain optional and require an eligible ChatGPT connection, internet access and available plan usage. There is no separate developer API key, automatic chat history collection or background recommendation schedule.

See `docs/RELEASE_VALIDATION.md` for checks completed on this version. Platform build success does not establish manual runtime testing on every operating system.
