import {
  FetchedEntry,
  LocaleRow,
  PublishDetail,
  PublishState,
  StackEnvironment,
  StackLocale,
} from "./types";

/**
 * Minimal typing over the App SDK's stack API (appSdk.stack), which is typed
 * `any` upstream. Calls run through the host window with the logged-in
 * user's session, so no app-proxy scopes or management token are involved
 * (the proxy 403s in this app — see SidebarLocalizeFrom for the same pattern).
 */
export interface StackEntryHandle {
  language(code: string): StackEntryHandle;
  addParam(key: string, value: string): StackEntryHandle;
  fetch(): Promise<unknown>;
}

export interface StackHandle {
  getLocales(query?: Record<string, unknown>): Promise<unknown>;
  getEnvironments(query?: Record<string, unknown>): Promise<unknown>;
  ContentType(uid: string): { Entry(uid: string): StackEntryHandle };
}

export async function getStackLocales(stack: StackHandle): Promise<StackLocale[]> {
  const data = (await stack.getLocales()) as { locales?: StackLocale[] };
  return data.locales ?? [];
}

export async function getStackEnvironments(stack: StackHandle): Promise<StackEnvironment[]> {
  const data = (await stack.getEnvironments()) as { environments?: StackEnvironment[] };
  return data.environments ?? [];
}

/**
 * Reads the entry as the CMA serves it for `locale`. For an unlocalized locale
 * the response is the fallback copy, and its `locale` field says which one.
 */
export async function fetchEntryInLocale(
  stack: StackHandle,
  contentTypeUid: string,
  entryUid: string,
  locale: string
): Promise<FetchedEntry> {
  const data = (await stack
    .ContentType(contentTypeUid)
    .Entry(entryUid)
    .language(locale)
    .addParam("include_publish_details", "true")
    .addParam("include_workflow", "true")
    .fetch()) as { entry?: FetchedEntry };
  if (!data.entry) {
    throw new Error(`Empty response for ${locale}.`);
  }
  return data.entry;
}

/** Run `fn` over `items` with at most `limit` in flight, so 30 locales don't trip the CMA rate limit. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: "fulfilled", value: await fn(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Keep only this locale's publishes, resolve environment names, flag stale ones. */
export function toPublishStates(
  details: PublishDetail[] | undefined,
  locale: string,
  currentVersion: number | null,
  environments: StackEnvironment[]
): PublishState[] {
  const envName = new Map(environments.map((e) => [e.uid, e.name]));
  return (details ?? [])
    .filter((d) => d.locale === locale)
    .map((d) => ({
      environmentUid: d.environment,
      environmentName: envName.get(d.environment) ?? d.environment,
      time: d.time,
      version: d.version,
      outdated:
        typeof d.version === "number" && typeof currentVersion === "number"
          ? d.version < currentVersion
          : false,
    }))
    .sort((a, b) => a.environmentName.localeCompare(b.environmentName));
}

export function buildRow(
  locale: StackLocale,
  masterLocale: string | null,
  currentLocale: string,
  environments: StackEnvironment[],
  result: PromiseSettledResult<FetchedEntry>
): LocaleRow {
  const base = {
    code: locale.code,
    name: locale.name,
    isMaster: locale.code === masterLocale,
    isCurrent: locale.code === currentLocale,
    fallbackLocale: locale.fallback_locale ?? null,
  };

  if (result.status === "rejected") {
    return {
      ...base,
      localized: false,
      servedFrom: null,
      version: null,
      updatedAt: null,
      publishes: [],
      workflow: null,
      error: friendlyApiError(result.reason, "Failed to load"),
    };
  }

  const entry = result.value;
  const servedFrom = typeof entry.locale === "string" ? entry.locale : null;
  // The CMA answers a request for an unlocalized locale with the fallback
  // copy, whose `locale` is the fallback code — so equality means localized.
  const localized = base.isMaster || servedFrom === locale.code;
  const version = typeof entry._version === "number" ? entry._version : null;

  return {
    ...base,
    localized,
    servedFrom,
    version,
    updatedAt: localized ? entry.updated_at ?? null : null,
    // Publishes are recorded per target locale, so this is accurate even
    // when the published content was inherited from the fallback.
    publishes: toPublishStates(entry.publish_details, locale.code, version, environments),
    // `_workflow` belongs to the copy that was served; for an unlocalized
    // locale that is the fallback's stage, which would mislabel this row.
    workflow: localized && entry._workflow?.name ? entry._workflow : null,
    error: null,
  };
}

/** Turn a raw SDK/CMA error into something an editor can act on. */
export function friendlyApiError(err: unknown, fallback: string): string {
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

  if (/\b(401|403)\b/.test(message)) {
    return "Your role can't read this entry in this locale.";
  }
  if (/\b429\b/.test(message)) {
    return "Rate limited — retry in a moment.";
  }
  const text = serverMessage ?? message ?? fallback;
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}
