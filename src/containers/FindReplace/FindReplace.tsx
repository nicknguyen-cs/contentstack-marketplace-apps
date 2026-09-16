import React, { useCallback, useEffect, useState } from "react";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useAppSdk } from "../../common/hooks/useAppSdk";
import { useCurrentBranch } from "../../common/hooks/useCurrentBranch";
import { friendlyApiError, listContentTypes, listLocales, updateEntry } from "./api";
import MatchList, { entryKey } from "./components/MatchList";
import ReplaceResults from "./components/ReplaceResults";
import SearchForm from "./components/SearchForm";
import { useEntryScan, SCAN_ENTRY_CAP } from "./hooks/useEntryScan";
import styles from "./FindReplace.module.css";
import {
  ContentTypeSummary,
  EntryMatch,
  LocaleSummary,
  ReplaceResult,
  SearchFormState,
  StackHandle,
} from "./types";

/** Pause between entry updates to stay under CMA rate limits. */
const REPLACE_DELAY_MS = 150;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Same shape as MatchList's entryKey — one row per entry per locale. */
const resultKey = (r: ReplaceResult) => `${r.contentTypeUid}:${r.entryUid}:${r.locale}`;

const EMPTY_FORM: SearchFormState = {
  term: "",
  replacement: "",
  selectedCtUids: [],
  locales: [],
  caseSensitive: false,
  wholeWord: false,
};

const FindReplace: React.FC = () => {
  const appSdk = useAppSdk();
  // All CMA traffic goes through appSdk.stack (runs as the logged-in user) —
  // see api.ts for why the appSdk.api proxy isn't used.
  const stack = (appSdk?.stack as unknown as StackHandle | undefined) ?? null;
  const { branchUid, branchesEnabled } = useCurrentBranch();

  const [contentTypes, setContentTypes] = useState<ContentTypeSummary[]>([]);
  const [locales, setLocales] = useState<LocaleSummary[]>([]);
  const [setupLoading, setSetupLoading] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [localeFallback, setLocaleFallback] = useState(false);

  const [form, setForm] = useState<SearchFormState>(EMPTY_FORM);
  const scan = useEntryScan(stack);
  const masterLocale = (appSdk?.stack?.getData()?.master_locale as string | undefined) ?? null;

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [replaceProgress, setReplaceProgress] = useState<{ done: number; total: number } | null>(null);
  const [replaceResults, setReplaceResults] = useState<ReplaceResult[]>([]);

  useEffect(() => {
    if (!stack) return;
    let stale = false;
    (async () => {
      setSetupLoading(true);
      setSetupError(null);
      try {
        const masterLocale = appSdk?.stack?.getData()?.master_locale as string | undefined;
        // A locales failure (e.g. missing scope) shouldn't kill the widget —
        // fall back to the master locale from stack data.
        const [cts, locs] = await Promise.all([
          listContentTypes(stack),
          listLocales(stack).catch(() => null),
        ]);
        if (stale) return;
        const resolvedLocales =
          locs ?? (masterLocale ? [{ code: masterLocale, name: masterLocale }] : []);
        setContentTypes(cts);
        setLocales(resolvedLocales);
        setLocaleFallback(locs === null);
        // Default to the master locale only — the safest single-locale pass.
        // Editors opt into more locales explicitly.
        const defaultLocale =
          masterLocale && resolvedLocales.some((l) => l.code === masterLocale)
            ? masterLocale
            : resolvedLocales[0]?.code;
        setForm((prev) => ({
          ...prev,
          selectedCtUids: cts.map((ct) => ct.uid),
          locales: prev.locales.length > 0 ? prev.locales : defaultLocale ? [defaultLocale] : [],
        }));
      } catch (err) {
        if (!stale) setSetupError(friendlyApiError(err, "Failed to load content types"));
      } finally {
        if (!stale) setSetupLoading(false);
      }
    })();
    return () => {
      stale = true;
    };
  }, [stack, appSdk]);

  // A completed preview is only valid for the exact form it was scanned with —
  // any change invalidates it and disables Replace.
  const handleFormChange = useCallback(
    (patch: Partial<SearchFormState>) => {
      setForm((prev) => ({ ...prev, ...patch }));
      if (scan.status !== "idle") {
        scan.resetScan();
        setSelectedKeys(new Set());
        setReplaceResults([]);
      }
    },
    [scan]
  );

  const handleScan = useCallback(() => {
    setReplaceResults([]);
    const selected = contentTypes.filter((ct) => form.selectedCtUids.includes(ct.uid));
    scan.startScan({
      contentTypes: selected,
      locales: form.locales,
      masterLocale,
      term: form.term,
      replacement: form.replacement,
      options: { caseSensitive: form.caseSensitive, wholeWord: form.wholeWord },
    });
  }, [contentTypes, form, scan, masterLocale]);

  // Default every matched entry to selected when a scan finishes.
  useEffect(() => {
    setSelectedKeys(new Set(scan.results.map(entryKey)));
  }, [scan.results]);

  const toggleEntry = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (select: boolean) => {
      setSelectedKeys(select ? new Set(scan.results.map(entryKey)) : new Set());
    },
    [scan.results]
  );

  const runReplace = useCallback(
    async (targets: EntryMatch[]) => {
      setConfirmOpen(false);
      setReplacing(true);
      setReplaceProgress({ done: 0, total: targets.length });
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const matchCount = target.matches.reduce((sum, m) => sum + m.count, 0);
        let outcome: ReplaceResult;
        try {
          if (!stack) throw new Error("Contentstack App SDK is not ready");
          await updateEntry(
            stack,
            target.contentTypeUid,
            target.entryUid,
            target.locale,
            target.changedFields
          );
          outcome = {
            entryUid: target.entryUid,
            entryTitle: target.entryTitle,
            contentTypeUid: target.contentTypeUid,
            contentTypeTitle: target.contentTypeTitle,
            locale: target.locale,
            matchCount,
            ok: true,
          };
        } catch (err) {
          outcome = {
            entryUid: target.entryUid,
            entryTitle: target.entryTitle,
            contentTypeUid: target.contentTypeUid,
            contentTypeTitle: target.contentTypeTitle,
            locale: target.locale,
            matchCount,
            ok: false,
            error: friendlyApiError(err, "Update failed"),
          };
        }
        setReplaceProgress({ done: i + 1, total: targets.length });
        setReplaceResults((prev) => {
          const map = new Map(prev.map((r) => [resultKey(r), r]));
          map.set(resultKey(outcome), outcome);
          return [...map.values()];
        });
        if (i < targets.length - 1) await delay(REPLACE_DELAY_MS);
      }
      setReplacing(false);
      setReplaceProgress(null);
    },
    [stack]
  );

  const retryFailed = useCallback(() => {
    const failedKeys = new Set(replaceResults.filter((r) => !r.ok).map(resultKey));
    runReplace(scan.results.filter((r) => failedKeys.has(entryKey(r))));
  }, [replaceResults, scan.results, runReplace]);

  const selectedMatches = scan.results.filter((r) => selectedKeys.has(entryKey(r)));
  const selectedReplacementCount = selectedMatches.reduce(
    (sum, r) => sum + r.matches.reduce((s, m) => s + m.count, 0),
    0
  );
  const selectedLocaleCodes = [...new Set(selectedMatches.map((r) => r.locale))];
  const previewReady = scan.status === "done" && scan.results.length > 0;
  // One replace run per preview — a fresh scan is required for another pass.
  const canReplace = previewReady && selectedMatches.length > 0 && replaceResults.length === 0 && !replacing;

  return (
    <div className={styles.shell}>
      <div className={styles.header}>
        <div>
          <h2>Find &amp; Replace</h2>
          <p className={styles.headerSub}>
            Search plain text fields across entries and replace terms. Replacements save new draft versions — nothing
            is published.
          </p>
        </div>
        {branchesEnabled && branchUid && (
          <span className={styles.chip}>branch: {branchUid}</span>
        )}
      </div>

      {setupError && <div className={`${styles.banner} ${styles.bannerError}`}>{setupError}</div>}
      {setupLoading && !setupError && <p className={styles.muted}>Loading content types and locales…</p>}
      {!setupLoading && localeFallback && (
        <div className={`${styles.banner} ${styles.bannerWarning}`}>
          Couldn&apos;t load the locale list (your role may lack language read access) — only the master locale is
          available.
        </div>
      )}

      {!setupLoading && !setupError && (
        <SearchForm
          contentTypes={contentTypes}
          locales={locales}
          masterLocale={masterLocale}
          form={form}
          onChange={handleFormChange}
          onScan={handleScan}
          scanning={scan.status === "scanning"}
        />
      )}

      {scan.status === "scanning" && (
        <div className={styles.card}>
          <div className={styles.progressRow}>
            <span className={styles.spinnerDot} />
            <span>
              Scanning {scan.progress.currentContentType ?? "…"}
              {scan.progress.currentLocale ? ` [${scan.progress.currentLocale}]` : ""} (
              {scan.progress.contentTypeIndex + 1}/{scan.progress.contentTypeCount}) —{" "}
              {scan.progress.entriesScanned} entries scanned,{" "}
              {scan.results.length} matched so far
            </span>
            <button type="button" className={styles.btn} onClick={scan.cancelScan}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {scan.status === "error" && scan.error && (
        <div className={`${styles.banner} ${styles.bannerError}`}>{scan.error}</div>
      )}

      {scan.status === "done" && scan.stoppedEarly === "cap" && (
        <div className={`${styles.banner} ${styles.bannerWarning}`}>
          Scan stopped at {SCAN_ENTRY_CAP.toLocaleString()} entries — narrow the content-type selection to cover the
          rest.
        </div>
      )}
      {scan.status === "done" && scan.stoppedEarly === "cancelled" && (
        <div className={`${styles.banner} ${styles.bannerWarning}`}>Scan cancelled — showing partial results.</div>
      )}

      {scan.status === "done" && scan.results.length === 0 && (
        <div className={styles.card}>
          <p className={styles.muted}>
            No matches for “{form.term}” in {scan.progress.entriesScanned} scanned{" "}
            {scan.progress.entriesScanned === 1 ? "entry" : "entries"}.
          </p>
        </div>
      )}

      {previewReady && (
        <>
          <MatchList
            results={scan.results}
            selectedKeys={selectedKeys}
            onToggle={toggleEntry}
            onToggleAll={toggleAll}
          />
          <div className={styles.replaceBar}>
            <span>
              {selectedReplacementCount} {selectedReplacementCount === 1 ? "replacement" : "replacements"} across{" "}
              {selectedMatches.length} of {scan.results.length} matched{" "}
              {scan.results.length === 1 ? "entry" : "entries"}
              {selectedLocaleCodes.length > 1 ? ` in ${selectedLocaleCodes.length} locales` : ""}
            </span>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={() => setConfirmOpen(true)}
              disabled={!canReplace}
            >
              {replacing && replaceProgress
                ? `Replacing… ${replaceProgress.done}/${replaceProgress.total}`
                : "Replace…"}
            </button>
          </div>
        </>
      )}

      <ReplaceResults results={replaceResults} replacing={replacing} onRetryFailed={retryFailed} />

      <ConfirmDialog
        open={confirmOpen}
        title="Replace across entries?"
        body={
          <>
            <p>
              This will replace <strong>“{form.term}”</strong> with{" "}
              {form.replacement ? <strong>“{form.replacement}”</strong> : <strong>nothing (the term is deleted)</strong>}{" "}
              in <strong>{selectedMatches.length}</strong> {selectedMatches.length === 1 ? "entry" : "entries"} (
              {selectedReplacementCount} {selectedReplacementCount === 1 ? "occurrence" : "occurrences"}) across{" "}
              {selectedLocaleCodes.length === 1 ? "locale" : "locales"} <strong>{selectedLocaleCodes.join(", ")}</strong>.
              Each locale is updated separately.
            </p>
            <p>Entries are saved as new draft versions. Nothing is published.</p>
          </>
        }
        confirmWord={form.term}
        confirmLabel={`Replace in ${selectedMatches.length} ${selectedMatches.length === 1 ? "entry" : "entries"}`}
        danger
        busy={replacing}
        onConfirm={() => runReplace(selectedMatches)}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};

export default FindReplace;
