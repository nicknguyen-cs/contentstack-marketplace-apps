import { ENTRY_SYSTEM_KEYS } from "../../common/utils/applyEntryData";
import { ContentTypeSummary, EntryData, LocaleSummary, StackHandle } from "./types";

export const ENTRY_PAGE_LIMIT = 100;
const CT_PAGE_LIMIT = 100;
const MAX_CT_PAGES = 30;

/**
 * All reads/writes go through the App SDK's stack API (appSdk.stack), the same
 * path SidebarLocalizeFrom uses. The host window performs the CMA request as
 * the logged-in user, so the user's own role applies — no OAuth app scopes,
 * no management token, and no `appSdk.api` proxy (which 403s unless the app
 * installation carries entry/content-type scopes). Calls run on the branch the
 * app is currently loaded in.
 *
 * Every call is annotated with what it was doing so a failure names the exact
 * request that was denied.
 */
async function withContext<T>(label: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    throw new Error(`${label} failed: ${describeError(err)}`);
  }
}

/** Stack-API rejections can be Errors, strings, or response-shaped objects. */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export async function listContentTypes(stack: StackHandle): Promise<ContentTypeSummary[]> {
  const items: ContentTypeSummary[] = [];
  for (let page = 0; page < MAX_CT_PAGES; page++) {
    const data = await withContext("GET content types", () =>
      stack.getContentTypes(
        {},
        {
          limit: CT_PAGE_LIMIT,
          skip: page * CT_PAGE_LIMIT,
          // Inline global-field schemas so buildTextTree can recurse into them.
          include_global_field_schema: true,
        }
      )
    );
    const batch = (data as { content_types?: ContentTypeSummary[] }).content_types ?? [];
    items.push(...batch);
    if (batch.length < CT_PAGE_LIMIT) break;
  }
  return items;
}

export async function listLocales(stack: StackHandle): Promise<LocaleSummary[]> {
  const data = await withContext("GET locales", () => stack.getLocales());
  return (data as { locales?: LocaleSummary[] }).locales ?? [];
}

export async function fetchEntriesPage(
  stack: StackHandle,
  contentTypeUid: string,
  locale: string,
  skip: number
): Promise<EntryData[]> {
  const data = await withContext(`GET entries for ${contentTypeUid}`, () =>
    stack.ContentType(contentTypeUid).Entry.Query().language(locale).limit(ENTRY_PAGE_LIMIT).skip(skip).find()
  );
  return (data as { entries?: EntryData[] }).entries ?? [];
}

/**
 * Update only the changed top-level fields — the CMA merges them into the
 * entry, creating a new draft version. Never publishes.
 */
export async function updateEntry(
  stack: StackHandle,
  contentTypeUid: string,
  entryUid: string,
  locale: string,
  changedFields: Record<string, unknown>
): Promise<void> {
  const entry = Object.fromEntries(
    Object.entries(changedFields).filter(([key]) => !ENTRY_SYSTEM_KEYS.has(key))
  );
  if (Object.keys(entry).length === 0) return;
  await withContext(`PUT entry ${entryUid}`, () =>
    stack.ContentType(contentTypeUid).Entry(entryUid).language(locale).update({ entry }, locale)
  );
}

/** Pull Contentstack's error_message out of an error string that has the response body appended. */
function extractServerMessage(message: string): string | null {
  const jsonStart = message.indexOf("{");
  if (jsonStart === -1) return null;
  try {
    const parsed = JSON.parse(message.slice(jsonStart)) as { error_message?: string };
    return parsed.error_message ?? null;
  } catch {
    return null;
  }
}

/**
 * Turn a raw stack-API error into something an editor can act on. These calls
 * run as the logged-in user, so a 401/403 is about the user's role on this
 * stack — not app scopes or tokens.
 */
export function friendlyApiError(err: unknown, fallback: string): string {
  const message = describeError(err) || fallback;
  const serverMessage = extractServerMessage(message);
  const detail = serverMessage
    ? ` (Contentstack said: "${serverMessage}")`
    : message
      ? ` (${message.length > 260 ? `${message.slice(0, 260)}…` : message})`
      : "";

  if (/\b(401|403)\b/.test(message)) {
    return (
      "Contentstack denied this request — your role doesn't have read/write access to entries " +
      "for this content type or locale." +
      detail
    );
  }
  if (/\b422\b/.test(message)) {
    return `Contentstack rejected the update — usually a field validation rule on this entry.${detail}`;
  }
  if (/\b429\b/.test(message)) {
    return "Rate limited by the Management API — wait a moment and retry.";
  }
  return serverMessage ?? message ?? fallback;
}
