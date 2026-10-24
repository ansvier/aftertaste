# Getting started

Download the file for your OS from [the release page](https://github.com/ansvier/aftertaste/releases/tag/v0.3.0). Compare its SHA-256 checksum with `SHA256SUMS.txt` before opening it.

## Install and update

- **macOS:** unzip the matching Apple silicon or Intel archive and move `Aftertaste.app` to Applications. This preview is unsigned and not notarized. macOS may block an unidentified app. Verify its source and checksum, then follow Apple's supported Privacy & Security flow if your OS allows it. Do not disable system security protections. Alternatively, inspect and run the source.
- **Windows:** download the x64 portable executable and run it. There is no installer or administrator requirement. Windows may show an unrecognized-publisher prompt.
- **Linux:** download the x64 AppImage, make that file executable, and run it. Some distributions need AppImage / FUSE support. A desktop secret store is needed only for persistent ChatGPT sign-in.

Updates are manual: quit Aftertaste, download a newer release and replace the app. Library files are stored separately. Version 0.3.0 makes a local snapshot of all saved libraries and their media on the first launch of a changed app version, before opening the library. Also download a portable backup before replacing an older version.

## Use it without an account

1. Choose English, Russian or French with the flags in the header.
2. Choose **Add**. Search catalogs, paste a link or add a title manually.
3. Open **My notes** on an item to save written or voice notes.
4. Search titles, authors, note text and tags using the library search. Matching notes have an excerpt and open directly.
5. Topic tags are detected locally from explicit keywords in titles, descriptions and notes. Add custom tags in **Details** when needed.

These features do not require ChatGPT. Local records work offline; public catalogs and remote covers require internet.

## Optional recommendations

1. Open **Settings → ChatGPT → Connect ChatGPT** and complete sign-in in your browser.
2. Your first connection copies your existing offline library into the new account library. The offline original is retained, and an existing account library is never replaced. Later libraries can be selected under **Libraries & accounts**.
3. Under **Context**, import selected text / Markdown documents or ChatGPT `conversations.json`. For chat exports, only your messages are extracted. Select and review the sources you want to use.
4. Open **Recommendations → Get recommendations**. Optionally enter a request, choose books / manga / games, review the included sources and start. An eligible model from your account is selected automatically. New explanations use the current interface language; catalog titles keep their original spelling.
5. Read the reasons and caveats, add a recommendation to the library, or dismiss it.

Recommendations use the connected ChatGPT plan and its limits. Signing out, reaching a limit or choosing not to connect does not disable your saved library.

You can also connect a trusted local assistant under **Context → Updates from your local chat**. See [local chat instructions](LOCAL_CHAT.md). This is separate from signing in and does not grant access to chat history.

## Back up and restore

**Settings → Backup → Download backup** saves a portable JSON file with the library, notes, covers, audio and context. OAuth credentials are excluded. Keep this file private.

Choose **Restore backup**, select the JSON and review the replacement notice. A local recovery snapshot is saved before the current library is replaced. Restoring keeps the interface language and account connection; it replaces the selected library's content. Stored recommendations are cleared because their evidence identifiers change.

Local recovery snapshots are in the app's `private/backups/app/` folder, accessible from **Backup → Restore a local recovery copy → Open backup folder**. Select `libraries/<library-key>/library.json` inside a snapshot with **Restore backup**. Adjacent `assets/` files restore its covers and audio. Recovery snapshots are full copies of library files, not portable JSON exports. Keep the directory structure intact.

The automatic update snapshot is on the same computer. Download a separate backup for device loss or migration. Uninstalling or deleting the application-data directory can remove local copies too.

## Import or export just context

Use **Settings → Context → Import context / Export context**. Context exports can be imported without replacing the library. Full backups include context as well. Importing context is local; it is sent to OpenAI only when you explicitly request recommendations.
