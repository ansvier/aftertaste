# Updates from a local chat

Available in **0.3.0**.

Ask a local assistant to update your chosen context and refresh recommendations without moving backup files around. Aftertaste must be running on the same computer. This is a local connection for clients such as the ChatGPT desktop app / Codex; it is not a remote connection for any browser-based ChatGPT session.

## Connect once

1. Open the shelf you want to use in Aftertaste.
2. Enable **Settings → Context → Updates from your local chat → Connect this shelf**.
3. Add the bundled stdio MCP server to your local assistant. It needs Node.js 22 or newer. On macOS, for example:

```sh
codex mcp add aftertaste -- node /Applications/Aftertaste.app/Contents/Resources/aftertaste-agent.cjs --mcp
```

The ChatGPT desktop app, Codex CLI and IDE extension share MCP configuration. A running client may need to reload its MCP connections. See the [official MCP configuration guide](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

For other operating systems, use the `aftertaste-agent.cjs` file in the installed application's resources folder. When running from source, use the absolute path to `agent/aftertaste.cjs` instead. No API key or account credential belongs in this command.

Then ask your assistant, for example: “Update my Aftertaste context from this conversation and find a few novels for me.” The assistant can send chosen evidence and start a real selection. It should report the completed job and saved recommendations, not just acknowledge the request.

## What is exposed

| Tool | Scope |
| --- | --- |
| `aftertaste_status` | Paired shelf, revision, counts, saved recommendations, latest selection job |
| `aftertaste_read_context` | Enabled text context and written impressions, within the same bounds used for recommendations; disabled text and audio excluded |
| `aftertaste_update_context` | Merge 1–40 chosen documents, up to 20,000 characters each / 100,000 per update; only bridge-created documents can be replaced |
| `aftertaste_refresh_recommendations` | Start one selection using the paired ChatGPT account and plan; poll status for the result |

Write operations require the exact account key and latest library revision. Give each logical update or selection a new request ID; reuse it only for retries of identical input. Recent receipts prevent duplicate updates and duplicate inference starts. The app retains 50 context receipts and 30 selection receipts. After restart, unfinished selections are marked interrupted and never restarted automatically.

Use stable document keys when revising the same evidence. Include the original source and date in each body. Distinguish user statements, third-party quotes and tentative inferences. The bridge does not gather chats, inspect documents, or decide which evidence an assistant may read. That access must come from the user's separate authorization in their chat.

## Privacy and control

The bridge is off by default and paired to one shelf. Switching accounts pauses access. Re-enable it explicitly to pair a different shelf. Disable it in Settings to close the local endpoint and rotate away its credential. Quitting Aftertaste also closes the connection.

The connection uses a local Unix socket on macOS/Linux or a named pipe on Windows, plus a random local credential. There is no TCP port, public URL, tunnel, or Aftertaste server. Files and socket permissions are owner-only where the OS supports them; Windows relies on the user's application-data directory permissions. Software already running as the same OS user can potentially read the credential, as it can the library itself. Use only trusted local assistants.

OAuth credentials never pass through this connection. It cannot delete stories or impressions, change accounts, read arbitrary files, or access ChatGPT history. A local library snapshot is saved under `private/backups/chat-updates/` before each context update. It references local media rather than duplicating it. These are recovery snapshots, not portable exports.

Context updates do not start inference. A separate explicit recommendation request uses the existing ChatGPT connection and plan limits. Previous recommendations remain saved if a selection fails; a successful selection replaces them. Nothing is collected or scheduled in the background.

## Command-line fallback

The same bundled client supports `status`, `read_context`, `update_context` and `refresh_recommendations`. Pass non-status arguments as a JSON object on standard input. The client never prints its local credential. This lets an already-running local chat complete a requested update even before it reloads its MCP tool list.

For an interrupted or timed-out write, read status before retrying. Do not invent a new request ID just to retry an operation that may already have completed. Do not automatically repeat a failed or interrupted inference request.
