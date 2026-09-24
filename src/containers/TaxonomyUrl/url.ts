import { ResolvedTerm, TaxonomyUrlConfig, TermRef } from "./types";

export const DEFAULT_CONFIG: TaxonomyUrlConfig = {
  pattern: "/{term}/{title}",
  taxonomyFieldUid: "taxonomies",
  taxonomyUid: "",
  titleFieldUid: "title",
  urlFieldUid: "url",
  autoSync: true,
};

/** Tokens a pattern may use, and what each one expands to. */
export const TOKENS = {
  term: "the selected term's name",
  term_path: "every ancestor of the term, then the term (a/b/c)",
  term_uid: "the selected term's UID",
  taxonomy: "the taxonomy's name",
  taxonomy_uid: "the taxonomy's UID",
  title: "the entry title",
  locale: "the entry's locale code",
} as const;

export type Token = keyof typeof TOKENS;

const TOKEN_PATTERN = /\{([a-z_]+)\}/g;

export function slugify(text: string): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Merges the field's config JSON over the defaults, ignoring keys with the wrong type. */
export function readConfig(raw: unknown): TaxonomyUrlConfig {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const text = (key: keyof TaxonomyUrlConfig, allowEmpty = false): string => {
    const value = source[key];
    const fallback = DEFAULT_CONFIG[key] as string;
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    return trimmed || (allowEmpty ? "" : fallback);
  };
  return {
    pattern: text("pattern"),
    taxonomyFieldUid: text("taxonomyFieldUid"),
    taxonomyUid: text("taxonomyUid", true),
    titleFieldUid: text("titleFieldUid"),
    urlFieldUid: text("urlFieldUid"),
    autoSync: typeof source.autoSync === "boolean" ? source.autoSync : DEFAULT_CONFIG.autoSync,
  };
}

/** The distinct tokens a pattern uses, in order of first appearance. */
export function tokensIn(pattern: string): string[] {
  const seen: string[] = [];
  for (const match of pattern.matchAll(TOKEN_PATTERN)) {
    if (!seen.includes(match[1])) seen.push(match[1]);
  }
  return seen;
}

export function unknownTokens(pattern: string): string[] {
  return tokensIn(pattern).filter((token) => !(token in TOKENS));
}

/** Picks the term that drives the URL from a taxonomy field's value. */
export function selectTerm(value: unknown, taxonomyUid: string): { term: TermRef | null; count: number } {
  if (!Array.isArray(value)) return { term: null, count: 0 };
  const refs = value.filter(
    (item): item is TermRef =>
      !!item && typeof item.taxonomy_uid === "string" && typeof item.term_uid === "string"
  );
  const term = taxonomyUid ? refs.find((ref) => ref.taxonomy_uid === taxonomyUid) ?? null : refs[0] ?? null;
  return { term, count: refs.length };
}

/** Slug values for every token, ready to drop into the pattern. Empty string means "not available". */
export function tokenValues(
  term: ResolvedTerm | null,
  title: string,
  locale: string
): Record<Token, string> {
  return {
    term: term ? slugify(term.termName) || slugify(term.termUid) : "",
    term_path: term ? term.path.map((name) => slugify(name)).filter(Boolean).join("/") : "",
    term_uid: term ? slugify(term.termUid) : "",
    taxonomy: term ? slugify(term.taxonomyName) || slugify(term.taxonomyUid) : "",
    taxonomy_uid: term ? slugify(term.taxonomyUid) : "",
    title: slugify(title),
    locale: slugify(locale),
  };
}

/**
 * Fills the pattern and normalises the result to a clean path: single leading
 * slash, no trailing slash, no empty segments. Returns the URL and the tokens
 * that had no value; when any are missing the URL should not be written.
 */
export function composeUrl(
  pattern: string,
  values: Record<string, string>
): { url: string; missing: string[] } {
  const missing: string[] = [];
  const filled = pattern.replace(TOKEN_PATTERN, (_whole, token: string) => {
    const value = values[token] ?? "";
    if (!value) missing.push(token);
    return value;
  });
  const segments = filled.split("/").map((segment) => segment.trim()).filter(Boolean);
  return { url: "/" + segments.join("/"), missing };
}
