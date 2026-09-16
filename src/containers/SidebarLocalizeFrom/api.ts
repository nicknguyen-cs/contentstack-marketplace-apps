import { CopyResult, EntryLocaleStatus, StackLocale } from "./types";

/**
 * Minimal typing over the App SDK's stack API (appSdk.stack), which is typed
 * `any` upstream. These calls run through the host window with the logged-in
 * user's session — the user's own role applies, no app-proxy permissions or
 * management token involved.
 */
export interface StackEntryHandle {
  language(code: string): StackEntryHandle;
  fetch(): Promise<unknown>;
  update(payload: Record<string, unknown>, locale?: string): Promise<unknown>;
  getLanguages(): Promise<unknown>;
}

export interface StackHandle {
  getLocales(query?: Record<string, unknown>): Promise<unknown>;
  ContentType(uid: string): { Entry(uid: string): StackEntryHandle };
}

export async function getStackLocales(stack: StackHandle): Promise<StackLocale[]> {
  const data = (await stack.getLocales()) as { locales?: StackLocale[] };
  return data.locales ?? [];
}

export async function getEntryLocales(
  stack: StackHandle,
  contentTypeUid: string,
  entryUid: string
): Promise<EntryLocaleStatus[]> {
  const data = (await stack.ContentType(contentTypeUid).Entry(entryUid).getLanguages()) as {
    locales?: EntryLocaleStatus[];
  };
  return data.locales ?? [];
}

/**
 * True when the entry has its own copy in `code` (the master always counts).
 * Parsed defensively: some responses flag rows with `localized`, others mark
 * the master with `root`.
 */
export function isEntryLocalizedIn(
  statuses: EntryLocaleStatus[],
  code: string,
  masterCode: string | null
): boolean {
  if (masterCode && code === masterCode) return true;
  const row = statuses.find((s) => s.code === code);
  if (!row) return false;
  if (typeof row.localized === "boolean") return row.localized;
  return !!row.root || row.code === masterCode;
}

// System/read-only keys that must not be sent back in a localize update.
const SYSTEM_ENTRY_KEYS = new Set([
  "uid",
  "_version",
  "_in_progress",
  "_workflow",
  "ACL",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "publish_details",
  "locale",
  "stackHeaders",
  "content_type_uid",
  "urlPath",
  "_rules",
]);

/**
 * Reads the entry as it exists in the source locale and writes that content
 * into the target locale — which localizes the target (or overwrites an
 * existing localization). Non-localizable field values are ignored by the API.
 */
export async function localizeEntryFromSource(
  stack: StackHandle,
  contentTypeUid: string,
  entryUid: string,
  sourceLocale: string,
  targetLocale: string
): Promise<CopyResult> {
  const sourceData = (await stack
    .ContentType(contentTypeUid)
    .Entry(entryUid)
    .language(sourceLocale)
    .fetch()) as { entry?: Record<string, unknown> };
  const sourceEntry = sourceData.entry;
  if (!sourceEntry) {
    throw new Error(`Could not read the entry in ${sourceLocale}.`);
  }

  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sourceEntry)) {
    if (!SYSTEM_ENTRY_KEYS.has(key)) fields[key] = value;
  }

  await stack
    .ContentType(contentTypeUid)
    .Entry(entryUid)
    .language(targetLocale)
    .update({ entry: fields }, targetLocale);

  return { target: targetLocale, source: sourceLocale };
}

/** Turn a raw SDK/CMA error into something an editor can act on — never hiding the detail. */
export function friendlyApiError(err: unknown, fallback: string): string {
  // Stack-API rejections can be Errors, strings, or response-shaped objects.
  let message: string;
  if (err instanceof Error) message = err.message;
  else if (typeof err === "string") message = err;
  else {
    try {
      message = JSON.stringify(err);
    } catch {
      message = fallback;
    }
  }

  let serverMessage: string | null = null;
  const jsonStart = message.indexOf("{");
  if (jsonStart !== -1) {
    try {
      serverMessage =
        (JSON.parse(message.slice(jsonStart)) as { error_message?: string }).error_message ?? null;
    } catch {
      serverMessage = null;
    }
  }
  const detail = serverMessage
    ? ` (Contentstack said: "${serverMessage}")`
    : message
      ? ` (${message.length > 260 ? `${message.slice(0, 260)}…` : message})`
      : "";

  // Stack-API calls run as the logged-in user, so denials are about the
  // user's role — not app permissions or tokens.
  if (/\b(401|403)\b/.test(message)) {
    return `Contentstack denied this request — your role doesn't have the needed entry rights for this content type or locale.${detail}`;
  }
  if (/\b422\b/.test(message)) {
    return `Contentstack rejected the copied content — usually a required-field or schema validation issue in the target locale.${detail}`;
  }
  if (/\b429\b/.test(message)) {
    return "Rate limited by the Management API — wait a moment and retry.";
  }
  return serverMessage ?? message ?? fallback;
}
