/**
 * Shared types for the Taxonomy URL custom field.
 *
 * Suggested reading order for the whole app:
 *   1. types.ts        (this file)   the data shapes everything else uses
 *   2. url.ts                        pure helpers: config, tokens, patterns, slugs
 *   3. api.ts                        talks to Contentstack for term names
 *   4. resolve.ts                    puts 2 and 3 together to build one URL
 *   5. TaxonomyUrl.tsx               the React component (state, effects, UI)
 */

/* -------------------------------------------------------------------------- */
/*  Configuration (what an admin pastes into the field's "config" JSON)        */
/* -------------------------------------------------------------------------- */

/**
 * One conditional URL pattern.
 *
 * Rules are evaluated top to bottom. The first rule whose `when` term is
 * tagged on the entry wins, and its `pattern` is used for the URL.
 *
 * Example:
 *   { "when": { "taxonomy": "article_type", "term": "patch_notes" },
 *     "pattern": "/{rule_term}/{term:season}/{title}" }
 */
export interface UrlRule {
  when: {
    /** UID of the taxonomy to look in (not its display name). */
    taxonomy: string;
    /** UID of the term that selects this rule. A list means "any of these". */
    term: string | string[];
  };
  /** URL template. See url.ts for the tokens it may contain. */
  pattern: string;
  /** Optional name shown in the field when this rule matches. Defaults to "taxonomy: term". */
  label?: string;
}

/**
 * Everything the field can be configured with. `readConfig` in url.ts turns
 * the raw JSON into this shape and fills in defaults.
 */
export interface TaxonomyUrlConfig {
  /**
   * URL template used when no rule matches. With no rules at all it defaults
   * to "/{term}/{title}". With rules present and no pattern given, it is empty,
   * meaning "write nothing unless a rule matches".
   */
  pattern: string;
  /** Conditional patterns, evaluated in order. May be empty. */
  rules: UrlRule[];
  /** UID of the taxonomy field on the content type. Contentstack's default is "taxonomies". */
  taxonomyFieldUid: string;
  /**
   * Which taxonomy an unqualified {term} token reads from. Empty means
   * "the first term tagged on the entry, whichever taxonomy it is from".
   */
  taxonomyUid: string;
  /** UID of the field the {title} token reads. */
  titleFieldUid: string;
  /** UID of the field the URL is written to. */
  urlFieldUid: string;
  /**
   * Default for the "Keep URL in sync" toggle. Editors can change it per
   * entry; that choice is stored in the custom field's own value.
   */
  autoSync: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Entry data (what the editor has tagged)                                    */
/* -------------------------------------------------------------------------- */

/**
 * One tag on an entry, exactly as Contentstack stores it in the taxonomy
 * field. An entry tagged with three terms has three of these.
 */
export interface TermRef {
  taxonomy_uid: string;
  term_uid: string;
}

/* -------------------------------------------------------------------------- */
/*  Contentstack API responses                                                 */
/* -------------------------------------------------------------------------- */

/** A term as the Management API returns it. Only the fields this app reads. */
export interface CmaTerm {
  uid: string;
  name?: string;
  /** UID of the parent term, or null/undefined for a top-level term. */
  parent_uid?: string | null;
  /** 1 for a top-level term, 2 for its children, and so on. Not always present. */
  depth?: number;
}

/* -------------------------------------------------------------------------- */
/*  Resolved data (what the app has learned about a tagged term)               */
/* -------------------------------------------------------------------------- */

/**
 * A tagged term after its details have been fetched from Contentstack.
 * Names are in the entry's locale when the stack has localized taxonomies,
 * otherwise the default names.
 */
export interface ResolvedTerm {
  taxonomyUid: string;
  /** Empty unless the pattern asked for it with a {taxonomy} token. */
  taxonomyName: string;
  termUid: string;
  termName: string;
  parentUid: string | null;
  /**
   * Display names from the top of the taxonomy down to this term, e.g.
   * ["Season", "Season 3"]. Contains only the term's own name unless the
   * ancestor chain was fetched (patterns with {term_path}, or lookups by
   * parent term).
   */
  path: string[];
  /** UIDs matching `path` one-to-one, e.g. ["season", "season_3"]. */
  pathUids: string[];
}

/* -------------------------------------------------------------------------- */
/*  UI state (what the field displays)                                         */
/* -------------------------------------------------------------------------- */

/** The result of one pass over the entry: everything the field shows. */
export interface UrlBreakdown {
  /** Locale of the entry being edited. */
  locale: string;
  /** Name of the rule that chose the pattern, "default" for the fallback, or null when nothing applies. */
  ruleLabel: string | null;
  /** The URL template in use, or "" when no rule matched and there is no fallback. */
  pattern: string;
  /**
   * The terms the pattern needed, keyed by the token qualifier ("" for the
   * unqualified {term}, "@rule" for {rule_term}, otherwise the qualifier
   * text). A null value means the entry is not tagged with such a term yet.
   */
  terms: Record<string, ResolvedTerm | null>;
  /** Every tag on the entry, as stored. Shown so admins can see the exact UIDs. */
  tagged: TermRef[];
  /** What the URL field currently holds. */
  currentUrl: string;
  /** The URL built from the pattern, or "" while any token is still missing. */
  composedUrl: string;
  /** Tokens in the pattern that have no value yet (raw text, e.g. "{term:season}"). */
  missing: string[];
}
