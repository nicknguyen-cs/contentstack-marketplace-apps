/**
 * Pure helpers for the Taxonomy URL field. Nothing in this file touches
 * Contentstack or React, so every function can be unit tested with plain
 * objects.
 *
 * Sections, in the order a URL is built:
 *   1. Configuration     turn the admin's JSON into a TaxonomyUrlConfig
 *   2. Tokens            what "{term:season}" means, and how to find tokens in a pattern
 *   3. Tags              read the entry's taxonomy field
 *   4. Choosing a pattern  which rule applies to this entry
 *   5. Finding terms     which tagged term each token refers to
 *   6. Composing the URL turn resolved values into "/patch-notes/season-3/my-title"
 *   7. Messages          plain-language text for the field's warnings
 */

import { ResolvedTerm, TaxonomyUrlConfig, TermRef, UrlRule } from "./types";

/* -------------------------------------------------------------------------- */
/*  1. Configuration                                                          */
/* -------------------------------------------------------------------------- */

/** Used when the field has no config at all: one segment for the term, one for the title. */
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
 * Turns the raw "config" JSON from the content type builder into a
 * TaxonomyUrlConfig, filling in defaults and dropping anything malformed.
 *
 * Two things worth knowing:
 * - Text settings that are missing or blank fall back to the default, except
 *   `taxonomyUid`, where blank is a real value meaning "first tagged term".
 * - With rules present, a missing `pattern` means "no fallback": the URL is
 *   left alone unless a rule matches. Without rules, DEFAULT_PATTERN applies.
 */
export function readConfig(raw: unknown): TaxonomyUrlConfig {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const readText = (
    key: "taxonomyFieldUid" | "taxonomyUid" | "titleFieldUid" | "urlFieldUid",
    blankIsValid = false
  ): string => {
    const value = source[key];
    if (typeof value !== "string") return DEFAULT_CONFIG[key];
    const trimmed = value.trim();
    if (trimmed) return trimmed;
    return blankIsValid ? "" : DEFAULT_CONFIG[key];
  };

  const rules = readRules(source.rules);
  const explicitPattern = typeof source.pattern === "string" ? source.pattern.trim() : "";

  return {
    pattern: explicitPattern || (rules.length > 0 ? "" : DEFAULT_PATTERN),
    rules,
    taxonomyFieldUid: readText("taxonomyFieldUid"),
    taxonomyUid: readText("taxonomyUid", true),
    titleFieldUid: readText("titleFieldUid"),
    urlFieldUid: readText("urlFieldUid"),
    autoSync: typeof source.autoSync === "boolean" ? source.autoSync : DEFAULT_CONFIG.autoSync,
  };
}

/**
 * Reads the `rules` array. A rule is kept only if it has a taxonomy UID, at
 * least one term UID and a pattern; anything else is silently skipped so one
 * typo doesn't break the whole config.
 */
function readRules(raw: unknown): UrlRule[] {
  if (!Array.isArray(raw)) return [];

  const rules: UrlRule[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const when = (record.when && typeof record.when === "object" ? record.when : {}) as Record<string, unknown>;

    const taxonomy = typeof when.taxonomy === "string" ? when.taxonomy.trim() : "";
    const termOrTerms = Array.isArray(when.term) ? when.term : [when.term];
    const terms = termOrTerms.filter((t): t is string => typeof t === "string" && t.trim() !== "");
    const pattern = typeof record.pattern === "string" ? record.pattern.trim() : "";
    const label = typeof record.label === "string" ? record.label.trim() : "";

    if (!taxonomy || terms.length === 0 || !pattern) continue;

    rules.push({
      when: { taxonomy, term: terms.length === 1 ? terms[0] : terms },
      pattern,
      ...(label ? { label } : {}),
    });
  }
  return rules;
}

/* -------------------------------------------------------------------------- */
/*  2. Tokens                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Every token kind a pattern may contain, with a short description (shown in
 * the field when an admin uses an unknown token).
 *
 * A token looks like {kind} or {kind:qualifier}. The qualifier is allowed on:
 * - term kinds, where it names a taxonomy UID or a parent term UID
 *   ({term:season} = "the tagged term under season");
 * - {field:uid}, where it is required and names an entry field.
 * It is not allowed on {rule_term}, {title} or {locale}.
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

/** Kinds that read a tagged term chosen by the token's qualifier. */
const TERM_KINDS: TokenKind[] = ["term", "term_path", "term_uid", "taxonomy", "taxonomy_uid"];

/** Kinds that read the term the rule matched on, regardless of qualifier. */
const RULE_KINDS: TokenKind[] = ["rule_term", "rule_term_path"];

/**
 * Internal key under which the rule's own term is stored in the resolved
 * terms map, next to the qualifier-keyed ones. "@" cannot appear in a real
 * qualifier, so it can't collide.
 */
export const RULE_SLOT = "@rule";

/** Matches "{kind}" and "{kind:qualifier}". Group 1 = kind, group 2 = qualifier. */
const TOKEN_PATTERN = /\{([a-z_]+)(?::([a-zA-Z0-9_-]+))?\}/g;

export interface ParsedToken {
  /** The token exactly as written, e.g. "{term:season}". Used as a lookup key. */
  raw: string;
  /** e.g. "term". Not validated here; see invalidTokens(). */
  kind: string;
  /** e.g. "season", or "" when the token has none. */
  qualifier: string;
}

function isTermKind(kind: string): boolean {
  return TERM_KINDS.includes(kind as TokenKind);
}

function isRuleKind(kind: string): boolean {
  return RULE_KINDS.includes(kind as TokenKind);
}

/** The distinct tokens in a pattern, in order of first appearance. */
export function tokensIn(pattern: string): ParsedToken[] {
  const seen = new Map<string, ParsedToken>();
  for (const match of pattern.matchAll(TOKEN_PATTERN)) {
    const [raw, kind, qualifier = ""] = match;
    if (!seen.has(raw)) seen.set(raw, { raw, kind, qualifier });
  }
  return [...seen.values()];
}

/**
 * Tokens that can never produce a value, so the admin should fix the config:
 * an unknown kind, {field} without a field UID, or a qualifier on a kind
 * that doesn't take one.
 */
export function invalidTokens(pattern: string): string[] {
  const invalid: string[] = [];
  for (const token of tokensIn(pattern)) {
    const knownKind = token.kind in TOKENS;
    const fieldWithoutUid = token.kind === "field" && !token.qualifier;
    const qualifierNotAllowed = token.qualifier !== "" && !isTermKind(token.kind) && token.kind !== "field";
    if (!knownKind || fieldWithoutUid || qualifierNotAllowed) invalid.push(token.raw);
  }
  return invalid;
}

/* -------------------------------------------------------------------------- */
/*  3. Tags                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The entry's taxonomy field value is an array of { taxonomy_uid, term_uid }.
 * This returns the well-formed items, in the order Contentstack stored them.
 */
export function termRefs(fieldValue: unknown): TermRef[] {
  if (!Array.isArray(fieldValue)) return [];
  return fieldValue.filter(
    (item): item is TermRef =>
      !!item && typeof item.taxonomy_uid === "string" && typeof item.term_uid === "string"
  );
}

/* -------------------------------------------------------------------------- */
/*  4. Choosing a pattern                                                     */
/* -------------------------------------------------------------------------- */

export interface PatternChoice {
  /** The URL template to use, or "" when nothing applies. */
  pattern: string;
  /** Text for the field header: the rule's label, "default", or null. */
  label: string | null;
  /** The tag that matched the rule (what {rule_term} expands to), or null for the fallback pattern. */
  matched: TermRef | null;
}

/**
 * Walks the rules in order and returns the first whose term is tagged on the
 * entry. Falls back to `config.pattern` when no rule matches; that may be ""
 * (see readConfig), in which case the caller leaves the URL alone.
 */
export function selectPattern(config: TaxonomyUrlConfig, tags: TermRef[]): PatternChoice {
  for (const rule of config.rules) {
    const acceptedTerms = Array.isArray(rule.when.term) ? rule.when.term : [rule.when.term];
    const matched = tags.find(
      (tag) => tag.taxonomy_uid === rule.when.taxonomy && acceptedTerms.includes(tag.term_uid)
    );
    if (matched) {
      return {
        pattern: rule.pattern,
        label: rule.label ?? `${rule.when.taxonomy}: ${matched.term_uid}`,
        matched,
      };
    }
  }

  if (config.pattern) {
    // Only call it "default" when there were rules to fall back from.
    return { pattern: config.pattern, label: config.rules.length > 0 ? "default" : null, matched: null };
  }
  return { pattern: "", label: null, matched: null };
}

/* -------------------------------------------------------------------------- */
/*  5. Finding terms                                                          */
/* -------------------------------------------------------------------------- */

/**
 * One "slot" in a pattern that must be filled with a tagged term. A pattern
 * like "/{rule_term}/{term:season}/{term_path:season}" has two slots:
 * RULE_SLOT and "season" (the two season tokens share a slot).
 */
export interface TermNeed {
  /** RULE_SLOT, "" for the unqualified {term}, or the qualifier text. */
  key: string;
  /** True when a {taxonomy} token needs the taxonomy's display name fetched. */
  withTaxonomyName: boolean;
  /** True when a {term_path} token needs the ancestor chain fetched. */
  withPath: boolean;
}

/** Lists the term slots a pattern needs and how much detail each must carry. */
export function termNeeds(pattern: string): TermNeed[] {
  const needs = new Map<string, TermNeed>();

  for (const token of tokensIn(pattern)) {
    const ruleToken = isRuleKind(token.kind);
    if (!ruleToken && !isTermKind(token.kind)) continue; // {title}, {field}, {locale} need no term

    const key = ruleToken ? RULE_SLOT : token.qualifier;
    const need = needs.get(key) ?? { key, withTaxonomyName: false, withPath: false };
    if (token.kind === "taxonomy") need.withTaxonomyName = true;
    if (token.kind === "term_path" || token.kind === "rule_term_path") need.withPath = true;
    needs.set(key, need);
  }

  return [...needs.values()];
}

/**
 * The unqualified {term}: the first tag from `config.taxonomyUid`, or the
 * first tag of all when that setting is blank.
 */
export function primaryTerm(tags: TermRef[], taxonomyUid: string): TermRef | null {
  if (taxonomyUid) return refForTaxonomy(tags, taxonomyUid);
  return tags[0] ?? null;
}

/** The first tag from the given taxonomy, or null when the entry has none from it. */
export function refForTaxonomy(tags: TermRef[], taxonomyUid: string): TermRef | null {
  return tags.find((tag) => tag.taxonomy_uid === taxonomyUid) ?? null;
}

/**
 * Looks up a qualifier as a *parent term* rather than a taxonomy: returns the
 * first resolved term whose ancestor chain contains `ancestorUid`.
 *
 * The returned copy has its `path` cut to the part below that ancestor, so
 * for a term at   season › 2024 › season_3
 * {term_path:season} gives "2024/season-3" rather than "season/2024/season-3".
 *
 * Requires terms resolved with their ancestor chains (withPath = true).
 */
export function termUnder(resolved: ResolvedTerm[], ancestorUid: string): ResolvedTerm | null {
  for (const term of resolved) {
    const position = term.pathUids.indexOf(ancestorUid);
    const isAnAncestor = position >= 0 && position < term.pathUids.length - 1; // not the term itself
    if (isAnAncestor) {
      return {
        ...term,
        path: term.path.slice(position + 1),
        pathUids: term.pathUids.slice(position + 1),
      };
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  6. Composing the URL                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Makes text safe for a URL segment: "Season 3: Reloaded!" -> "season-3-reloaded".
 * Accented letters are reduced to their base letter first ("é" -> "e").
 */
export function slugify(text: string): string {
  return (text ?? "")
    .normalize("NFD") // split "é" into "e" + combining accent
    .replace(/[̀-ͯ]/g, "") // drop the combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // any run of other characters becomes one hyphen
    .replace(/^-+|-+$/g, ""); // no leading or trailing hyphens
}

/**
 * Produces the slug for every token in the pattern, keyed by the token's raw
 * text. An empty string means "no value yet" and blocks the URL from being
 * written (see composeUrl).
 *
 * `terms` is keyed the same way as TermNeed.key (see termNeeds).
 */
export function tokenValues(
  pattern: string,
  terms: Record<string, ResolvedTerm | null>,
  entry: Record<string, unknown>,
  config: TaxonomyUrlConfig,
  locale: string
): Record<string, string> {
  const fieldSlug = (uid: string): string => (typeof entry[uid] === "string" ? slugify(entry[uid] as string) : "");

  const values: Record<string, string> = {};
  for (const token of tokensIn(pattern)) {
    const slotKey = isRuleKind(token.kind) ? RULE_SLOT : token.qualifier;
    const term = terms[slotKey] ?? null;

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
        value = fieldSlug(config.titleFieldUid);
        break;
      case "field":
        value = fieldSlug(token.qualifier);
        break;
      case "locale":
        value = slugify(locale);
        break;
      // Unknown kinds keep value = "" and are reported by invalidTokens().
    }
    values[token.raw] = value;
  }
  return values;
}

export interface ComposedUrl {
  /** The finished path, e.g. "/patch-notes/season-3/my-title". Only meaningful when `missing` is empty. */
  url: string;
  /** Raw tokens that had no value. When non-empty the URL must not be written. */
  missing: string[];
}

/**
 * Substitutes token values into the pattern and tidies the result into a
 * clean path: exactly one leading slash, no trailing slash, no empty
 * segments (so "/blog//{title}/" still gives "/blog/my-title").
 */
export function composeUrl(pattern: string, values: Record<string, string>): ComposedUrl {
  const missing: string[] = [];

  const filled = pattern.replace(TOKEN_PATTERN, (rawToken: string) => {
    const value = values[rawToken] ?? "";
    if (!value && !missing.includes(rawToken)) missing.push(rawToken);
    return value;
  });

  const segments = filled
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  return { url: "/" + segments.join("/"), missing };
}

/* -------------------------------------------------------------------------- */
/*  7. Messages                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Explains, in plain words, what an editor must add for a token to get a
 * value. Used by the "URL not generated yet" warning.
 *   "{term:season}"  -> 'a term under "season" (or from a taxonomy with that UID)'
 *   "{title}"        -> 'the "title" field'
 */
export function describeMissing(rawToken: string, config: TaxonomyUrlConfig): string {
  const token = tokensIn(rawToken)[0];
  if (!token) return rawToken;

  if (isTermKind(token.kind)) {
    if (token.qualifier) return `a term under "${token.qualifier}" (or from a taxonomy with that UID)`;
    if (config.taxonomyUid) return `a term from taxonomy "${config.taxonomyUid}"`;
    return "a taxonomy term";
  }
  if (isRuleKind(token.kind)) return "a term that matches one of the rules";

  switch (token.kind) {
    case "title":
      return `the "${config.titleFieldUid}" field`;
    case "field":
      return `the "${token.qualifier}" field`;
    case "locale":
      return "the entry locale";
    default:
      return rawToken;
  }
}
