import { useCallback, useRef, useState } from "react";
import { ENTRY_PAGE_LIMIT, fetchEntriesPage, friendlyApiError } from "../api";
import { buildMatcher, buildTextTree, replaceInEntry } from "../scan";
import {
  ContentTypeSummary,
  EntryMatch,
  ScanOptions,
  ScanProgress,
  StackHandle,
  StopReason,
} from "../types";

/** Soft cap on entries scanned per run — surface "narrow the selection" instead of silently truncating. */
export const SCAN_ENTRY_CAP = 5000;

export type ScanStatus = "idle" | "scanning" | "done" | "error";

export interface ScanParams {
  contentTypes: ContentTypeSummary[];
  /** Locale codes to scan, each independently. */
  locales: string[];
  /** Stack master locale — entries always exist here, so no fallback filtering applies. */
  masterLocale: string | null;
  term: string;
  replacement: string;
  options: ScanOptions;
}

const EMPTY_PROGRESS: ScanProgress = {
  entriesScanned: 0,
  contentTypeIndex: 0,
  contentTypeCount: 0,
  currentContentType: null,
  currentLocale: null,
};

/**
 * Paginated entry fetch + client-side scan. Sequential per content type and
 * locale (no fan-out — CMA rate limits), with cancel and a soft entry cap.
 * Stale runs are guarded by a sequence counter (same pattern as
 * BranchConsole's useBranches).
 *
 * Multi-locale: querying entries in a non-master locale also returns fallback
 * copies of entries that are NOT localized there (their `locale` field is the
 * locale they fell back to). Writing to one of those would localize the entry
 * as a side effect, so those rows are skipped — the master-locale pass covers
 * their text.
 */
export function useEntryScan(stack: StackHandle | null) {
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [progress, setProgress] = useState<ScanProgress>(EMPTY_PROGRESS);
  const [results, setResults] = useState<EntryMatch[]>([]);
  const [stoppedEarly, setStoppedEarly] = useState<StopReason>(null);
  const [error, setError] = useState<string | null>(null);
  const runSeq = useRef(0);
  const cancelRequested = useRef(false);

  const cancelScan = useCallback(() => {
    cancelRequested.current = true;
  }, []);

  const resetScan = useCallback(() => {
    runSeq.current++;
    cancelRequested.current = false;
    setStatus("idle");
    setProgress(EMPTY_PROGRESS);
    setResults([]);
    setStoppedEarly(null);
    setError(null);
  }, []);

  const startScan = useCallback(
    async (params: ScanParams) => {
      if (!stack) {
        setError("Contentstack App SDK is not ready");
        setStatus("error");
        return;
      }
      const seq = ++runSeq.current;
      cancelRequested.current = false;
      setStatus("scanning");
      setProgress({ ...EMPTY_PROGRESS, contentTypeCount: params.contentTypes.length });
      setResults([]);
      setStoppedEarly(null);
      setError(null);

      const regex = buildMatcher(params.term, params.options);
      const found: EntryMatch[] = [];
      let scanned = 0;
      let stop: StopReason = null;

      try {
        outer: for (let c = 0; c < params.contentTypes.length; c++) {
          const ct = params.contentTypes[c];
          const tree = buildTextTree(ct.schema);
          if (Object.keys(tree).length === 0) continue;

          for (const locale of params.locales) {
            setProgress({
              entriesScanned: scanned,
              contentTypeIndex: c,
              contentTypeCount: params.contentTypes.length,
              currentContentType: ct.title,
              currentLocale: locale,
            });
            const isMaster = !params.masterLocale || locale === params.masterLocale;

            for (let skip = 0; ; skip += ENTRY_PAGE_LIMIT) {
              if (seq !== runSeq.current) return;
              if (cancelRequested.current) {
                stop = "cancelled";
                break outer;
              }
              const entries = await fetchEntriesPage(stack, ct.uid, locale, skip);
              if (seq !== runSeq.current) return;

              for (const entry of entries) {
                // Fallback copy (not localized here) — skip, see hook doc.
                if (!isMaster && typeof entry.locale === "string" && entry.locale !== locale) continue;
                scanned++;
                const { changedFields, matches } = replaceInEntry(entry, tree, regex, params.replacement);
                if (matches.length > 0) {
                  found.push({
                    entryUid: String(entry.uid ?? ""),
                    entryTitle:
                      typeof entry.title === "string" && entry.title ? entry.title : String(entry.uid ?? "(untitled)"),
                    contentTypeUid: ct.uid,
                    contentTypeTitle: ct.title,
                    locale,
                    matches,
                    changedFields,
                  });
                }
                if (scanned >= SCAN_ENTRY_CAP) {
                  stop = "cap";
                  break outer;
                }
              }
              setProgress((prev) => ({ ...prev, entriesScanned: scanned }));
              if (entries.length < ENTRY_PAGE_LIMIT) break;
            }
          }
        }

        if (seq !== runSeq.current) return;
        setProgress((prev) => ({ ...prev, entriesScanned: scanned }));
        setResults(found);
        setStoppedEarly(stop);
        setStatus("done");
      } catch (err) {
        if (seq !== runSeq.current) return;
        setError(friendlyApiError(err, "Scan failed"));
        setStatus("error");
      }
    },
    [stack]
  );

  return { status, progress, results, stoppedEarly, error, startScan, cancelScan, resetScan } as const;
}
