# Privacy and data flow

Aftertaste is a local desktop application. The public download page hosts product information and links to GitHub Releases; it never receives a library or ChatGPT token.

## Stored on your computer

Stories, status, notes, recordings, uploaded covers, chosen imported sources, and generated recommendations are saved in Aftertaste's application-data folder. The offline shelf and each ChatGPT registration have separate directories. Account credentials are encrypted through the system credential store and written with owner-only permissions where supported.

The library itself is **not encrypted by Aftertaste**. Other software running with your OS user's file access may be able to read it. Backups include context and media, and should be kept private. Backups never include OAuth credentials.

## Sent only when needed

| Action | Destination | Data |
| --- | --- | --- |
| Sign in / refresh / sign out | OpenAI authentication | OAuth registration and session data |
| Find available models | OpenAI | OAuth-authenticated account request |
| Request recommendations | OpenAI Responses API | Enabled imported text, library titles / status, written impressions, optional request, and retrieved catalog candidates |
| Search / discover catalog items | Open Library, Google Books, MangaDex, Steam | Search terms such as titles, creators, or subjects; no raw personal context |
| Display a remote cover | The cover provider | Image URL and ordinary network metadata such as IP address |
| Open a source link | Your system browser | The selected URL |

The app sends `store: false` for inference. That parameter does not promise zero retention by OpenAI; the connected account's and OpenAI's applicable data policies still govern processing. Audio recordings are not uploaded or transcribed in this release.

## Your controls

- Choose files through the system file picker. Chat export previews stay in memory until selected sources are imported.
- Enable, disable, inspect, or remove imported sources in Settings. Removing or disabling sources clears stored recommendations and the latest summary.
- Request recommendations manually. There is no automatic background collection or scheduled refresh.
- Sign out and manage access in ChatGPT settings. Offline library access remains available.
- Export a backup, restore a selected backup, or delete individual stories and impressions.
- Open the data folder to manage local files. To erase all app data, quit Aftertaste and remove its application-data directory. Removing a story hides its attached media from the library; unreferenced media files may remain on disk until the data directory is erased.

Aftertaste has no telemetry, advertising SDK, developer-operated recommendation proxy, or automatic cloud sync. GitHub and the download-site host have their own hosting and access-log policies.

Do not publish a library backup, imported conversations, or files from the application-data folder in a GitHub issue.
