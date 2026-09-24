/** Per-instance settings, read from the custom field's "config" JSON in the content type builder. */
export interface TaxonomyUrlConfig {
  /** URL template. Tokens in braces are replaced with slugs, e.g. "/{term}/{title}". */
  pattern: string;
  /** UID of the taxonomy field on the content type whose selected term drives the URL. */
  taxonomyFieldUid: string;
  /** When the entry is tagged with terms from several taxonomies, only use this one. Empty = first term found. */
  taxonomyUid: string;
  /** Field the {title} token is built from. */
  titleFieldUid: string;
  /** The URL field to write to. */
  urlFieldUid: string;
  /** Whether the URL is rewritten automatically on every change (editors can toggle this in the field). */
  autoSync: boolean;
}

/** One item of a taxonomy field's value as the entry stores it. */
export interface TermRef {
  taxonomy_uid: string;
  term_uid: string;
}

/** A term as the CMA returns it. Only the parts this app reads. */
export interface CmaTerm {
  uid: string;
  name?: string;
  parent_uid?: string | null;
  depth?: number;
}

/** What the resolver learns about the selected term. Names are in the entry's locale when the CMA has them. */
export interface ResolvedTerm {
  taxonomyUid: string;
  taxonomyName: string;
  termUid: string;
  termName: string;
  /** Term names from the root of the taxonomy down to (and including) the selected term. */
  path: string[];
}

/** Everything the field shows in its breakdown table. */
export interface UrlBreakdown {
  locale: string;
  term: ResolvedTerm | null;
  /** How many terms the entry is tagged with (across the taxonomy field), to explain which one was used. */
  termCount: number;
  title: string;
  currentUrl: string;
  composedUrl: string;
  /** Tokens in the pattern that resolved to nothing, so the URL cannot be built yet. */
  missing: string[];
}
