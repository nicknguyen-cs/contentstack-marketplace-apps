# CustomField - Live Collaboration Plugin

## Overview

This CustomField plugin enables Google Docs-style live collaboration in Contentstack. Multiple users editing the same entry see each other's changes in real-time, with connected user avatars displayed in the field UI.

## Architecture

### Data Flow

```
User A types in field
  -> Contentstack SDK fires onChange with full entry payload
  -> handleFieldChanges diffs against previous state
  -> Changed fields are batched in pendingChangesRef
  -> Debounced emitChanges sends { entryId, changes } via WebSocket
  -> Server broadcasts to all other clients in the entry room
  -> User B receives "entryUpdated" event
  -> handleSocketEntryUpdate filters out fields User B is actively editing
  -> applyFieldChanges calls sdk.entry.getField(uid).setData(value)
  -> suppressNextChangeForFields prevents echo-back loop
```

### Key Concepts

- **Entry Room**: Each Contentstack entry UID is a socket.io room. Users join the room when they open the entry.
- **Change Suppression**: When applying remote changes via `setData()`, the SDK fires `onChange` again. The `suppressNextChangeForFields` set prevents re-emitting those changes back.
- **Active Editing Lock**: Fields the local user is currently typing in are tracked. Incoming remote changes to those fields are ignored to prevent cursor jumps.
- **System Key Filtering**: Entry payloads include metadata keys (`uid`, `_version`, `_metadata`, etc.) that must NOT be synced. Uses `ENTRY_SYSTEM_KEYS` from `src/common/utils/applyEntryData.ts`.

### Socket Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `join` | Client -> Server | `{ entryId, username, clientId }` | Join an entry collaboration room |
| `updateUsers` | Server -> Client | `UserInfo[]` (`{ username, clientId, editingField }`) | Updated list of users in the room |
| `fieldFocus` | Client -> Server | `{ entryId, fieldUid }` | Report which field the user is editing (or `null` to clear) |
| `entryUpdated` | Client -> Server | `{ entryId, changes }` | Emit field changes to other users |
| `entryUpdated` | Server -> Client | `{ changes, username }` | Receive field changes from other users |

### Files

| File | Purpose |
|------|---------|
| `CustomField.tsx` | React component: SDK init, change detection, socket management, UI |
| `websocket.js` | Node.js socket.io server (runs separately) |
| `CustomField.css` | Styles for connection status and user avatars |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_SOCKET_URL` | `http://localhost:3001` | WebSocket server URL |

## Running the WebSocket Server

### Local

```bash
cd server && npm install && npm start
```

The server runs on port 3001 by default. Verify with `curl http://localhost:3001/health`.

### Deploy to Render (Free Tier)

1. Push the `server/` directory to your GitHub repo
2. Go to [render.com](https://render.com), sign in with GitHub
3. **New** -> **Web Service** -> select your repo
4. Set **Root Directory** to `server`
5. Set **Build Command** to `npm install`
6. Set **Start Command** to `npm start`
7. Add env var: `ALLOWED_ORIGINS` = your Contentstack app URL (or `*` for demos)
8. Deploy — Render gives you a URL like `https://your-app.onrender.com`
9. Set `VITE_SOCKET_URL=https://your-app.onrender.com` in your client `.env`

Render's free tier spins down after 15 min of inactivity and wakes in ~30s on the next request.

## Known Constraints

- The collaboration is **field-level**, not character-level. If two users edit the same field simultaneously, the last change wins.
- Rich text and JSON fields sync the entire field value, not granular operations.
- The plugin runs inside a Contentstack Custom Field iframe, so it only has access to the entry data exposed by the App SDK.
- Changes are applied to the form only (not saved to the API). Users still need to click Save.
- **Modular block reordering syncs on next keystroke, not immediately.** The Contentstack App SDK's `entry.onChange` does not fire for drag-and-drop block reorder alone, but the reordered structure is included in the next `onChange` payload triggered by a text edit. The reorder will sync to other users once any field is edited after the drag.
