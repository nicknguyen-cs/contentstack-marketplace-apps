import "@contentstack/venus-components/build/main.css";
import "./CustomField.css";
import { useEffect, useRef, useState, useCallback } from "react";
import ContentstackAppSDK from "@contentstack/app-sdk";
import io, { Socket } from "socket.io-client";
import { debounce, isEqual } from "lodash";
import { ENTRY_SYSTEM_KEYS } from "@/common/utils/applyEntryData";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CollabUser {
  uid: string;
  name: string;
}

interface EntryPayload {
  uid: string;
  [fieldUid: string]: unknown;
}

interface CustomFieldSdk {
  entry: {
    getData: () => EntryPayload;
    onChange: (cb: (payload: EntryPayload) => void) => void;
    getField: (uid: string) => { setData: (value: unknown) => void };
  };
  field: {
    uid: string;
  };
  frame: {
    updateHeight: (height: number) => void;
  };
}

interface UserInfo {
  username: string;
  clientId: string;
  editingField: string | null;
}

interface ActivityItem {
  user: string;
  fieldUid: string;
  timestamp: number;
  isLocal: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "https://nearby-mutt-divine.ngrok-free.app";
const DEBOUNCE_EMIT_MS = 200;
const EDITING_LOCK_MS = 1000;
const MAX_ACTIVITY_ITEMS = 15;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function formatFieldName(uid: string): string {
  return uid
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Get the block-type key from a modular block item (the key that isn't _metadata) */
function getBlockTypeKey(block: Record<string, unknown>): string | undefined {
  return Object.keys(block).find((k) => k !== "_metadata");
}

/**
 * Detect if a field value looks like a modular blocks array.
 * Modular blocks are arrays of objects where each item has a block-type key
 * whose value is an object (the block's fields).
 */
function isModularBlockValue(val: unknown): boolean {
  if (!Array.isArray(val) || val.length === 0) return false;
  return val.some((item) => {
    if (!item || typeof item !== "object") return false;
    const typeKey = getBlockTypeKey(item as Record<string, unknown>);
    if (!typeKey) return false;
    const inner = (item as Record<string, unknown>)[typeKey];
    return inner && typeof inner === "object" && !Array.isArray(inner);
  });
}

/**
 * Deep-diff a modular block array to produce a human-readable path describing
 * which block / sub-field changed.  Returns something like:
 *   "Hero Section → Heading"
 * Falls back to the top-level field name when it can't determine more detail.
 */
function describeModularBlockChange(
  oldVal: unknown,
  newVal: unknown,
  topFieldUid: string
): string[] {
  if (!Array.isArray(oldVal) || !Array.isArray(newVal)) {
    return [formatFieldName(topFieldUid)];
  }

  // Try to match old blocks by _metadata.uid first, fall back to index
  const oldByUid = new Map<string, Record<string, unknown>>();
  let hasMetaUids = false;
  for (const block of oldVal) {
    const metaUid = block?._metadata?.uid;
    if (metaUid) {
      oldByUid.set(metaUid, block);
      hasMetaUids = true;
    }
  }

  const paths: string[] = [];

  // Length changed = block added or removed
  if (newVal.length > oldVal.length) {
    const diff = newVal.length - oldVal.length;
    const lastBlock = newVal[newVal.length - 1];
    const blockType = lastBlock ? getBlockTypeKey(lastBlock) : undefined;
    paths.push(
      `${formatFieldName(topFieldUid)} → ${blockType ? formatFieldName(blockType) : "block"} (added${diff > 1 ? ` ×${diff}` : ""})`
    );
  } else if (newVal.length < oldVal.length) {
    const diff = oldVal.length - newVal.length;
    paths.push(
      `${formatFieldName(topFieldUid)} → block (removed${diff > 1 ? ` ×${diff}` : ""})`
    );
  }

  // Diff blocks that exist in both old and new
  const len = Math.min(oldVal.length, newVal.length);
  for (let i = 0; i < len; i++) {
    const newBlock = newVal[i];
    if (!newBlock || typeof newBlock !== "object") continue;

    // Match by _metadata.uid if available, otherwise by index
    const metaUid = newBlock?._metadata?.uid;
    const oldBlock = hasMetaUids && metaUid ? oldByUid.get(metaUid) : oldVal[i];
    if (!oldBlock || typeof oldBlock !== "object") continue;

    if (isEqual(oldBlock, newBlock)) continue;

    const blockTypeKey = getBlockTypeKey(newBlock as Record<string, unknown>);
    if (!blockTypeKey) continue;

    const newFields = (newBlock as Record<string, unknown>)[blockTypeKey];
    const oldFields = (oldBlock as Record<string, unknown>)[blockTypeKey];

    if (!newFields || typeof newFields !== "object") continue;

    // Diff individual sub-fields within this block
    if (oldFields && typeof oldFields === "object" && !Array.isArray(oldFields)) {
      let foundSubDiff = false;
      for (const subField of Object.keys(newFields as Record<string, unknown>)) {
        if (
          !isEqual(
            (oldFields as Record<string, unknown>)[subField],
            (newFields as Record<string, unknown>)[subField]
          )
        ) {
          paths.push(
            `${formatFieldName(topFieldUid)} → ${formatFieldName(blockTypeKey)} → ${formatFieldName(subField)}`
          );
          foundSubDiff = true;
        }
      }
      if (!foundSubDiff) {
        // Something changed but we couldn't pinpoint the sub-field
        paths.push(`${formatFieldName(topFieldUid)} → ${formatFieldName(blockTypeKey)}`);
      }
    } else {
      paths.push(`${formatFieldName(topFieldUid)} → ${formatFieldName(blockTypeKey)}`);
    }
  }

  return paths.length > 0 ? paths : [formatFieldName(topFieldUid)];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function CustomFieldCollaboration() {
  const [isConnected, setIsConnected] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState<UserInfo[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityItem[]>([]);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  // Refs that persist across renders and avoid stale closures
  const sdkRef = useRef<CustomFieldSdk | null>(null);
  const userRef = useRef<CollabUser | null>(null);
  const entryUidRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const previousEntryRef = useRef<Record<string, unknown>>({});
  const pendingChangesRef = useRef<Record<string, unknown>>({});
  const suppressNextChangeForFields = useRef<Set<string>>(new Set());
  const activelyEditingFields = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const activityLogRef = useRef<ActivityItem[]>([]);
  const ownFieldUidRef = useRef<string | null>(null);

  // Helper to push activity items (keeps ref and state in sync)
  const pushActivity = useCallback((items: ActivityItem[]) => {
    const updated = [...items, ...activityLogRef.current].slice(0, MAX_ACTIVITY_ITEMS);
    activityLogRef.current = updated;
    setActivityLog(updated);
  }, []);

  // Stable debounced functions via refs so they survive re-renders
  const emitChangesRef = useRef(
    debounce(() => {
      const changes = { ...pendingChangesRef.current };
      pendingChangesRef.current = {};

      if (Object.keys(changes).length === 0) return;

      const entryId = entryUidRef.current;
      if (!entryId || !socketRef.current) return;

      socketRef.current.emit("entryUpdated", { entryId, changes });
      setLastSyncTime(Date.now());
    }, DEBOUNCE_EMIT_MS)
  );

  const releaseEditingLockRef = useRef(
    debounce(() => {
      activelyEditingFields.current.clear();
    }, EDITING_LOCK_MS)
  );

  // -------------------------------------------------------------------
  // Timestamp refresh timer
  // -------------------------------------------------------------------

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  // -------------------------------------------------------------------
  // Field change detection (local user typing)
  // -------------------------------------------------------------------

  const handleFieldChanges = useCallback((updatedPayload: EntryPayload) => {
    if (!initializedRef.current) return;
    if (Object.keys(previousEntryRef.current).length === 0) return;

    let hasChanges = false;
    const changedFields: string[] = [];
    const activityDescriptions: string[] = [];

    for (const field in updatedPayload) {
      // Skip system / metadata keys
      if (ENTRY_SYSTEM_KEYS.has(field)) continue;

      // Skip the collaboration plugin's own field
      if (ownFieldUidRef.current && field === ownFieldUidRef.current) continue;

      // Skip fields we just applied from a remote update
      if (suppressNextChangeForFields.current.has(field)) {
        suppressNextChangeForFields.current.delete(field);
        continue;
      }

      if (!isEqual(previousEntryRef.current[field], updatedPayload[field])) {
        activelyEditingFields.current.add(field);
        changedFields.push(field);

        // Build descriptive activity labels
        if (isModularBlockValue(updatedPayload[field]) || isModularBlockValue(previousEntryRef.current[field])) {
          const descriptions = describeModularBlockChange(
            previousEntryRef.current[field],
            updatedPayload[field],
            field
          );
          activityDescriptions.push(...descriptions);
        } else {
          activityDescriptions.push(formatFieldName(field));
        }

        // Deep clone to avoid stale reference comparisons on nested objects
        previousEntryRef.current[field] = structuredClone(updatedPayload[field]);
        pendingChangesRef.current[field] = updatedPayload[field];
        hasChanges = true;
      }
    }

    if (hasChanges) {
      // Log local activity with descriptive labels
      const userName = userRef.current?.name || "You";
      const now = Date.now();
      const newItems: ActivityItem[] = activityDescriptions.map((desc) => ({
        user: userName,
        fieldUid: desc,
        timestamp: now,
        isLocal: true,
      }));
      pushActivity(newItems);

      releaseEditingLockRef.current();
      emitChangesRef.current();
    }
  }, [pushActivity]);

  // -------------------------------------------------------------------
  // Receive remote changes and apply to the entry form
  // -------------------------------------------------------------------

  const handleSocketEntryUpdate = useCallback(
    ({ changes, username }: { changes: Record<string, unknown>; username?: string }) => {
      const sdk = sdkRef.current;
      if (!sdk) return;

      const validChanges: Record<string, unknown> = {};
      for (const [fieldUid, value] of Object.entries(changes)) {
        // Don't overwrite fields the local user is actively editing
        if (activelyEditingFields.current.has(fieldUid)) continue;
        // Skip the collaboration plugin's own field
        if (ownFieldUidRef.current && fieldUid === ownFieldUidRef.current) continue;
        validChanges[fieldUid] = value;
      }

      if (Object.keys(validChanges).length === 0) return;

      const now = Date.now();
      setLastSyncTime(now);

      // Log remote activity with descriptive labels
      const remoteUser = username || "Someone";
      const activityDescriptions: { desc: string; fieldUid: string }[] = [];
      for (const [fieldUid, value] of Object.entries(validChanges)) {
        if (isModularBlockValue(value) || isModularBlockValue(previousEntryRef.current[fieldUid])) {
          const descriptions = describeModularBlockChange(
            previousEntryRef.current[fieldUid],
            value,
            fieldUid
          );
          for (const desc of descriptions) {
            activityDescriptions.push({ desc, fieldUid });
          }
        } else {
          activityDescriptions.push({ desc: formatFieldName(fieldUid), fieldUid });
        }
      }

      const newItems: ActivityItem[] = activityDescriptions.map(({ desc }) => ({
        user: remoteUser,
        fieldUid: desc,
        timestamp: now,
        isLocal: false,
      }));
      pushActivity(newItems);

      for (const [fieldUid, value] of Object.entries(validChanges)) {
        suppressNextChangeForFields.current.add(fieldUid);
        // Update previous ref so we don't echo this change back
        previousEntryRef.current[fieldUid] = structuredClone(value);
        try {
          sdk.entry.getField(fieldUid).setData(value);
        } catch {
          // Field may not exist in the current content type — skip silently
        }
      }
    },
    [pushActivity]
  );

  // -------------------------------------------------------------------
  // Socket setup
  // -------------------------------------------------------------------

  const joinRoom = useCallback(() => {
    const user = userRef.current;
    const entryUid = entryUidRef.current;
    if (!user || !entryUid || !socketRef.current) return;

    socketRef.current.emit("join", {
      entryId: entryUid,
      username: user.name || "Anonymous",
      clientId: user.uid,
    });
  }, []);

  const setupSocket = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const socket: Socket = io(SOCKET_URL, {
      autoConnect: true,
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on("connect", () => {
      setIsConnected(true);
      joinRoom();
    });

    socket.on("reconnect" as string, () => {
      // Re-join the room after a reconnection
      joinRoom();
    });

    socket.on("entryUpdated", handleSocketEntryUpdate);
    socket.on("updateUsers", (users: (UserInfo | string)[]) => {
      // Normalize: server may send strings (old format) or UserInfo objects
      const normalized: UserInfo[] = users.map((u) =>
        typeof u === "string"
          ? { username: u, clientId: u, editingField: null }
          : u
      );
      setConnectedUsers(normalized);
    });

    socket.on("disconnect", () => setIsConnected(false));

    socket.on("connect_error", (err) => {
      console.warn("Socket connection error:", err.message);
    });

    socketRef.current = socket;
  }, [joinRoom, handleSocketEntryUpdate]);

  // -------------------------------------------------------------------
  // SDK initialization
  // -------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const appSDK = await ContentstackAppSDK.init();
      if (cancelled) return;

      const customField = appSDK.location?.CustomField as CustomFieldSdk | undefined;
      if (!customField) {
        console.warn("Not running in a Custom Field location.");
        return;
      }

      const entryData = customField.entry.getData();
      customField.frame.updateHeight(320);

      // Populate refs
      sdkRef.current = customField;
      entryUidRef.current = entryData.uid;
      userRef.current = {
        uid: appSDK.currentUser.uid,
        name: `${appSDK.currentUser.first_name} ${appSDK.currentUser.last_name}`,
      };

      // Store this custom field's own UID so we can skip it in change detection
      try {
        ownFieldUidRef.current = customField.field.uid;
      } catch {
        // field.uid may not be available in all SDK versions
      }

      // Deep clone the initial entry data for diffing (skip system keys)
      const initial: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(entryData)) {
        if (!ENTRY_SYSTEM_KEYS.has(key)) {
          initial[key] = structuredClone(value);
        }
      }
      previousEntryRef.current = initial;

      // Listen for field changes
      customField.entry.onChange((updatedPayload: EntryPayload) => {
        handleFieldChanges(updatedPayload);
      });

      // Mark initialization complete so onChange handler starts processing
      initializedRef.current = true;

      // Connect the socket
      setupSocket();
    };

    init();

    return () => {
      cancelled = true;
      emitChangesRef.current.cancel();
      releaseEditingLockRef.current.cancel();
      socketRef.current?.disconnect();
    };
  }, [handleFieldChanges, setupSocket]);

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <div className="collab-card">
      {!isConnected && <ServerDownBanner />}
      <CollabHeader
        isConnected={isConnected}
        users={connectedUsers}
        lastSyncTime={lastSyncTime}
        tick={tick}
      />
      <ActivityFeed items={activityLog} tick={tick} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const ServerDownBanner = () => (
  <div className="server-down-banner">
    <strong>Collab server is not running.</strong>{" "}
    Start it with: <code>cd server && npm run demo</code>
  </div>
);

const CollabHeader = ({
  isConnected,
  users,
  lastSyncTime,
  tick,
}: {
  isConnected: boolean;
  users: UserInfo[];
  lastSyncTime: number | null;
  tick: number;
}) => {
  const syncLabel = lastSyncTime
    ? `Synced · ${formatTimeAgo(lastSyncTime)}`
    : "No syncs yet";

  // Suppress unused variable warning - tick forces re-render for time updates
  void tick;

  return (
    <div className="collab-header">
      <div className={`connection-status ${isConnected ? "connected" : "disconnected"}`}>
        <span className="status-dot" />
        {isConnected ? "Connected" : "Connecting..."}
      </div>

      <div className="user-avatars">
        {users.map((user) => (
          <span
            key={user.clientId}
            className="user-avatar"
            style={{ backgroundColor: getAvatarColor(user.username) }}
            title={user.username}
          >
            {getInitials(user.username)}
          </span>
        ))}
      </div>

      <div className="sync-status">{syncLabel}</div>
    </div>
  );
};

const ActivityFeed = ({ items, tick }: { items: ActivityItem[]; tick: number }) => {
  const display = items.slice(0, 15);
  void tick;

  return (
    <div className="collab-section activity-feed">
      {display.length === 0 ? (
        <span className="muted-text">No recent activity</span>
      ) : (
        display.map((item, i) => (
          <div key={`${item.timestamp}-${item.fieldUid}-${i}`} className="activity-item">
            <span className="activity-text">
              {item.user} edited {item.fieldUid}
            </span>
            <span className="activity-time"> · {formatTimeAgo(item.timestamp)}</span>
          </div>
        ))
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  return parts.length > 1
    ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    : parts[0][0].toUpperCase();
}

function getAvatarColor(name: string): string {
  if (!name) return "#6b7280";
  const colors = ["#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default CustomFieldCollaboration;
