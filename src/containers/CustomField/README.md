# Live Collaboration — custom field

Google-Docs-style collaboration for the Contentstack entry editor. Add this custom field to a content type and everyone with the entry open sees each other's avatars, which field each person is in, and each other's changes as they type.

Changes are applied to the other editors' **forms**, not saved to the API. Everyone still clicks Save.

## Where it runs

| | |
|---|---|
| UI location | Custom field (`cs.cm.stack.custom_field`), data type JSON |
| Route | `/custom-field-collaboration` |
| Provider | `CustomFieldExtensionProvider` |
| Backend | `server/` socket.io relay, deployed separately |

## Setup

1. Run the relay locally or deploy it (see below).
2. Set `VITE_SOCKET_URL` to the relay URL in `.env` before building the client. If it is unset the code falls back to a hard-coded demo tunnel URL, which you should replace.
3. Add the custom field to a content type. It renders a small status bar with connected users; it holds no data of its own.

### Relay server

```bash
cd server && npm install && npm start     # port 3001, GET /health returns "ok"
```

Environment: `PORT` (default 3001), `ALLOWED_ORIGINS` (comma-separated, defaults to `*`).

Deploying to Render's free tier works: root directory `server`, build `npm install`, start `npm start`. It spins down after 15 minutes idle and takes about 30 seconds to wake.

## How it works

Each entry UID is a socket.io room. The field subscribes to `entry.onChange`, diffs the full payload against the previous snapshot (skipping system keys and its own field), batches changed fields and emits them debounced. Incoming changes are applied with `field.setData()`, with two guards: a suppression set so applied changes are not echoed back, and a one-second lock on the field the local user is typing in so their cursor is not yanked. An activity log labels changes with human-readable paths, including modular block and group names.

`CLAUDE.md` in this folder has the full data-flow and socket event reference.

## Known constraints

- Field-level, not character-level: if two people edit the same field at once, the last change wins.
- Rich text and JSON fields sync the whole value.
- Drag-and-drop block reordering does not fire `onChange` on its own. It syncs with the next text edit.
- The custom field only sees what the App SDK exposes for the entry.

## Files

| File | Purpose |
|------|---------|
| `CustomField.tsx` | Component: SDK init, diffing, socket handling, UI |
| `CustomField.css` | Status bar and avatars |
| `../../server/index.js` | The relay |
