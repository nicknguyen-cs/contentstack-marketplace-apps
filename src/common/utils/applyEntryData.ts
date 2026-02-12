/**
 * System keys in entry payload that are not content-type fields.
 * Do not call setData on these when applying draft/generated data to the entry form.
 */
export const ENTRY_SYSTEM_KEYS = new Set([
  "uid",
  "_version",
  "_metadata",
  "content_type",
  "locale",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
  "_in_progress",
  "tags",
  "_version_name",
  "version_name",
  "_workflow",
  "_embedded_items",
  "publish_details",
  "_rules",
  "ACL",
]);

export type ApplyEntryDataProgressCallback = (fieldKey: string, index: number, total: number) => void;

/**
 * Apply a payload (draft or generated) to the current entry using App SDK field.setData().
 * Values are written into the form and will only be saved when the user saves the entry.
 * Does not create a new entry version.
 *
 * @param sdk - Contentstack App SDK instance (from SidebarWidget context)
 * @param payload - Object keyed by field UID; system keys are skipped
 * @param onFieldProgress - Optional callback invoked per field when applying; when provided, fields are applied sequentially
 */
export async function applyEntryDataViaSdk(
  sdk: { location?: { SidebarWidget?: { entry?: { getField: (key: string) => { setData: (value: unknown) => Promise<unknown> } | undefined } } } },
  payload: Record<string, unknown>,
  onFieldProgress?: ApplyEntryDataProgressCallback
): Promise<void> {
  const sidebar = sdk?.location?.SidebarWidget;
  const entry = sidebar?.entry;
  if (!entry || typeof entry.getField !== "function") {
    throw new Error("Sidebar entry or getField not available. Use this from the Entry edit page.");
  }
  const data = (payload?.entry ?? payload) as Record<string, unknown>;
  if (!data || typeof data !== "object") {
    throw new Error("Payload is empty or invalid.");
  }
  const keys = Object.keys(data).filter((key) => !ENTRY_SYSTEM_KEYS.has(key));
  const total = keys.length;

  if (onFieldProgress) {
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      try {
        console.log("key", key);
        const field = entry.getField(key);
        if (field && typeof field.setData === "function") {
          onFieldProgress(key, i, total);
          await field.setData(data[key]);
        }
      } catch {
        // Skip keys that are not field UIDs (e.g. custom keys in saved JSON)
      }
    }
    return;
  }

  const setDataPromises: Promise<unknown>[] = [];
  for (const key of keys) {
    try {
      const field = entry.getField(key);
      if (field && typeof field.setData === "function") {
        setDataPromises.push(Promise.resolve(field.setData(data[key])));
      }
    } catch {
      // Skip keys that are not field UIDs (e.g. custom keys in saved JSON)
    }
  }
  await Promise.all(setDataPromises);
}
