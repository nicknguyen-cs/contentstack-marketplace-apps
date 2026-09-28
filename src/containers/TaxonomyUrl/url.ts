import { ResolvedTerm, TaxonomyUrlConfig, TermRef, UrlRule } from "./types";

export const DEFAULT_PATTERN = "/{term}/{title}";

export const DEFAULT_CONFIG: TaxonomyUrlConfig = {
  pattern: DEFAULT_PATTERN,
  rules: [],
  taxonomyFieldUid: "taxonomies",
  taxonomyUid: "",
  titleFieldUid: "title",
  urlFieldUid: "url",
  autoSync: true,
};

/**
 * Token kinds a pattern may use. Term-based kinds accept an optional taxonomy
 * qualifier after a colon ({term:franchise}); without one they use the
 * "primary" term (the taxonomyUid config, or the first term tagged).
 * {field:uid} reads any root-level string field.
 */
export const TOKENS = {
  term: "the term's name",
  term_path: "every ancestor of the term, then the term (a/b/c)",
  term_uid: "the term's UID",
  taxonomy: "the taxonomy's name",
  taxonomy_uid: "the taxonomy's UID",
  rule_term: "the term that matched the rule",
  rule_term_path: "the matched term's ancestors, then the term",
  title: "the entry title",
  field: "a root-level text field, {field:slug}",
  locale: "the entry's locale code",
} as const;

export type TokenKind = keyof typeof TOKENS;

const TERM_KINDS: TokenKind[] = ["term", "term_path", "term_uid", "taxonomy", "taxonomy_uid"];
const RULE_KINDS: TokenKind[] = ["rule_term", "rule_term_path"];
/** Slot key used for the term that matched the rule. */
export const RULE_SLOT = "@rule";

const TOKEN_PATTERN = /\{([a-z_]+)(?::([a-zA-Z0-9_-]+))?\}/g;

export interface ParsedToken {
  raw: string;
  kind: string;
  qualifier: string;
}

export function slugify(text: string): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readRules(raw: unknown): UrlRule[] {
  if (!Array.isArray(raw)) return [];
  const rules: UrlRule[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const when = (record.when && typeof record.when === "object" ? record.when : {}) as Record<string, unknown>;
    const taxonomy = typeof when.taxonomy === "string" ? when.taxonomy.trim() : "";
    const termRaw = when.term;
    const terms = (Array.isArray(termRaw) ? termRaw : [termRaw]).filter(
      (t): t is string => typeof t === "string" && t.trim() !== ""
    );
    const pattern = typeof record.pattern === "string" ? record.pattern.trim() : "";
    if (!taxonomy || terms.length === 0 || !pattern) continue;
    rules.push({
      when: { taxonomy, term: terms.length === 1 ? terms[0] : terms },
      pattern,
      ...(typeof record.label === "string" && record.label.trim() ? { label: record.label.trim() } : {}),
    });
  }
  return rules;
}

/**
 * Merges the field's config JSON over the defaults. With rules present, an
 * absent or empty "pattern" means "no fallback": nothing is written unless a
 * rule matches. Without rules the default pattern applies.
 */
export function readConfig(raw: unknown): TaxonomyUrlConfig {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const text = (key: "taxonomyFieldUid" | "taxonomyUid" | "titleFieldUid" | "urlFieldUid", allowEmpty = false): string => {
    const value = source[key];
    const fallback = DEFAULT_CONFIG[key];
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    return trimmed || (allowEmpty ? "" : fallback);
  };
  const rules = readRules(source.rules);
  const patternRaw = typeof source.pattern === "string" ? source.pattern.trim() : "";
  return {
    pattern: patternRaw || (rules.length ? "" : DEFAULT_PATTERN),
    rules,
    taxonomyFieldUid: text("taxonomyFieldUid"),
    taxonomyUid: text("taxonomyUid", true),
    titleFieldUid: text("titleFieldUid"),
    urlFieldUid: text("urlFieldUid"),
    autoSync: typeof source.autoSync === "boolean" ? source.autoSync : DEFAULT_CONFIG.autoSync,
  };
}

/** The distinct tokens a pattern uses, in order of first appearance. */
export function tokensIn(pattern: string): ParsedToken[] {
  const seen = new Map<string, ParsedToken>();
  for (const match of pattern.matchAll(TOKEN_PATTERN)) {
    if (!seen.has(match[0])) seen.set(match[0], { raw: match[0], kind: match[1], qualifier: match[2] ?? "" });
  }
  return [...seen.values()];
}

/** Tokens that can never resolve: unknown kinds, {field} without a UID, qualifiers on non-term kinds. */
export function invalidTokens(pattern: string): string[] {
  return tokensIn(pattern)
    .filter((token) => {
      if (!(token.kind in TOKENS)) return true;
      if (token.kind === "field") return !token.qualifier;
      if (RULE_KINDS.includes(token.kind as TokenKind)) return !!token.qualifier;
      if (token.qualifier) return !TERM_KINDS.includes(token.kind as TokenKind);
      return false;
    })
    .map((token) => token.raw);
}

/** Every valid term reference in a taxonomy field's value, in stored order. */
export function termRefs(value: unknown): TermRef[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is TermRef =>
      !!item && typeof item.taxonomy_uid === "string" && typeof item.term_uid === "string"
  );
}

/** The term that the unqualified {term} tokens use. */
export function primaryTerm(refs: TermRef[], taxonomyUid: string): TermRef | null {
  return taxonomyUid ? refs.find((ref) => ref.taxonomy_uid === taxonomyUid) ?? null : refs[0] ?? null;
}

/** Picks the pattern for this entry: the first matching rule, else the fallback pattern. */
export function selectPattern(
  config: TaxonomyUrlConfig,
  refs: TermRef[]
): { pattern: string; label: string | null; matched: TermRef | null } {
  for (const rule of config.rules) {
    const wanted = Array.isArray(rule.when.term) ? rule.when.term : [rule.when.term];
    const hit = refs.find((ref) => ref.taxonomy_uid === rule.when.taxonomy && wanted.includes(ref.term_uid));
    if (hit) return { pattern: rule.pattern, label: rule.label ?? `${rule.when.taxonomy}: ${hit.term_uid}`, matched: hit };
  }
  if (config.pattern) return { pattern: config.pattern, label: config.rules.length ? "default" : null, matched: null };
  return { pattern: "", label: null, matched: null };
}

export interface TermNeed {
  /** The token qualifier: "" for the primary term, else a taxonomy UID or a parent term UID. */
  key: string;
  withTaxonomyName: boolean;
  withPath: boolean;
}

/** Which term slots the pattern needs, and how much of each to fetch. */
export function termNeeds(pattern: string): TermNeed[] {
  const needs = new Map<string, TermNeed>();
  for (const token of tokensIn(pattern)) {
    const isRule = RULE_KINDS.includes(token.kind as TokenKind);
    if (!isRule && !TERM_KINDS.includes(token.kind as TokenKind)) continue;
    const key = isRule ? RULE_SLOT : token.qualifier;
    const need = needs.get(key) ?? { key, withTaxonomyName: false, withPath: false };
    if (token.kind === "taxonomy") need.withTaxonomyName = true;
    if (token.kind === "term_path" || token.kind === "rule_term_path") need.withPath = true;
    needs.set(key, need);
  }
  return [...needs.values()];
}

/** The tagged term a qualifier refers to when it names a taxonomy UID (first term of that taxonomy), else null. */
export function refForTaxonomy(refs: TermRef[], taxonomyUid: string): TermRef | null {
  return refs.find((ref) => ref.taxonomy_uid === taxonomyUid) ?? null;
}

/**
 * The tagged term a qualifier refers to when it names a parent term: the
 * first resolved term whose ancestor chain contains that UID. The path is
 * cut to the segments below that ancestor, so {term_path:franchise} on
 * activision › franchise › halo › infinite gives halo/infinite.
 */
export function termUnder(resolved: ResolvedTerm[], ancestorUid: string): ResolvedTerm | null {
  for (const term of resolved) {
    const index = term.pathUids.indexOf(ancestorUid);
    if (index >= 0 && index < term.pathUids.length - 1) {
      return { ...term, path: term.path.slice(index + 1), pathUids: term.pathUids.slice(index + 1) };
    }
  }
  return null;
}

/** Slug values for every token in the pattern, keyed by the raw token text. Empty string means "not available". */
export function tokenValues(
  pattern: string,
  terms: Record<string, ResolvedTerm | null>,
  entry: Record<string, unknown>,
  config: TaxonomyUrlConfig,
  locale: string
): Record<string, string> {
  const values: Record<string, string> = {};
  const field = (uid: string): string => (typeof entry[uid] === "string" ? slugify(entry[uid] as string) : "");
  for (const token of tokensIn(pattern)) {
    const isRule = RULE_KINDS.includes(token.kind as TokenKind);
    const term = terms[isRule ? RULE_SLOT : token.qualifier] ?? null;
    let value = "";
    switch (token.kind) {
      case "term":
      case "rule_term":
        value = term ? slugify(term.termName) || slugify(term.termUid) : "";
        break;
      case "term_path":
      case "rule_term_path":
        value = term ? term.path.map(slugify).filter(Boolean).join("/") : "";
        break;
      case "term_uid":
        value = term ? slugify(term.termUid) : "";
        break;
      case "taxonomy":
        value = term ? slugify(term.taxonomyName) || slugify(term.taxonomyUid) : "";
        break;
      case "taxonomy_uid":
        value = term ? slugify(term.taxonomyUid) : "";
        break;
      case "title":
        value = field(config.titleFieldUid);
        break;
      case "field":
        value = field(token.qualifier);
        break;
      case "locale":
        value = slugify(locale);
        break;
    }
    values[token.raw] = value;
  }
  return values;
}

/**
 * Fills the pattern and normalises the result to a clean path: single leading
 * slash, no trailing slash, no empty segments. Returns the URL and the tokens
 * that had no value; when any are missing the URL should not be written.
 */
export function composeUrl(pattern: string, values: Record<string, string>): { url: string; missing: string[] } {
  const missing: string[] = [];
  const filled = pattern.replace(TOKEN_PATTERN, (raw: string) => {
    const value = values[raw] ?? "";
    if (!value && !missing.includes(raw)) missing.push(raw);
    return value;
  });
  const segments = filled
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  return { url: "/" + segments.join("/"), missing };
}

/** Plain-language reason a token has no value yet, for the "URL not generated" warning. */
export function describeMissing(raw: string, config: TaxonomyUrlConfig): string {
  const parsed = tokensIn(raw)[0];
  if (!parsed) return raw;
  const q = parsed.qualifier;
  switch (parsed.kind) {
    case "term":
    case "term_path":
    case "term_uid":
    case "taxonomy":
    case "taxonomy_uid":
      if (q) return `a term under "${q}" (or from a taxonomy with that UID)`;
      return config.taxonomyUid ? `a term from taxonomy "${config.taxonomyUid}"` : "a taxonomy term";
    case "rule_term":
    case "rule_term_path":
      return "a term that matches one of the rules";
    case "title":
      return `the "${config.titleFieldUid}" field`;
    case "field":
      return `the "${q}" field`;
    case "locale":
      return "the entry locale";
    default:
      return raw;
  }
}
