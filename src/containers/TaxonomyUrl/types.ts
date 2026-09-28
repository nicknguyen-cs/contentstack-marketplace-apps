/** One conditional pattern. The first rule whose term is tagged on the entry wins. */
export interface UrlRule {
  when: {
    /** Taxonomy UID to look in. */
    taxonomy: string;
    /** Term UID (or several) that selects this rule. */
    term: string | string[];
  };
  pattern: string;
  /** Optional label shown in the field when the rule matches; defaults to the term UID. */
  label?: string;
}

/** Per-instance settings, read from the custom field's "config" JSON in the content type builder. */
export interface TaxonomyUrlConfig {
  /** Fallback URL template used when no rule matches (or there are no rules). Empty = don't write. */
  pattern: string;
  /** Conditional patterns, evaluated in order. */
  rules: UrlRule[];
  /** UID of the taxonomy field on the content type that holds the entry's terms. */
  taxonomyFieldUid: string;
  /** Which taxonomy the unqualified {term} token reads from. Empty = first term found. */
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

/** What the resolver learns about a term. Names are in the entry's locale when the CMA has them. */
export interface ResolvedTerm {
  taxonomyUid: string;
  taxonomyName: string;
  termUid: string;
  termName: string;
  parentUid: string | null;
  /** Term names from the root of the taxonomy down to (and including) the term. Only the term itself unless the chain was fetched. */
  path: string[];
  /** Term UIDs parallel to `path`. */
  pathUids: string[];
}

/** Everything the field shows in its breakdown table. */
export interface UrlBreakdown {
  locale: string;
  /** Which rule chose the pattern, or "default", or null when nothing applies. */
  ruleLabel: string | null;
  /** The pattern in use. */
  pattern: string;
  /** Terms the pattern needed, keyed by taxonomy UID. Null when the entry has no term from that taxonomy. */
  terms: Record<string, ResolvedTerm | null>;
  /** Every term the entry is tagged with, as stored (taxonomy_uid + term_uid). */
  tagged: TermRef[];
  currentUrl: string;
  composedUrl: string;
  /** Tokens in the pattern that resolved to nothing, so the URL cannot be built yet. */
  missing: string[];
}
