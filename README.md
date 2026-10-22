# Aftertaste

**A little space for stories that stay with you.**

A local desktop library for books, manga, games, videos, and the thoughts they leave behind. Find your next story with your ChatGPT plan, using context you choose to share.

![Aftertaste: a quiet room, a book, and the sea at night](renderer/assets/midnight-library.webp)

[Download the public preview](https://github.com/ansvier/aftertaste/releases/tag/v0.1.0) · [Getting started](docs/GETTING_STARTED.md) · [Privacy](docs/PRIVACY.md) · [How ChatGPT works](docs/CHATGPT.md)

## What you can do

- Search books through Open Library and Google Books, manga through MangaDex, and games through Steam. Covers and catalog details come along when available.
- Keep a cover shelf, reading / playing status, written impressions, and local voice recordings. Add other media by link or manually.
- Import selected conversations from a ChatGPT `conversations.json` export, or chosen text / Markdown documents. Review sources before using them.
- Request a few personal recommendations inside the app. ChatGPT proposes searches across public catalogs and chooses from verified catalog results; there is no bundled recommendation shortlist.
- Export and restore your library, imported context, covers, and voice recordings. Credentials are excluded from backups.

The interface, documentation, and project communication are English-only. You can keep notes and source documents in any language.

## Download

Get **Aftertaste 0.1.0 — public preview** from [GitHub Releases](https://github.com/ansvier/aftertaste/releases/tag/v0.1.0).

| System | Download |
| --- | --- |
| macOS, Apple silicon | `Aftertaste-0.1.0-mac-arm64.zip` |
| macOS, Intel | `Aftertaste-0.1.0-mac-x64.zip` |
| Windows, x64 | `Aftertaste-0.1.0-win-x64.exe` (portable) |
| Linux, x64 | `Aftertaste-0.1.0-linux-x64.AppImage` |

The preview is unsigned and macOS builds are not notarized. Your system may show an unidentified-publisher warning or block first launch. See [installation notes](docs/GETTING_STARTED.md). SHA-256 checksums accompany the release.

## Connect ChatGPT, without an API key

1. Open **Settings → Continue with ChatGPT**.
2. Complete sign-in and review permission to use your ChatGPT plan in your system browser.
3. Choose the conversations or documents to import, or simply build your library and leave impressions.
4. Open **For you**, review the context being sent, choose an available model, and request a selection.

Aftertaste has no app subscription or API-key setup. Eligible requests use the connected ChatGPT plan and its limits. Availability depends on the account, workspace, region, and OpenAI's preview. Manage plan access and any credit usage in ChatGPT settings. This is not unlimited or offline AI.

**Signing in does not grant access to your ChatGPT history or memory.** This release imports only files explicitly selected by the user. It does not browse your disk, email, or other chats. Recommendations run only when requested.

## Local by default

The library is stored in the operating system's Aftertaste application-data folder. Each ChatGPT registration has its own shelf, separate from the offline shelf. OAuth credentials stay in the desktop main process and are encrypted using the system credential store. They never reach the renderer, the download website, or library exports.

On a recommendation request, selected text context and written impressions go directly to OpenAI. Public catalog searches disclose search terms, such as a book title or subject, to the catalog provider. Cover images load from their providers. There is no Aftertaste account server, telemetry, automatic sync, or background recommendation schedule. Read the [privacy notes](docs/PRIVACY.md) for the exact boundaries.

## Run from source

Requires Node.js 22 or newer and a supported desktop OS.

```sh
npm ci
npm test
npm run check
npm start
```

Build on the target operating system:

```sh
npm run dist:mac
npm run dist:win
npm run dist:linux
```

See [development and release notes](docs/DEVELOPMENT.md). The desktop runtime has no npm production dependencies; Electron and electron-builder are development / packaging dependencies. No `.env` file or developer API key is needed.

## Preview boundaries

This is the first public preview. Catalog coverage, covers, English metadata, and ChatGPT availability vary. AI can misunderstand context; review its reasoning. Import supports text / Markdown and the JSON ChatGPT export, not PDF, DOCX, or ZIP. Voice impressions can be recorded and played locally but are not transcribed or sent to AI. There is no cloud sync or automatic update installer.

The OAuth protocol and stream handling have automated tests. A real account must still authorize access interactively; automated tests do not establish eligibility for every ChatGPT account. See [release validation](docs/RELEASE_VALIDATION.md) for the checks actually completed for this preview.

## Contribute

Issues, pull requests, and documentation should be in English. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Do not attach private conversations, account tokens, or library backups to a public issue.

MIT-licensed. Fonts and bundled third-party components retain their own licenses; see [notices](THIRD_PARTY_NOTICES.md). Independent project, not affiliated with or endorsed by OpenAI, Internet Archive, Google, MangaDex, or Valve.
