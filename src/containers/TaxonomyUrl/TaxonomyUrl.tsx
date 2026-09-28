import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { client } from "@contentstack/management";
import styles from "./TaxonomyUrl.module.css";
import { useAppSdk } from "../../common/hooks/useAppSdk";
import { useCurrentBranch } from "../../common/hooks/useCurrentBranch";
import { TermSource, friendlyApiError, resolveTerm } from "./api";
import { ResolvedTerm, TaxonomyUrlConfig, UrlBreakdown } from "./types";
import {
  TOKENS,
  composeUrl,
  invalidTokens,
  readConfig,
  selectPattern,
  termNeeds,
  termRefs,
  tokenValues,
} from "./url";

type EntryData = Record<string, unknown>;

/** The parts of the App SDK's CustomField location this app touches. */
interface CustomFieldHandle {
  fieldConfig?: unknown;
  frame: { enableAutoResizing(): void };
  entry: {
    locale?: string;
    getData(): EntryData;
    onChange(callback: (data: EntryData) => void): void;
    getField(uid: string): { setData(data: unknown): Promise<unknown> };
  };
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

  const [autoSync, setAutoSync] = useState(config.autoSync);
  const autoSyncRef = useRef(autoSync);
  autoSyncRef.current = autoSync;
  useEffect(() => setAutoSync(config.autoSync), [config.autoSync]);

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
      const { pattern, label } = selectPattern(config, refs);

      if (!pattern) {
        setBreakdown({ ...EMPTY, locale, tagged: refs, currentUrl });
        return;
      }

      // Resolve every term the pattern needs, sharing one cached promise per
      // term/locale/detail-level so repeated change events cost nothing.
      const needs = termNeeds(pattern, refs, config.taxonomyUid);
      const terms: Record<string, ResolvedTerm | null> = {};
      const failures: string[] = [];
      await Promise.all(
        needs.map(async (need) => {
          terms[need.key] = null;
          if (!need.ref) return;
          const key = [need.ref.taxonomy_uid, need.ref.term_uid, locale, need.withTaxonomyName, need.withPath].join("|");
          let pending = termCache.current.get(key);
          if (!pending) {
            pending = resolveTerm(termSource, need.ref, {
              locale,
              withTaxonomyName: need.withTaxonomyName,
              withPath: need.withPath,
            });
            termCache.current.set(key, pending);
            pending.catch(() => termCache.current.delete(key));
          }
          try {
            terms[need.key] = await pending;
          } catch (e) {
            failures.push(friendlyApiError(e));
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
    customField.frame.enableAutoResizing();
    void recomputeRef.current(customField.entry.getData());
    customField.entry.onChange((data) => void recomputeRef.current(data));
  }, [customField]);

  if (!appSdk) {
    return <div className={styles.shell}>Loading…</div>;
  }
  if (!customField) {
    return <div className={styles.shell}>This app only runs as a custom field.</div>;
  }

  const termEntries = Object.entries(breakdown.terms);

  return (
    <div className={styles.shell}>
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
              setAutoSync(event.target.checked);
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
              <dt>{key || (config.taxonomyUid ? config.taxonomyUid : "term")}</dt>
              <dd>
                {term ? (
                  <>
                    <span>{term.termName}</span>
                    {!key && <span className={styles.muted}> · {term.taxonomyName || term.taxonomyUid}</span>}
                    {term.path.length > 1 && <div className={styles.muted}>{term.path.join(" › ")}</div>}
                  </>
                ) : (
                  <span className={styles.muted}>no term from this taxonomy</span>
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
        <p className={styles.hint}>Waiting for {breakdown.missing.join(", ")} before building the URL.</p>
      )}

      {!breakdown.pattern && config.rules.length > 0 && (
        <p className={styles.hint}>
          No rule matched the entry&apos;s terms and no fallback pattern is set, so the URL is left alone. Each
          rule&apos;s <span className={styles.mono}>when</span> must name a taxonomy UID and term UID exactly as
          listed above.
        </p>
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
        <p className={styles.hint}>
          URL is up to date{lastWrite === breakdown.currentUrl ? " (written by this field)" : ""}.
        </p>
      )}

      {error && <div className={`${styles.banner} ${styles.bannerError}`}>{error}</div>}
    </div>
  );
};

export default TaxonomyUrl;
