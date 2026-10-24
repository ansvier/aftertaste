# Aftertaste 0.3.2 — public preview

Fix book searches that incorrectly reported no results for translated titles.

- Remove the English-only Google Books filter and use the interface / query language as an Open Library edition preference.
- Resolve translated book titles and author names through public Wikidata identifiers when needed. Cyrillic lookups start alongside the regular catalogs. Results come from actual Open Library records; there is no fixed starter list or AI API key.
- Follow merged Open Library work and author records to their current identifiers, with bounded redirects and validated destinations.
- Prefer a selected edition's cover when available and deduplicate equivalent catalog records.
- Show an explicit catalog availability / request-limit error instead of treating a failed search as an empty result. Rate-limited hosts are temporarily backed off.

## Downloads

- macOS Apple silicon: `Aftertaste-0.3.2-mac-arm64.zip`
- macOS Intel: `Aftertaste-0.3.2-mac-x64.zip`
- Windows x64 portable: `Aftertaste-0.3.2-win-x64.exe`
- Linux x64: `Aftertaste-0.3.2-linux-x86_64.AppImage`

Verify `SHA256SUMS.txt`. This is an unsigned preview; macOS builds are not notarized. Use the supported installation steps in `docs/GETTING_STARTED.md`.

## Updating and data

Export a backup, quit the old app and replace it. Libraries live outside the app bundle. A recovery copy is created before opening a changed version. No library migration or AI request is required for this fix.

Translated-title coverage depends on public metadata. A work may show a cover or description from another edition or language. Public catalogs may be slow, unavailable or rate limited; Aftertaste cannot guarantee every book or edition. The library remains usable without a ChatGPT account. New installations start empty and contain no personal data.

See `docs/RELEASE_VALIDATION.md` for completed checks.
