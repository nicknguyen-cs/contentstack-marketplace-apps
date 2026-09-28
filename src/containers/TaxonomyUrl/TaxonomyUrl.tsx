import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { client } from "@contentstack/management";
import styles from "./TaxonomyUrl.module.css";
import { useAppSdk } from "../../common/hooks/useAppSdk";
import { useCurrentBranch } from "../../common/hooks/useCurrentBranch";
import { TermSource, friendlyApiError, resolveTerm } from "./api";
import { ResolvedTerm, TaxonomyUrlConfig, TermRef, UrlBreakdown } from "./types";
import {
  RULE_SLOT,
  TOKENS,
  composeUrl,
  describeMissing,
  invalidTokens,
  primaryTerm,
  readConfig,
  refForTaxonomy,
  selectPattern,
  termNeeds,
  termRefs,
  termUnder,
  tokenValues,
} from "./url";

type EntryData = Record<string, unknown>;

/** The parts of the App SDK's CustomField location this app touches. */
interface CustomFieldHandle {
  fieldConfig?: unknown;
  /** The custom field's own value. Holds the per-entry sync choice ("auto" | "manual"), saved with the entry. */
  field: { getData(): unknown; setData(data: unknown): Promise<unknown> };
  frame: {
    enableAutoResizing(): unknown;
    disableAutoResizing(): unknown;
    updateHeight(height?: number): Promise<void>;
  };
  entry: {
    locale?: string;
    getData(): EntryData;
    onChange(callback: (data: EntryData) => void): void;
    getField(uid: string): { setData(data: unknown): Promise<unknown> };
  };
}

type SyncChoice = "auto" | "manual";

/** The saved per-entry sync choice, if any. Anything else means "use the config default". */
function storedSyncChoice(customField: CustomFieldHandle | null): SyncChoice | null {
  let value: unknown;
  try {
    value = customField?.field.getData();
  } catch {
    return null;
  }
  return value === "auto" || value === "manual" ? value : null;
}

const EMPTY: UrlBreakdown = {
  locale: "",
  ruleLabel: null,
  pattern: "",
  terms: {},
  tagged: [],
  currentUrl: "",
  composedUrl: "",
  missing: [],
};

/**
 * "Taxonomy URL" — a custom field that keeps the entry's URL field in step
 * with the taxonomy terms the editor picks. One pattern by default
 * (/{term}/{title}), or an ordered list of rules keyed on a term so one
 * content type can carry several URL schemes.
 *
 * Term names are read through the Management SDK over the App SDK adapter,
 * which runs as the logged-in user. Results are cached per term and locale,
 * so typing in the title never triggers a request.
 */
const TaxonomyUrl: React.FC = () => {
  const appSdk = useAppSdk();
  const { branchUid } = useCurrentBranch();

  const customField = (appSdk?.location?.CustomField as unknown as CustomFieldHandle | null) ?? null;
  const config: TaxonomyUrlConfig = useMemo(() => readConfig(customField?.fieldConfig), [customField]);
  const badTokens = useMemo(() => {
    const all = [config.pattern, ...config.rules.map((rule) => rule.pattern)].flatMap(invalidTokens);
    return [...new Set(all)];
  }, [config]);

  const termSource: TermSource | null = useMemo(() => {
    if (!appSdk) return null;
    const stack = client({ adapter: appSdk.createAdapter(), host: appSdk.endpoints.CMA }).stack({
      api_key: appSdk.ids.apiKey,
      ...(branchUid ? { branch_uid: branchUid } : {}),
    });
    return stack as unknown as TermSource;
  }, [appSdk, branchUid]);

  // The toggle is stored in the custom field's own value so it survives a
  // reload and is saved with the entry; the config only supplies the default.
  const [autoSync, setAutoSync] = useState(config.autoSync);
  const autoSyncRef = useRef(autoSync);
  autoSyncRef.current = autoSync;
  useEffect(() => {
    const stored = storedSyncChoice(customField);
    setAutoSync(stored ? stored === "auto" : config.autoSync);
  }, [customField, config.autoSync]);

  const chooseSync = (enabled: boolean) => {
    setAutoSync(enabled);
    void customField?.field.setData(enabled ? "auto" : "manual").catch(() => undefined);
  };

  const [breakdown, setBreakdown] = useState<UrlBreakdown>(EMPTY);
  const [error, setError] = useState("");
  const [lastWrite, setLastWrite] = useState("");

  const termCache = useRef(new Map<string, Promise<ResolvedTerm>>());
  /** URL currently being written, so the onChange our own write triggers doesn't write again. */
  const inFlightRef = useRef<string | null>(null);
  const runSeq = useRef(0);

  const needsApply =
    breakdown.composedUrl !== "" && breakdown.missing.length === 0 && breakdown.composedUrl !== breakdown.currentUrl;

  const writeUrl = useCallback(
    async (url: string, currentUrl: string) => {
      if (!customField || !url || url === currentUrl || url === inFlightRef.current) return;
      inFlightRef.current = url;
      try {
        await customField.entry.getField(config.urlFieldUid).setData(url);
        setLastWrite(url);
        setError("");
      } catch (e) {
        setError(`Could not write "${config.urlFieldUid}": ${friendlyApiError(e)}`);
      } finally {
        inFlightRef.current = null;
      }
    },
    [customField, config.urlFieldUid]
  );

  const recompute = useCallback(
    async (data: EntryData) => {
      if (!customField || !termSource) return;
      const seq = ++runSeq.current;

      const locale = customField.entry.locale || (typeof data.locale === "string" ? data.locale : "");
      const currentUrl = typeof data[config.urlFieldUid] === "string" ? (data[config.urlFieldUid] as string) : "";
      const refs = termRefs(data[config.taxonomyFieldUid]);
      const { pattern, label, matched } = selectPattern(config, refs);

      if (!pattern) {
        setBreakdown({ ...EMPTY, locale, tagged: refs, currentUrl });
        return;
      }

      // Resolve every term the pattern needs, sharing one cached promise per
      // term/locale/detail-level so repeated change events cost nothing.
      const failures: string[] = [];
      const resolveCached = (ref: TermRef, withTaxonomyName: boolean, withPath: boolean) => {
        const key = [ref.taxonomy_uid, ref.term_uid, locale, withTaxonomyName, withPath].join("|");
        let pending = termCache.current.get(key);
        if (!pending) {
          pending = resolveTerm(termSource, ref, { locale, withTaxonomyName, withPath });
          termCache.current.set(key, pending);
          pending.catch(() => termCache.current.delete(key));
        }
        return pending.catch((e) => {
          failures.push(friendlyApiError(e));
          return null;
        });
      };

      const needs = termNeeds(pattern);
      const terms: Record<string, ResolvedTerm | null> = {};
      // Terms fetched with their ancestor chains, only when a qualifier names
      // a parent term rather than a taxonomy. Shared across such qualifiers.
      let withChains: Promise<ResolvedTerm[]> | null = null;
      const taggedWithChains = () => {
        withChains ??= Promise.all(refs.map((ref) => resolveCached(ref, false, true))).then((list) =>
          list.filter((term): term is ResolvedTerm => term !== null)
        );
        return withChains;
      };

      await Promise.all(
        needs.map(async (need) => {
          terms[need.key] = null;
          const ref =
            need.key === RULE_SLOT
              ? matched
              : need.key
                ? refForTaxonomy(refs, need.key)
                : primaryTerm(refs, config.taxonomyUid);
          if (ref) {
            terms[need.key] = await resolveCached(ref, need.withTaxonomyName, need.withPath);
            return;
          }
          if (!need.key || need.key === RULE_SLOT) return;
          // Not a taxonomy UID: treat the qualifier as a parent term UID.
          const under = termUnder(await taggedWithChains(), need.key);
          if (!under) return;
          if (need.withTaxonomyName) {
            const named = await resolveCached({ taxonomy_uid: under.taxonomyUid, term_uid: under.termUid }, true, true);
            terms[need.key] = named ? { ...under, taxonomyName: named.taxonomyName } : under;
          } else {
            terms[need.key] = under;
          }
        })
      );
      if (seq !== runSeq.current) return;
      setError(failures.join(" "));

      const { url, missing } = composeUrl(pattern, tokenValues(pattern, terms, data, config, locale));
      const composedUrl = missing.length ? "" : url;
      setBreakdown({ locale, ruleLabel: label, pattern, terms, tagged: refs, currentUrl, composedUrl, missing });

      if (autoSyncRef.current && composedUrl) void writeUrl(composedUrl, currentUrl);
    },
    [customField, termSource, config, writeUrl]
  );

  // entry.onChange has no off(), so subscribe exactly once and route every
  // event through a ref to the latest recompute.
  const recomputeRef = useRef(recompute);
  recomputeRef.current = recompute;
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!customField || subscribedRef.current) return;
    subscribedRef.current = true;
    void recomputeRef.current(customField.entry.getData());
    customField.entry.onChange((data) => void recomputeRef.current(data));
  }, [customField]);

  // Size the iframe from the content box, not the document. The SDK's own
  // auto-resize measures the document, which never shrinks below the frame's
  // current height, and MarketplaceAppProvider pushes a fixed 450px right
  // after init. Re-pushing shortly after mount wins over that.
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const shell = shellRef.current;
    if (!customField || !shell) return;
    customField.frame.disableAutoResizing();
    const push = () => {
      const height = Math.ceil(shell.getBoundingClientRect().height);
      if (height > 0) void customField.frame.updateHeight(height).catch(() => undefined);
    };
    const observer = new ResizeObserver(push);
    observer.observe(shell);
    push();
    const timers = [300, 1200].map((ms) => window.setTimeout(push, ms));
    return () => {
      observer.disconnect();
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [customField]);

  if (!appSdk) {
    return <div className={styles.shell}>Loading…</div>;
  }
  if (!customField) {
    return <div className={styles.shell}>This app only runs as a custom field.</div>;
  }

  const termEntries = Object.entries(breakdown.terms);

  return (
    <div className={styles.shell} ref={shellRef}>
      <div className={styles.header}>
        <span className={styles.mono}>
          {breakdown.pattern || <span className={styles.muted}>no pattern applies</span>}
          {breakdown.ruleLabel && <span className={styles.muted}> · {breakdown.ruleLabel}</span>}
        </span>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={autoSync}
            onChange={(event) => {
              chooseSync(event.target.checked);
              if (event.target.checked && breakdown.composedUrl) {
                void writeUrl(breakdown.composedUrl, breakdown.currentUrl);
              }
            }}
          />
          Keep URL in sync
        </label>
      </div>

      {badTokens.length > 0 && (
        <div className={`${styles.banner} ${styles.bannerError}`}>
          Invalid token{badTokens.length > 1 ? "s" : ""} in config: {badTokens.join(", ")}. Known tokens:{" "}
          {Object.keys(TOKENS)
            .map((t) => `{${t}}`)
            .join(", ")}
          ; term tokens take a taxonomy qualifier like {"{term:franchise}"}.
        </div>
      )}

      <dl className={styles.grid}>
        {termEntries.length === 0 ? (
          <>
            <dt>Tagged</dt>
            <dd>
              {breakdown.tagged.length === 0 ? (
                <span className={styles.muted}>no terms in &quot;{config.taxonomyFieldUid}&quot;</span>
              ) : (
                breakdown.tagged.map((ref) => (
                  <div key={`${ref.taxonomy_uid}/${ref.term_uid}`} className={styles.mono}>
                    {ref.taxonomy_uid} <span className={styles.muted}>›</span> {ref.term_uid}
                  </div>
                ))
              )}
            </dd>
          </>
        ) : (
          termEntries.map(([key, term]) => (
            <React.Fragment key={key || "__primary"}>
              <dt>{key === RULE_SLOT ? "rule term" : key || (config.taxonomyUid ? config.taxonomyUid : "term")}</dt>
              <dd>
                {term ? (
                  <>
                    <span>{term.termName}</span>
                    {!key && <span className={styles.muted}> · {term.taxonomyName || term.taxonomyUid}</span>}
                    {term.path.length > 1 && <div className={styles.muted}>{term.path.join(" › ")}</div>}
                  </>
                ) : (
                  <span className={styles.warnText}>not tagged yet</span>
                )}
              </dd>
            </React.Fragment>
          ))
        )}

        <dt>Current URL</dt>
        <dd className={styles.mono}>{breakdown.currentUrl || <span className={styles.muted}>empty</span>}</dd>

        <dt>Composed URL</dt>
        <dd className={`${styles.mono} ${styles.strong}`}>
          {breakdown.composedUrl || <span className={styles.muted}>—</span>}
        </dd>
      </dl>

      {breakdown.missing.length > 0 && (
        <div className={`${styles.banner} ${styles.bannerWarn}`}>
          <strong>URL not generated yet.</strong> This entry still needs:
          <ul className={styles.list}>
            {breakdown.missing.map((raw) => (
              <li key={raw}>
                {describeMissing(raw, config)} <span className={styles.mono}>{raw}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!breakdown.pattern && config.rules.length > 0 && (
        <div className={`${styles.banner} ${styles.bannerWarn}`}>
          No rule matched the entry&apos;s terms and no fallback pattern is set, so the URL is left alone. Each
          rule&apos;s <span className={styles.mono}>when</span> must name a taxonomy UID and term UID exactly as
          listed above.
        </div>
      )}

      {!autoSync && (
        <button
          type="button"
          className={styles.button}
          disabled={!needsApply}
          onClick={() => void writeUrl(breakdown.composedUrl, breakdown.currentUrl)}
        >
          Apply to {config.urlFieldUid}
        </button>
      )}

      {autoSync && breakdown.composedUrl && breakdown.composedUrl === breakdown.currentUrl && (
        <div className={styles.hint}>
          URL is up to date{lastWrite === breakdown.currentUrl ? " (written by this field)" : ""}.
        </div>
      )}

      {error && <div className={`${styles.banner} ${styles.bannerError}`}>{error}</div>}
    </div>
  );
};

export default TaxonomyUrl;
