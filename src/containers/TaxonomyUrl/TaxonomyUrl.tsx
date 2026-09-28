/**
 * Taxonomy URL: a Contentstack custom field that writes the entry's URL
 * field from the taxonomy terms the editor picks.
 *
 * How it fits together:
 *   - The admin configures a URL pattern (or a list of per-term rules) in the
 *     field's config JSON. See README.md for the options.
 *   - Whenever the entry changes, the field builds the URL for it (resolve.ts)
 *     and, if "Keep URL in sync" is on, writes it into the URL field through
 *     the App SDK. Editors can turn sync off per entry and apply manually.
 *   - The field's own value stores only that per-entry sync choice.
 *
 * This file is the React layer only. It is organised as:
 *   1. App SDK handle types      the few SDK members the field uses
 *   2. Small hooks               management client, sync choice, iframe height
 *   3. The component             state, the recompute loop, the write path
 *   4. Presentational pieces     header, term table, warnings
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { client } from "@contentstack/management";
import styles from "./TaxonomyUrl.module.css";
import { useAppSdk } from "../../common/hooks/useAppSdk";
import { useCurrentBranch } from "../../common/hooks/useCurrentBranch";
import { TermSource, friendlyApiError } from "./api";
import { TermCache, buildUrl } from "./resolve";
import { TaxonomyUrlConfig, UrlBreakdown } from "./types";
import { RULE_SLOT, TOKENS, describeMissing, invalidTokens, readConfig } from "./url";

/* -------------------------------------------------------------------------- */
/*  1. App SDK handle types                                                   */
/* -------------------------------------------------------------------------- */

type EntryData = Record<string, unknown>;

/**
 * The parts of `appSdk.location.CustomField` this field uses, typed locally
 * because the SDK's own types are loose in places.
 */
interface CustomFieldHandle {
  /** The "config" JSON from the content type builder. */
  fieldConfig?: unknown;
  /** The custom field's own value. Holds the per-entry sync choice. */
  field: {
    getData(): unknown;
    setData(data: unknown): Promise<unknown>;
  };
  /** Controls the iframe Contentstack renders the field in. */
  frame: {
    enableAutoResizing(): unknown;
    disableAutoResizing(): unknown;
    updateHeight(height?: number): Promise<void>;
  };
  /** The entry being edited. */
  entry: {
    locale?: string;
    /** The entry's current data, including unsaved edits. */
    getData(): EntryData;
    /** Fires on every edit to any field. There is no way to unsubscribe. */
    onChange(callback: (data: EntryData) => void): void;
    /** Access to a sibling field, used here to write the URL field. */
    getField(uid: string): { setData(data: unknown): Promise<unknown> };
  };
}

/** Stored in the custom field's value. Anything else means "use the config default". */
type SyncChoice = "auto" | "manual";

/* -------------------------------------------------------------------------- */
/*  2. Small hooks                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A Management SDK stack client that runs as the logged-in editor. It is
 * only used to read taxonomy terms (see api.ts).
 */
function useTermSource(): TermSource | null {
  const appSdk = useAppSdk();
  const { branchUid } = useCurrentBranch();

  return useMemo(() => {
    if (!appSdk) return null;
    const stack = client({ adapter: appSdk.createAdapter(), host: appSdk.endpoints.CMA }).stack({
      api_key: appSdk.ids.apiKey,
      ...(branchUid ? { branch_uid: branchUid } : {}),
    });
    return stack as unknown as TermSource;
  }, [appSdk, branchUid]);
}

/**
 * The "Keep URL in sync" toggle. The choice is written to the custom field's
 * own value, so it is saved with the entry and survives a reload. The config
 * only provides the default for entries that have not chosen yet.
 */
function useSyncChoice(customField: CustomFieldHandle | null, defaultValue: boolean) {
  const [autoSync, setAutoSync] = useState(defaultValue);

  // A ref mirror lets async code (the recompute loop) read the latest value
  // without being re-created every time it changes.
  const autoSyncRef = useRef(autoSync);
  autoSyncRef.current = autoSync;

  useEffect(() => {
    let stored: unknown;
    try {
      stored = customField?.field.getData();
    } catch {
      stored = undefined;
    }
    const choice: SyncChoice | null = stored === "auto" || stored === "manual" ? stored : null;
    setAutoSync(choice ? choice === "auto" : defaultValue);
  }, [customField, defaultValue]);

  const chooseSync = useCallback(
    (enabled: boolean) => {
      setAutoSync(enabled);
      void customField?.field.setData(enabled ? "auto" : "manual").catch(() => undefined);
    },
    [customField]
  );

  return { autoSync, autoSyncRef, chooseSync };
}

/**
 * Keeps the iframe exactly as tall as the field's content.
 *
 * Two things work against the SDK's built-in auto-resize here: this repo's
 * MarketplaceAppProvider pushes a fixed 450px right after the SDK starts, and
 * the built-in resizer measures the document, which can never be shorter than
 * the iframe it is in, so a tall frame stays tall. Measuring our own root
 * element avoids both. The delayed re-pushes make sure the last word is ours.
 */
function useFrameHeight(customField: CustomFieldHandle | null, shellRef: React.RefObject<HTMLDivElement>) {
  useEffect(() => {
    const shell = shellRef.current;
    if (!customField || !shell) return;

    customField.frame.disableAutoResizing();
    const pushHeight = () => {
      const height = Math.ceil(shell.getBoundingClientRect().height);
      if (height > 0) void customField.frame.updateHeight(height).catch(() => undefined);
    };

    const observer = new ResizeObserver(pushHeight);
    observer.observe(shell);
    pushHeight();
    const timers = [300, 1200].map((delay) => window.setTimeout(pushHeight, delay));

    return () => {
      observer.disconnect();
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [customField, shellRef]);
}

/* -------------------------------------------------------------------------- */
/*  3. The component                                                          */
/* -------------------------------------------------------------------------- */

const EMPTY_BREAKDOWN: UrlBreakdown = {
  locale: "",
  ruleLabel: null,
  pattern: "",
  terms: {},
  tagged: [],
  currentUrl: "",
  composedUrl: "",
  missing: [],
};

const TaxonomyUrl: React.FC = () => {
  const appSdk = useAppSdk();
  const termSource = useTermSource();
  const customField = (appSdk?.location?.CustomField as unknown as CustomFieldHandle | null) ?? null;

  // Config is fixed for the life of the field; it comes from the content type.
  const config: TaxonomyUrlConfig = useMemo(() => readConfig(customField?.fieldConfig), [customField]);
  const invalidConfigTokens = useMemo(() => {
    const allPatterns = [config.pattern, ...config.rules.map((rule) => rule.pattern)];
    return [...new Set(allPatterns.flatMap(invalidTokens))];
  }, [config]);

  const { autoSync, autoSyncRef, chooseSync } = useSyncChoice(customField, config.autoSync);

  const [breakdown, setBreakdown] = useState<UrlBreakdown>(EMPTY_BREAKDOWN);
  const [error, setError] = useState("");
  const [lastWrittenUrl, setLastWrittenUrl] = useState("");

  // One cache per management client, kept across renders.
  const cacheRef = useRef<TermCache | null>(null);
  if (termSource && !cacheRef.current) cacheRef.current = new TermCache(termSource);

  /* ---- Writing the URL field ------------------------------------------- */

  // The URL currently being written. Our own write triggers entry.onChange,
  // which would otherwise try to write the same value again.
  const writeInFlight = useRef<string | null>(null);

  const writeUrl = useCallback(
    async (url: string, currentUrl: string) => {
      if (!customField || !url) return;
      if (url === currentUrl || url === writeInFlight.current) return;

      writeInFlight.current = url;
      try {
        await customField.entry.getField(config.urlFieldUid).setData(url);
        setLastWrittenUrl(url);
        setError("");
      } catch (e) {
        setError(`Could not write "${config.urlFieldUid}": ${friendlyApiError(e)}`);
      } finally {
        writeInFlight.current = null;
      }
    },
    [customField, config.urlFieldUid]
  );

  /* ---- Recomputing on every change --------------------------------------- */

  // Each run gets a sequence number. If the entry changes again while a run
  // is waiting on the API, the older run's result is thrown away.
  const runSequence = useRef(0);

  const recompute = useCallback(
    async (entry: EntryData) => {
      const cache = cacheRef.current;
      if (!customField || !cache) return;
      const thisRun = ++runSequence.current;

      const locale = customField.entry.locale || (typeof entry.locale === "string" ? entry.locale : "");
      const result = await buildUrl({ config, entry, locale, cache });
      if (thisRun !== runSequence.current) return;

      setError(result.errors.join(" "));
      setBreakdown(result.breakdown);

      const { composedUrl, currentUrl } = result.breakdown;
      if (autoSyncRef.current && composedUrl) void writeUrl(composedUrl, currentUrl);
    },
    [customField, config, autoSyncRef, writeUrl]
  );

  // entry.onChange cannot be unsubscribed, so subscribe exactly once and send
  // every event through a ref that always points at the latest recompute.
  const recomputeRef = useRef(recompute);
  recomputeRef.current = recompute;
  const subscribed = useRef(false);

  useEffect(() => {
    if (!customField || subscribed.current) return;
    subscribed.current = true;
    void recomputeRef.current(customField.entry.getData());
    customField.entry.onChange((entry) => void recomputeRef.current(entry));
  }, [customField]);

  /* ---- Layout ------------------------------------------------------------ */

  const shellRef = useRef<HTMLDivElement>(null);
  useFrameHeight(customField, shellRef);

  if (!appSdk) {
    return <div className={styles.shell}>Loading…</div>;
  }
  if (!customField) {
    return <div className={styles.shell}>This app only runs as a custom field.</div>;
  }

  const canApply =
    breakdown.composedUrl !== "" && breakdown.missing.length === 0 && breakdown.composedUrl !== breakdown.currentUrl;
  const isUpToDate = breakdown.composedUrl !== "" && breakdown.composedUrl === breakdown.currentUrl;
  const noRuleMatched = !breakdown.pattern && config.rules.length > 0;

  return (
    <div className={styles.shell} ref={shellRef}>
      <Header
        breakdown={breakdown}
        autoSync={autoSync}
        onToggleSync={(enabled) => {
          chooseSync(enabled);
          // Turning sync back on applies the current composed URL straight away.
          if (enabled && breakdown.composedUrl) void writeUrl(breakdown.composedUrl, breakdown.currentUrl);
        }}
      />

      {invalidConfigTokens.length > 0 && <InvalidTokensBanner tokens={invalidConfigTokens} />}

      <TermTable breakdown={breakdown} config={config} />

      {breakdown.missing.length > 0 && <MissingBanner missing={breakdown.missing} config={config} />}

      {noRuleMatched && (
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
          disabled={!canApply}
          onClick={() => void writeUrl(breakdown.composedUrl, breakdown.currentUrl)}
        >
          Apply to {config.urlFieldUid}
        </button>
      )}

      {autoSync && isUpToDate && (
        <div className={styles.hint}>
          URL is up to date{lastWrittenUrl === breakdown.currentUrl ? " (written by this field)" : ""}.
        </div>
      )}

      {error && <div className={`${styles.banner} ${styles.bannerError}`}>{error}</div>}
    </div>
  );
};

export default TaxonomyUrl;

/* -------------------------------------------------------------------------- */
/*  4. Presentational pieces                                                  */
/* -------------------------------------------------------------------------- */

/** The pattern in use, which rule chose it, and the sync toggle. */
const Header: React.FC<{
  breakdown: UrlBreakdown;
  autoSync: boolean;
  onToggleSync: (enabled: boolean) => void;
}> = ({ breakdown, autoSync, onToggleSync }) => (
  <div className={styles.header}>
    <span className={styles.mono}>
      {breakdown.pattern || <span className={styles.muted}>no pattern applies</span>}
      {breakdown.ruleLabel && <span className={styles.muted}> · {breakdown.ruleLabel}</span>}
    </span>
    <label className={styles.toggle}>
      <input type="checkbox" checked={autoSync} onChange={(event) => onToggleSync(event.target.checked)} />
      Keep URL in sync
    </label>
  </div>
);

/** Shown when the config contains a token the field will never be able to fill. */
const InvalidTokensBanner: React.FC<{ tokens: string[] }> = ({ tokens }) => (
  <div className={`${styles.banner} ${styles.bannerError}`}>
    Invalid token{tokens.length > 1 ? "s" : ""} in config: {tokens.join(", ")}. Known tokens:{" "}
    {Object.keys(TOKENS)
      .map((kind) => `{${kind}}`)
      .join(", ")}
    ; term tokens take a qualifier like {"{term:season}"}.
  </div>
);

/**
 * The breakdown table. While a pattern is active it lists one row per term
 * slot; otherwise it lists the raw tags so the admin can see their UIDs.
 * The current and composed URLs are always shown.
 */
const TermTable: React.FC<{ breakdown: UrlBreakdown; config: TaxonomyUrlConfig }> = ({ breakdown, config }) => {
  const slots = Object.entries(breakdown.terms);

  const slotLabel = (key: string): string => {
    if (key === RULE_SLOT) return "rule term";
    if (key === "") return config.taxonomyUid || "term";
    return key;
  };

  return (
    <dl className={styles.grid}>
      {slots.length === 0 ? (
        <>
          <dt>Tagged</dt>
          <dd>
            {breakdown.tagged.length === 0 ? (
              <span className={styles.muted}>no terms in &quot;{config.taxonomyFieldUid}&quot;</span>
            ) : (
              breakdown.tagged.map((tag) => (
                <div key={`${tag.taxonomy_uid}/${tag.term_uid}`} className={styles.mono}>
                  {tag.taxonomy_uid} <span className={styles.muted}>›</span> {tag.term_uid}
                </div>
              ))
            )}
          </dd>
        </>
      ) : (
        slots.map(([key, term]) => (
          <React.Fragment key={key || "__primary"}>
            <dt>{slotLabel(key)}</dt>
            <dd>
              {term ? (
                <>
                  <span>{term.termName}</span>
                  {key === "" && <span className={styles.muted}> · {term.taxonomyName || term.taxonomyUid}</span>}
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
  );
};

/** Lists, in plain words, what the editor still has to add before a URL can be written. */
const MissingBanner: React.FC<{ missing: string[]; config: TaxonomyUrlConfig }> = ({ missing, config }) => (
  <div className={`${styles.banner} ${styles.bannerWarn}`}>
    <strong>URL not generated yet.</strong> This entry still needs:
    <ul className={styles.list}>
      {missing.map((rawToken) => (
        <li key={rawToken}>
          {describeMissing(rawToken, config)} <span className={styles.mono}>{rawToken}</span>
        </li>
      ))}
    </ul>
  </div>
);
