import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { client } from "@contentstack/management";
import styles from "./TaxonomyUrl.module.css";
import { useAppSdk } from "../../common/hooks/useAppSdk";
import { useCurrentBranch } from "../../common/hooks/useCurrentBranch";
import { TermSource, friendlyApiError, resolveTerm } from "./api";
import { ResolvedTerm, TaxonomyUrlConfig, UrlBreakdown } from "./types";
import { TOKENS, composeUrl, readConfig, selectTerm, tokenValues, tokensIn, unknownTokens } from "./url";

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
  term: null,
  termCount: 0,
  title: "",
  currentUrl: "",
  composedUrl: "",
  missing: [],
};

/**
 * "Taxonomy URL" — a custom field that keeps the entry's URL field in step
 * with the taxonomy term the editor picks: /{term}/{title} by default, with
 * the pattern configurable per field instance.
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
  const badTokens = useMemo(() => unknownTokens(config.pattern), [config.pattern]);

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
      const title = typeof data[config.titleFieldUid] === "string" ? (data[config.titleFieldUid] as string) : "";
      const currentUrl = typeof data[config.urlFieldUid] === "string" ? (data[config.urlFieldUid] as string) : "";
      const { term: ref, count } = selectTerm(data[config.taxonomyFieldUid], config.taxonomyUid);
      const tokens = tokensIn(config.pattern);

      let term: ResolvedTerm | null = null;
      if (ref) {
        const withTaxonomyName = tokens.includes("taxonomy");
        const withPath = tokens.includes("term_path");
        const key = [ref.taxonomy_uid, ref.term_uid, locale, withTaxonomyName, withPath].join("|");
        let pending = termCache.current.get(key);
        if (!pending) {
          pending = resolveTerm(termSource, ref, { locale, withTaxonomyName, withPath });
          termCache.current.set(key, pending);
          pending.catch(() => termCache.current.delete(key));
        }
        try {
          term = await pending;
          if (seq === runSeq.current) setError("");
        } catch (e) {
          if (seq === runSeq.current) setError(friendlyApiError(e));
        }
      }
      if (seq !== runSeq.current) return;

      const { url, missing } = composeUrl(config.pattern, tokenValues(term, title, locale));
      const composedUrl = missing.length ? "" : url;
      setBreakdown({ locale, term, termCount: count, title, currentUrl, composedUrl, missing });

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

  const term = breakdown.term;

  return (
    <div className={styles.shell}>
      <div className={styles.header}>
        <span className={styles.mono}>{config.pattern}</span>
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
          Unknown token{badTokens.length > 1 ? "s" : ""} in pattern: {badTokens.map((t) => `{${t}}`).join(", ")}.
          Known tokens: {Object.keys(TOKENS).map((t) => `{${t}}`).join(", ")}.
        </div>
      )}

      <dl className={styles.grid}>
        <dt>Term</dt>
        <dd>
          {term ? (
            <>
              <span>{term.termName}</span>
              <span className={styles.muted}> · {term.taxonomyName || term.taxonomyUid}</span>
              {term.path.length > 1 && <div className={styles.muted}>{term.path.join(" › ")}</div>}
            </>
          ) : (
            <span className={styles.muted}>
              {breakdown.termCount === 0
                ? `none selected in "${config.taxonomyFieldUid}"`
                : `no term from taxonomy "${config.taxonomyUid}"`}
            </span>
          )}
          {breakdown.termCount > 1 && term && (
            <div className={styles.muted}>
              {breakdown.termCount} terms tagged; using {config.taxonomyUid ? `taxonomy "${config.taxonomyUid}"` : "the first"}.
            </div>
          )}
        </dd>

        <dt>Title</dt>
        <dd>{breakdown.title || <span className={styles.muted}>empty</span>}</dd>

        <dt>Current URL</dt>
        <dd className={styles.mono}>{breakdown.currentUrl || <span className={styles.muted}>empty</span>}</dd>

        <dt>Composed URL</dt>
        <dd className={`${styles.mono} ${styles.strong}`}>
          {breakdown.composedUrl || <span className={styles.muted}>—</span>}
        </dd>
      </dl>

      {breakdown.missing.length > 0 && (
        <p className={styles.hint}>
          Waiting for {breakdown.missing.map((t) => `{${t}}`).join(", ")} before building the URL.
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
        <p className={styles.hint}>URL is up to date{lastWrite === breakdown.currentUrl ? " (written by this field)" : ""}.</p>
      )}

      {error && <div className={`${styles.banner} ${styles.bannerError}`}>{error}</div>}
    </div>
  );
};

export default TaxonomyUrl;
