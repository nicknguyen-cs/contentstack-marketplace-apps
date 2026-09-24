import { CmaTerm, ResolvedTerm, TermRef } from "./types";

/**
 * The slice of the Management SDK this app uses, typed locally so the SDK's
 * loose `any` returns don't leak. The client is built over the App SDK
 * adapter, so calls run with the logged-in user's session and no token.
 * (The App SDK's own `appSdk.stack` has no taxonomy API, which is why the
 * Management SDK is used here.)
 */
export interface TermHandle {
  fetch(params?: Record<string, unknown>): Promise<unknown>;
  ancestors(): Promise<unknown>;
}

export interface TaxonomyHandle {
  fetch(params?: Record<string, unknown>): Promise<unknown>;
  terms(uid: string): TermHandle;
}

export interface TermSource {
  taxonomy(uid: string): TaxonomyHandle;
}

export interface ResolveOptions {
  /** Entry locale. Term and taxonomy names are requested in this locale first. */
  locale: string;
  /** Fetch the taxonomy's name (only needed when the pattern uses {taxonomy}). */
  withTaxonomyName: boolean;
  /** Fetch the ancestor chain (only needed when the pattern uses {term_path}). */
  withPath: boolean;
}

function asTerm(data: unknown): CmaTerm | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const inner = (record.term && typeof record.term === "object" ? record.term : record) as Record<string, unknown>;
  return typeof inner.uid === "string" ? (inner as unknown as CmaTerm) : null;
}

/** Fetches one term, in the requested locale first and unlocalized second. Never throws on a name lookup. */
async function fetchTerm(source: TermSource, ref: TermRef, locale: string): Promise<CmaTerm | null> {
  const handle = source.taxonomy(ref.taxonomy_uid).terms(ref.term_uid);
  if (locale) {
    try {
      const localized = asTerm(await handle.fetch({ locale }));
      if (localized?.name) return localized;
    } catch {
      // The stack may not have localized taxonomies enabled; fall through.
    }
  }
  return asTerm(await handle.fetch());
}

/**
 * Orders the term's ancestors from the root down. The CMA's ancestors call
 * returns the chain, but its order isn't documented, so this walks
 * `parent_uid` links and falls back to `depth`, then to the given order.
 */
export function orderAncestors(term: CmaTerm, ancestors: CmaTerm[]): CmaTerm[] {
  const byUid = new Map(ancestors.map((item) => [item.uid, item]));
  const chain: CmaTerm[] = [];
  let parentUid = term.parent_uid ?? null;
  const guard = new Set<string>();
  while (parentUid && byUid.has(parentUid) && !guard.has(parentUid)) {
    guard.add(parentUid);
    const parent = byUid.get(parentUid) as CmaTerm;
    chain.unshift(parent);
    parentUid = parent.parent_uid ?? null;
  }
  if (chain.length === ancestors.length) return chain;

  const sorted = [...ancestors];
  if (sorted.every((item) => typeof item.depth === "number")) {
    sorted.sort((a, b) => (a.depth as number) - (b.depth as number));
  }
  return sorted;
}

/**
 * Resolves the selected term to the names the URL needs. Fetches only what the
 * pattern asks for: the term itself always, the taxonomy name and the ancestor
 * chain on demand.
 */
export async function resolveTerm(
  source: TermSource,
  ref: TermRef,
  options: ResolveOptions
): Promise<ResolvedTerm> {
  const term = await fetchTerm(source, ref, options.locale);
  if (!term) {
    throw new Error(`Term "${ref.term_uid}" was not found in taxonomy "${ref.taxonomy_uid}".`);
  }
  const termName = term.name || term.uid;

  const [taxonomyName, ancestorNames] = await Promise.all([
    options.withTaxonomyName ? fetchTaxonomyName(source, ref.taxonomy_uid, options.locale) : "",
    options.withPath ? fetchAncestorNames(source, ref, term, options.locale) : [],
  ]);

  return {
    taxonomyUid: ref.taxonomy_uid,
    taxonomyName,
    termUid: term.uid,
    termName,
    path: [...ancestorNames, termName],
  };
}

async function fetchTaxonomyName(source: TermSource, taxonomyUid: string, locale: string): Promise<string> {
  const handle = source.taxonomy(taxonomyUid);
  const read = (data: unknown): string => {
    const record = (data ?? {}) as Record<string, unknown>;
    const inner = (record.taxonomy && typeof record.taxonomy === "object" ? record.taxonomy : record) as Record<
      string,
      unknown
    >;
    return typeof inner.name === "string" ? inner.name : "";
  };
  if (locale) {
    try {
      const name = read(await handle.fetch({ locale }));
      if (name) return name;
    } catch {
      // fall through to the unlocalized name
    }
  }
  try {
    return read(await handle.fetch());
  } catch {
    return "";
  }
}

async function fetchAncestorNames(
  source: TermSource,
  ref: TermRef,
  term: CmaTerm,
  locale: string
): Promise<string[]> {
  if (!term.parent_uid) return [];
  let ancestors: CmaTerm[] = [];
  try {
    const data = (await source.taxonomy(ref.taxonomy_uid).terms(ref.term_uid).ancestors()) as {
      terms?: CmaTerm[];
    };
    ancestors = Array.isArray(data?.terms) ? data.terms : [];
  } catch {
    return [];
  }
  const ordered = orderAncestors(term, ancestors);

  // The ancestors call has no locale parameter, so re-read each ancestor
  // in-locale for its localized name. Chains are short, so this is a few calls.
  if (!locale) return ordered.map((item) => item.name || item.uid);
  return Promise.all(
    ordered.map(async (item) => {
      try {
        const localized = await fetchTerm(source, { taxonomy_uid: ref.taxonomy_uid, term_uid: item.uid }, locale);
        return localized?.name || item.name || item.uid;
      } catch {
        return item.name || item.uid;
      }
    })
  );
}

export function friendlyApiError(error: unknown): string {
  if (error && typeof error === "object") {
    const record = error as { errorMessage?: string; message?: string; status?: number };
    if (record.status === 422) return "The taxonomy or term no longer exists.";
    if (record.status === 403) return "Your role can't read taxonomies on this stack.";
    if (record.errorMessage) return record.errorMessage;
    if (record.message) return record.message;
  }
  return String(error);
}
