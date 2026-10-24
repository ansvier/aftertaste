# Aftertaste 0.3.3 — public preview

Edit saved notes and keep book covers available on your device.

- **Edit notes:** open My notes, choose Edit, then save or cancel. Note identity, creation date and voice recordings are preserved. Edited text is immediately searchable; older recommendations are marked for refresh without making an AI request.
- **Book covers:** the desktop app loads supported catalog covers through a private local cache. If an Open Library image fails, it tries other actual covers of the same work. New catalog items keep an available cover in their library media, including it in backups and offline access.
- **Existing books:** remote catalog covers can use the same cache and fallback without changing written notes or context. Uploaded covers remain the first choice.

## Downloads

- macOS Apple silicon: `Aftertaste-0.3.3-mac-arm64.zip`
- macOS Intel: `Aftertaste-0.3.3-mac-x64.zip`
- Windows x64 portable: `Aftertaste-0.3.3-win-x64.exe`
- Linux x64: `Aftertaste-0.3.3-linux-x86_64.AppImage`

Verify `SHA256SUMS.txt`. This is an unsigned preview; macOS builds are not notarized. Follow `docs/GETTING_STARTED.md`.

## Updating and data

Export a backup, quit the old app and replace it. Personal data lives outside the app bundle. An update recovery copy is made before opening the new version. No ChatGPT request or context import is needed for these changes.

Public metadata and cover availability vary. A cover may come from another edition or language. Failed downloads keep a placeholder; manual cover uploads remain available. Supported downloads enforce HTTPS and do not disable certificate checks. No personal library content is included in this release.
