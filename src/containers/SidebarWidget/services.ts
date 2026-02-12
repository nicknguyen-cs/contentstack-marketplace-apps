import { ENTRY_SYSTEM_KEYS, applyEntryDataViaSdk } from "@/common/utils/applyEntryData";
import { DraftConfig, DraftAssetMeta } from "./types";

const DEFAULT_BASE_URL = "https://api.contentstack.io";

export function getBaseUrl(config: DraftConfig | null | undefined): string {
  if (!config) return DEFAULT_BASE_URL;
  const url = config.baseUrl;
  if (url && typeof url === "string") return url.replace(/\/$/, "");
  return DEFAULT_BASE_URL;
}

/** Draft asset title convention for lookup: draft_{contentType}_{entry}_{locale} */
export function getDraftTitle(contentTypeUid: string, entryUid: string, locale: string): string {
  return `draft_${contentTypeUid}_${entryUid}_${locale}`;
}

/** Upload or replace draft JSON as an asset. Creates new asset or replaces file of existing one. */
export async function uploadDraftToAsset(
  config: DraftConfig,
  contentTypeUid: string,
  entryUid: string,
  locale: string,
  entryData: Record<string, unknown>
): Promise<{ uid: string }> {
  const baseUrl = getBaseUrl(config);
  const apiKey = config.apiKey;
  const authorization = config.authorization;
  if (!apiKey || !authorization) {
    throw new Error("API credentials not configured. Configure the app first.");
  }

  const title = getDraftTitle(contentTypeUid, entryUid, locale);
  const filename = `${title}.json`;
  const payloadToSave = stripSystemKeysFromEntryPayload(entryData);
  const json = JSON.stringify(payloadToSave, null, 2);
  console.log("json", json);
  const blob = new Blob([json], { type: "application/json" });

  // Check if draft asset already exists (by title)
  const existing = await findDraftAsset(config, contentTypeUid, entryUid, locale);
  if (existing) {
    // Replace asset file via Contentstack Replace Asset API
    const form = new FormData();
    form.append("asset[upload]", blob, filename);
    const replaceUrl = `${baseUrl}/v3/assets/${existing.uid}`;
    const replaceRes = await fetch(replaceUrl, {
      method: "PUT",
      headers: {
        api_key: apiKey,
        authorization: authorization,
      },
      body: form,
    });
    if (!replaceRes.ok) {
      const errText = await replaceRes.text();
      throw new Error(`Failed to update draft asset: ${replaceRes.status} ${errText}`);
    }
    const replaceData = await replaceRes.json();
    return { uid: replaceData?.asset?.uid || existing.uid };
  }

  // Create new asset via Upload Asset API
  const form = new FormData();
  form.append("asset[upload]", blob, filename);
  form.append("asset[title]", title);
  const createUrl = `${baseUrl}/v3/assets`;
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: {
      api_key: apiKey,
      authorization: authorization,
    },
    body: form,
  });
  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create draft asset: ${createRes.status} ${errText}`);
  }
  const createData = await createRes.json();
  const uid = createData?.asset?.uid;
  if (!uid) throw new Error("Create asset response missing asset uid");
  return { uid };
}

/** Find draft asset by title convention. Returns first match or null. */
export async function findDraftAsset(
  config: DraftConfig,
  contentTypeUid: string,
  entryUid: string,
  locale: string
): Promise<DraftAssetMeta | null> {
  const baseUrl = getBaseUrl(config);
  const apiKey = config.apiKey;
  const authorization = config.authorization;
  if (!apiKey || !authorization) return null;

  const title = getDraftTitle(contentTypeUid, entryUid, locale);
  const query = encodeURIComponent(JSON.stringify({ title }));
  const url = `${baseUrl}/v3/assets?query=${query}&limit=1`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      api_key: apiKey,
      authorization: authorization,
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const assets = data?.assets || [];
  if (assets.length === 0) return null;
  const asset = assets[0];
  return {
    uid: asset.uid,
    title: asset.title,
    filename: asset.filename,
    url: asset.url,
    updated_at: asset.updated_at,
    created_at: asset.created_at,
  };
}

/** Fetch draft JSON file content by asset UID. */
export async function getDraftAssetFileContent(
  config: DraftConfig,
  assetUid: string
): Promise<Record<string, unknown>> {
  const baseUrl = getBaseUrl(config);
  const apiKey = config.apiKey;
  const authorization = config.authorization;
  if (!apiKey || !authorization) {
    throw new Error("API credentials not configured.");
  }
  const metaUrl = `${baseUrl}/v3/assets/${assetUid}`;
  const metaRes = await fetch(metaUrl, {
    headers: {
      "Content-Type": "application/json",
      api_key: apiKey,
      authorization: authorization,
    },
  });
  if (!metaRes.ok) {
    throw new Error(`Failed to get draft asset: ${metaRes.status}`);
  }

  const metaData = await metaRes.json();
  const asset = metaData?.asset;
  if (!asset) throw new Error("Asset not found");
  const fileUrl = asset.url;
  if (!fileUrl) throw new Error("Asset has no file URL");

  // Asset file URLs (e.g. assets.contentstack.io) do not allow Authorization header in CORS;
  // fetch without custom headers so the request is allowed by the CDN's CORS policy.
  const fileRes = await fetch(fileUrl);

  if (!fileRes.ok) throw new Error(`Failed to download draft file: ${fileRes.status}`);
  const json = await fileRes.json();
  return typeof json === "object" && json !== null ? json : { entry: json };
}

/** Returns a copy of entry payload with only content-type fields (system keys stripped). Use when saving draft JSON so _version_name etc. are not persisted. */
function stripSystemKeysFromEntryPayload(entryData: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(entryData)) {
    if (!ENTRY_SYSTEM_KEYS.has(key)) out[key] = entryData[key];
  }
  return out;
}

/**
 * Apply draft payload to the current entry using App SDK field.setData().
 * Values are written into the form and will only be saved when the user saves the entry.
 * Does not create a new entry version.
 */
export async function applyDraftToEntryViaSdk(
  sdk: Parameters<typeof applyEntryDataViaSdk>[0],
  draftData: Record<string, unknown>
): Promise<void> {
  await applyEntryDataViaSdk(sdk, draftData);
}
