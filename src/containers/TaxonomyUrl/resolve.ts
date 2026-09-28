/**
 * Builds the URL for one entry. This is the heart of the field, kept out of
 * the React component so it can be read and tested on its own.
 *
 * Given the entry's data and the field config, `buildUrl` does the following:
 *
 *   1. Read the tags from the entry's taxonomy field.
 *   2. Pick a pattern: the first rule whose term is tagged, else the fallback.
 *   3. Work out which tagged term each token in the pattern refers to.
 *   4. Fetch those terms' display names (through the cache, so repeated
 *      keystrokes cost nothing).
 *   5. Fill the pattern and tidy the result into a path.
 *
 * It returns a UrlBreakdown for the UI plus any API errors that occurred. It
 * never writes anything; the component decides whether to update the entry.
 */

import { TermSource, friendlyApiError, resolveTerm } from "./api";
import { ResolvedTerm, TaxonomyUrlConfig, TermRef, UrlBreakdown } from "./types";
import {
  RULE_SLOT,
  composeUrl,
  primaryTerm,
  refForTaxonomy,
  selectPattern,
  termNeeds,
  termRefs,
  termUnder,
  tokenValues,
} from "./url";

/* -------------------------------------------------------------------------- */
/*  Cache                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Remembers every term lookup for the life of the field. The key includes
 * the locale and the level of detail requested, so a term fetched with its
 * ancestor chain is stored separately from the same term fetched without.
 *
 * Promises are cached rather than results, so two tokens that need the same
 * term at the same moment share one request. A failed lookup is removed so
 * the next change event retries it.
 */
export class TermCache {
  private readonly pending = new Map<string, Promise<ResolvedTerm>>();

  constructor(private readonly source: TermSource) {}

  get(ref: TermRef, locale: string, withTaxonomyName: boolean, withPath: boolean): Promise<ResolvedTerm> {
    const key = [ref.taxonomy_uid, ref.term_uid, locale, withTaxonomyName, withPath].join("|");

    let promise = this.pending.get(key);
    if (!promise) {
      promise = resolveTerm(this.source, ref, { locale, withTaxonomyName, withPath });
      this.pending.set(key, promise);
      promise.catch(() => this.pending.delete(key));
    }
    return promise;
  }
}

/* -------------------------------------------------------------------------- */
/*  Building the URL                                                          */
/* -------------------------------------------------------------------------- */

export interface BuildUrlInput {
  config: TaxonomyUrlConfig;
  /** The entry as the editor currently has it (unsaved changes included). */
  entry: Record<string, unknown>;
  /** Locale of the entry being edited. */
  locale: string;
  cache: TermCache;
}

export interface BuildUrlResult {
  breakdown: UrlBreakdown;
  /** Messages from failed term lookups. Empty when everything resolved. */
  errors: string[];
}

export async function buildUrl({ config, entry, locale, cache }: BuildUrlInput): Promise<BuildUrlResult> {
  const currentUrl = typeof entry[config.urlFieldUid] === "string" ? (entry[config.urlFieldUid] as string) : "";
  const tags = termRefs(entry[config.taxonomyFieldUid]);

  // Step 2: which pattern applies to this entry?
  const choice = selectPattern(config, tags);
  if (!choice.pattern) {
    // No rule matched and no fallback configured. Show the tags so the admin
    // can see which UIDs their rules should name.
    return {
      breakdown: {
        locale,
        ruleLabel: null,
        pattern: "",
        terms: {},
        tagged: tags,
        currentUrl,
        composedUrl: "",
        missing: [],
      },
      errors: [],
    };
  }

  // Steps 3 and 4: find and fetch the term for each slot in the pattern.
  const errors: string[] = [];
  const lookup = async (ref: TermRef, withTaxonomyName: boolean, withPath: boolean): Promise<ResolvedTerm | null> => {
    try {
      return await cache.get(ref, locale, withTaxonomyName, withPath);
    } catch (error) {
      errors.push(friendlyApiError(error));
      return null;
    }
  };

  // Parent-term lookups ({term:season} where "season" is a term, not a
  // taxonomy) need every tag resolved with its ancestor chain. That is done
  // at most once per pass and shared between such tokens.
  let allTagsWithAncestors: Promise<ResolvedTerm[]> | null = null;
  const tagsWithAncestors = (): Promise<ResolvedTerm[]> => {
    if (!allTagsWithAncestors) {
      allTagsWithAncestors = Promise.all(tags.map((tag) => lookup(tag, false, true))).then((list) =>
        list.filter((term): term is ResolvedTerm => term !== null)
      );
    }
    return allTagsWithAncestors;
  };

  const terms: Record<string, ResolvedTerm | null> = {};
  await Promise.all(
    termNeeds(choice.pattern).map(async (need) => {
      terms[need.key] = null;

      // First try the direct interpretations of the slot key.
      const directRef =
        need.key === RULE_SLOT
          ? choice.matched
          : need.key === ""
            ? primaryTerm(tags, config.taxonomyUid)
            : refForTaxonomy(tags, need.key);

      if (directRef) {
        terms[need.key] = await lookup(directRef, need.withTaxonomyName, need.withPath);
        return;
      }

      // A qualifier that is not a taxonomy UID is treated as a parent term UID.
      if (need.key === "" || need.key === RULE_SLOT) return;
      const underParent = termUnder(await tagsWithAncestors(), need.key);
      if (!underParent) return;

      if (need.withTaxonomyName) {
        // The ancestor pass skipped taxonomy names; fetch this one's now.
        const withName = await lookup({ taxonomy_uid: underParent.taxonomyUid, term_uid: underParent.termUid }, true, true);
        terms[need.key] = withName ? { ...underParent, taxonomyName: withName.taxonomyName } : underParent;
      } else {
        terms[need.key] = underParent;
      }
    })
  );

  // Step 5: fill the pattern.
  const values = tokenValues(choice.pattern, terms, entry, config, locale);
  const { url, missing } = composeUrl(choice.pattern, values);

  return {
    breakdown: {
      locale,
      ruleLabel: choice.label,
      pattern: choice.pattern,
      terms,
      tagged: tags,
      currentUrl,
      composedUrl: missing.length > 0 ? "" : url,
      missing,
    },
    errors,
  };
}
