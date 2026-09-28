/**
 * Everything that talks to Contentstack for the Taxonomy URL field.
 *
 * The field needs display names for tagged terms (and sometimes for their
 * ancestors and their taxonomy). Those come from the Management API via the
 * `@contentstack/management` SDK, built over the App SDK's adapter so the
 * calls run as the logged-in editor: no management token, no app scopes.
 *
 * Why not the App SDK's own `appSdk.stack`? It has no taxonomy methods.
 *
 * Every function here is tolerant of a missing locale, a stack without
 * localized taxonomies, and terms that have no parent. The only hard failure
 * is a term that does not exist at all.
 */

import { CmaTerm, ResolvedTerm, TermRef } from "./types";

/* -------------------------------------------------------------------------- */
/*  The slice of the Management SDK this app uses                             */
/* -------------------------------------------------------------------------- */

// The SDK types its responses loosely, so the few calls used here are given
// exact local types. The component casts the SDK's stack object to TermSource.

export interface TermHandle {
  /** GET /taxonomies/{taxonomy}/terms/{term}. `params` may carry { locale }. */
  fetch(params?: Record<string, unknown>): Promise<unknown>;
  /** GET /taxonomies/{taxonomy}/terms/{term}/ancestors. Returns { terms: [...] }. */
  ancestors(): Promise<unknown>;
}

export interface TaxonomyHandle {
  /** GET /taxonomies/{taxonomy}. */
  fetch(params?: Record<string, unknown>): Promise<unknown>;
  terms(uid: string): TermHandle;
}

export interface TermSource {
  taxonomy(uid: string): TaxonomyHandle;
}

/* -------------------------------------------------------------------------- */
/*  Resolving one term                                                        */
/* -------------------------------------------------------------------------- */

export interface ResolveOptions {
  /** Entry locale. Names are requested in this locale first, then without one. */
  locale: string;
  /** Also fetch the taxonomy's display name (needed only for {taxonomy} tokens). */
  withTaxonomyName: boolean;
  /** Also fetch the ancestor chain (needed for {term_path} tokens and parent-term lookups). */
  withPath: boolean;
}

/**
 * Turns a tag ({ taxonomy_uid, term_uid }) into a ResolvedTerm with display
 * names. Fetches only what the caller asks for, because each extra piece is
 * another API call:
 *   - the term itself: always (one call, two if a locale is tried first)
 *   - the taxonomy name: when `withTaxonomyName`
 *   - the ancestor chain: when `withPath`
 *
 * Throws only when the term itself cannot be found.
 */
export async function resolveTerm(source: TermSource, ref: TermRef, options: ResolveOptions): Promise<ResolvedTerm> {
  const term = await fetchTerm(source, ref, options.locale);
  if (!term) {
    throw new Error(`Term "${ref.term_uid}" was not found in taxonomy "${ref.taxonomy_uid}".`);
  }
  const termName = term.name || term.uid;

  const [taxonomyName, ancestors] = await Promise.all([
    options.withTaxonomyName ? fetchTaxonomyName(source, ref.taxonomy_uid, options.locale) : "",
    options.withPath ? fetchAncestors(source, ref, term, options.locale) : [],
  ]);

  return {
    taxonomyUid: ref.taxonomy_uid,
    taxonomyName,
    termUid: term.uid,
    termName,
    parentUid: term.parent_uid ?? null,
    path: [...ancestors.map((ancestor) => ancestor.name), termName],
    pathUids: [...ancestors.map((ancestor) => ancestor.uid), term.uid],
  };
}

/* -------------------------------------------------------------------------- */
/*  Individual API calls                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Fetches a term. If a locale is given it is tried first so stacks with
 * localized taxonomies get the translated name; any failure there falls back
 * to the plain request. Returns null when the response has no term.
 */
async function fetchTerm(source: TermSource, ref: TermRef, locale: string): Promise<CmaTerm | null> {
  const handle = source.taxonomy(ref.taxonomy_uid).terms(ref.term_uid);

  if (locale) {
    try {
      const localized = readTerm(await handle.fetch({ locale }));
      if (localized?.name) return localized;
    } catch {
      // Localized taxonomies may not be enabled on this stack. Fall through.
    }
  }

  return readTerm(await handle.fetch());
}

/** Same locale-first strategy for the taxonomy's own name. Never throws; returns "" on failure. */
async function fetchTaxonomyName(source: TermSource, taxonomyUid: string, locale: string): Promise<string> {
  const handle = source.taxonomy(taxonomyUid);

  if (locale) {
    try {
      const name = readTaxonomyName(await handle.fetch({ locale }));
      if (name) return name;
    } catch {
      // Fall through to the unlocalized name.
    }
  }

  try {
    return readTaxonomyName(await handle.fetch());
  } catch {
    return "";
  }
}

/**
 * Fetches a term's ancestors, ordered from the top of the taxonomy down to
 * the term's direct parent. Returns [] for a top-level term or on any error,
 * so a failed ancestors call degrades to "no path" rather than "no URL".
 *
 * The ancestors endpoint takes no locale, so when a locale is wanted each
 * ancestor is re-read individually. Chains are short (two or three levels),
 * so this is a handful of calls, and the caller caches the result.
 */
async function fetchAncestors(
  source: TermSource,
  ref: TermRef,
  term: CmaTerm,
  locale: string
): Promise<{ uid: string; name: string }[]> {
  if (!term.parent_uid) return [];

  let ancestors: CmaTerm[];
  try {
    const response = (await source.taxonomy(ref.taxonomy_uid).terms(ref.term_uid).ancestors()) as {
      terms?: CmaTerm[];
    };
    ancestors = Array.isArray(response?.terms) ? response.terms : [];
  } catch {
    return [];
  }

  const ordered = orderAncestors(term, ancestors);
  const plainName = (ancestor: CmaTerm) => ancestor.name || ancestor.uid;

  if (!locale) {
    return ordered.map((ancestor) => ({ uid: ancestor.uid, name: plainName(ancestor) }));
  }

  return Promise.all(
    ordered.map(async (ancestor) => {
      try {
        const localized = await fetchTerm(source, { taxonomy_uid: ref.taxonomy_uid, term_uid: ancestor.uid }, locale);
        return { uid: ancestor.uid, name: localized?.name || plainName(ancestor) };
      } catch {
        return { uid: ancestor.uid, name: plainName(ancestor) };
      }
    })
  );
}

/* -------------------------------------------------------------------------- */
/*  Response parsing                                                          */
/* -------------------------------------------------------------------------- */

/** Accepts either { term: {...} } or a bare term object, which the SDK returns depending on the call. */
function readTerm(data: unknown): CmaTerm | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const term = (record.term && typeof record.term === "object" ? record.term : record) as Record<string, unknown>;
  return typeof term.uid === "string" ? (term as unknown as CmaTerm) : null;
}

/** Accepts either { taxonomy: {...} } or a bare taxonomy object. */
function readTaxonomyName(data: unknown): string {
  const record = (data ?? {}) as Record<string, unknown>;
  const taxonomy = (record.taxonomy && typeof record.taxonomy === "object" ? record.taxonomy : record) as Record<
    string,
    unknown
  >;
  return typeof taxonomy.name === "string" ? taxonomy.name : "";
}

/**
 * Puts ancestors in top-down order. The API does not document the order it
 * returns them in, so this rebuilds the chain by following `parent_uid` links
 * up from the term. If that doesn't account for every ancestor (unexpected
 * data), it falls back to sorting by `depth`, then to the order given.
 */
export function orderAncestors(term: CmaTerm, ancestors: CmaTerm[]): CmaTerm[] {
  const byUid = new Map(ancestors.map((ancestor) => [ancestor.uid, ancestor]));
  const chain: CmaTerm[] = [];
  const visited = new Set<string>(); // guards against a cycle in bad data

  let parentUid = term.parent_uid ?? null;
  while (parentUid && byUid.has(parentUid) && !visited.has(parentUid)) {
    visited.add(parentUid);
    const parent = byUid.get(parentUid) as CmaTerm;
    chain.unshift(parent); // prepend, so the root ends up first
    parentUid = parent.parent_uid ?? null;
  }
  if (chain.length === ancestors.length) return chain;

  const sorted = [...ancestors];
  if (sorted.every((ancestor) => typeof ancestor.depth === "number")) {
    sorted.sort((a, b) => (a.depth as number) - (b.depth as number));
  }
  return sorted;
}

/* -------------------------------------------------------------------------- */
/*  Errors                                                                    */
/* -------------------------------------------------------------------------- */

/** A short message for the field's error banner, hiding SDK internals where a status code says enough. */
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
