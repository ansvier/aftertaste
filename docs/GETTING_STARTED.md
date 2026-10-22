# Getting started

Download the file for your OS from [the release page](https://github.com/ansvier/aftertaste/releases/tag/v0.1.0). Compare its SHA-256 checksum with `SHA256SUMS.txt` before opening it.

## Install the preview

- **macOS:** unzip the matching Apple silicon or Intel archive and move `Aftertaste.app` to Applications. This preview is unsigned and not notarized. macOS may block it as an unidentified app. After verifying the source and checksum, follow Apple's supported Privacy & Security → Open Anyway flow if your OS allows it. Do not disable system security protections. Alternatively, inspect the source and run it locally.
- **Windows:** download the x64 portable `.exe` and run it. No installer or administrator access is required. This preview has no publisher signature, so Windows may show an unrecognized-publisher prompt.
- **Linux:** download the x64 AppImage, make that file executable, and run it. Some distributions need AppImage / FUSE support. A working desktop secret store is required for persistent ChatGPT sign-in.

Updates are manual: download a newer release and replace the application. The application-data directory is separate from the app bundle. Keep a library backup before upgrading.

## Start with your shelf

Use **Add a story** to search books, manga, or Steam games, or save a link / manual entry. Covers are filled where available; add an image URL or local image in **Cover & other details**. Add a written or voice impression from **My thoughts**. All of this works without ChatGPT.

## Get a personal recommendation

1. Open Settings and choose **Continue with ChatGPT**. Finish the browser consent flow. Your ChatGPT registration receives its own shelf; the offline shelf stays available in Settings.
2. In Settings, choose a text / Markdown document or `conversations.json` from a [ChatGPT data export](https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data). Unzip the export yourself and choose the JSON file. Pick specific conversations; no conversations are selected automatically.
3. Review the extracted user messages, then import the selected sources locally. Disable or remove sources you do not want to use.
4. Open **For you → Find something for me**. Review the context list, choose a model available to your account, and start. An optional mood or request can help, but there is no required profile form.
5. Read the reasons and caveats. Save a recommendation to your shelf or choose **Not for me**.

AI is online and uses your eligible ChatGPT plan. If a limit is reached, use **Manage usage** in the app. Library access does not depend on having AI available.

## Back up or move your library

Choose **Settings → Export library & audio**. Keep the resulting JSON private. On another installation, open Settings → Choose a file and select the backup. Review the replacement notice before restoring it to the current shelf. Credentials are intentionally not transferred; sign in on the new computer separately.
