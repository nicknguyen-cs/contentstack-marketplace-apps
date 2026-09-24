import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./SidebarLocaleStatus.module.css";
import { useAppLocation } from "../../common/hooks/useAppLocation";
import { useAppSdk } from "../../common/hooks/useAppSdk";
import { useEntry } from "../../common/hooks/useEntry";
import {
  StackHandle,
  buildRow,
  fetchEntryInLocale,
  friendlyApiError,
  getStackEnvironments,
  getStackLocales,
  mapWithConcurrency,
} from "./api";
import { absoluteTime, relativeTime } from "./format";
import { LocaleRow } from "./types";

interface SidebarEntryHandle {
  content_type?: { uid?: string };
  locale?: string;
  onSave?: (cb: () => void) => void;
  onPublish?: (cb: () => void) => void;
  onUnPublish?: (cb: () => void) => void;
}

const FETCH_CONCURRENCY = 4;

/**
 * "Locale Status" — entry sidebar widget. One card per stack locale showing
 * whether the entry is localized there, when it was last saved, where and
 * when it was last published (and whether that publish is stale), and the
 * workflow stage it sits in.
 *
 * All reads go through appSdk.stack (the logged-in user's session).
 */
const SidebarLocaleStatus: React.FC = () => {
  const { location } = useAppLocation();
  const { entryData } = useEntry();
  const appSdk = useAppSdk();

  const stack = (appSdk?.stack as unknown as StackHandle | undefined) ?? undefined;
  const sidebarEntry: SidebarEntryHandle | undefined =
    location && "entry" in location ? (location as { entry?: SidebarEntryHandle }).entry : undefined;
  const contentTypeUid = sidebarEntry?.content_type?.uid ?? "";
  const entryUid =
    typeof (entryData as Record<string, unknown>)?.uid === "string"
      ? ((entryData as Record<string, unknown>).uid as string)
      : "";
  const payloadLocale =
    typeof (entryData as Record<string, unknown>)?.locale === "string"
      ? ((entryData as Record<string, unknown>).locale as string)
      : "";
  const currentLocale = sidebarEntry?.locale ?? payloadLocale;

  const masterLocale = useMemo(() => {
    const stackData = appSdk?.stack?.getData() as { master_locale?: string } | undefined;
    return stackData?.master_locale ?? null;
  }, [appSdk]);

  const [rows, setRows] = useState<LocaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null);
  const [onlyLocalized, setOnlyLocalized] = useState(false);
  // Drop results from a refresh that was superseded by a newer one.
  const refreshSeq = useRef(0);

  const refresh = useCallback(async () => {
    if (!stack || !contentTypeUid || !entryUid) return;
    const seq = ++refreshSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [locales, environments] = await Promise.all([
        getStackLocales(stack),
        getStackEnvironments(stack).catch(() => []),
      ]);
      const results = await mapWithConcurrency(locales, FETCH_CONCURRENCY, (l) =>
        fetchEntryInLocale(stack, contentTypeUid, entryUid, l.code)
      );
      if (seq !== refreshSeq.current) return;
      const built = locales.map((l, i) =>
        buildRow(l, masterLocale, currentLocale, environments, results[i])
      );
      built.sort((a, b) => {
        if (a.isMaster !== b.isMaster) return a.isMaster ? -1 : 1;
        if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setRows(built);
      setLastRefreshed(Date.now());
    } catch (err: unknown) {
      if (seq !== refreshSeq.current) return;
      setLoadError(friendlyApiError(err, "Failed to load locales"));
    } finally {
      if (seq === refreshSeq.current) setLoading(false);
    }
  }, [stack, contentTypeUid, entryUid, masterLocale, currentLocale]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Re-read after the editor saves or (un)publishes so the cards don't go stale.
  useEffect(() => {
    if (!sidebarEntry) return;
    const rerun = () => void refresh();
    sidebarEntry.onSave?.(rerun);
    sidebarEntry.onPublish?.(rerun);
    sidebarEntry.onUnPublish?.(rerun);
  }, [sidebarEntry, refresh]);

  const visibleRows = onlyLocalized ? rows.filter((r) => r.localized) : rows;
  const localizedCount = rows.filter((r) => r.localized).length;

  if (!appSdk) {
    return <div className={styles.empty}>Loading…</div>;
  }

  if (!entryUid) {
    return (
      <div className={styles.empty}>
        Save the entry first — a draft that has never been saved has no locale status yet.
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <div className={styles.header}>
        <div>
          <h4 className={styles.title}>Locale status</h4>
          <p className={styles.muted}>
            {rows.length > 0
              ? `${localizedCount} of ${rows.length} locales localized`
              : "Localization, publish and workflow state per locale."}
          </p>
        </div>
        <button
          className={styles.iconBtn}
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="Refresh"
          title={lastRefreshed ? `Refreshed ${relativeTime(new Date(lastRefreshed).toISOString())}` : "Refresh"}
        >
          {loading ? "…" : "↻"}
        </button>
      </div>

      {loadError && (
        <div className={styles.bannerError}>
          <span>{loadError}</span>
          <button className={styles.bannerClose} onClick={() => void refresh()} aria-label="Retry">
            ↻
          </button>
        </div>
      )}

      {rows.length > 0 && (
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={onlyLocalized}
            onChange={(e) => setOnlyLocalized(e.target.checked)}
          />
          Hide locales that aren&apos;t localized
        </label>
      )}

      {loading && rows.length === 0 && !loadError && (
        <div className={styles.empty}>Loading locales…</div>
      )}

      <ul className={styles.list}>
        {visibleRows.map((row) => (
          <LocaleCard key={row.code} row={row} />
        ))}
      </ul>

      {!loading && rows.length > 0 && visibleRows.length === 0 && (
        <div className={styles.empty}>No localized locales besides the ones hidden by the filter.</div>
      )}
    </div>
  );
};

const LocaleCard: React.FC<{ row: LocaleRow }> = ({ row }) => {
  const latestPublish = row.publishes.reduce<LocaleRow["publishes"][number] | null>(
    (best, p) => (!best || Date.parse(p.time) > Date.parse(best.time) ? p : best),
    null
  );

  return (
    <li className={`${styles.card} ${row.isCurrent ? styles.cardCurrent : ""}`}>
      <div className={styles.cardHead}>
        <span className={styles.localeName} title={row.code}>
          {row.name}
        </span>
        <span className={styles.mono}>{row.code}</span>
        {row.isMaster && <span className={`${styles.chip} ${styles.chipMaster}`}>master</span>}
        {row.isCurrent && <span className={`${styles.chip} ${styles.chipCurrent}`}>editing</span>}
      </div>

      {row.error ? (
        <div className={styles.rowError}>{row.error}</div>
      ) : (
        <dl className={styles.facts}>
          <dt>Localized</dt>
          <dd>
            {row.localized ? (
              <span className={`${styles.dot} ${styles.dotGood}`}>Yes</span>
            ) : (
              <span className={`${styles.dot} ${styles.dotWarn}`}>
                No · falls back to{" "}
                <span className={styles.mono}>{row.servedFrom ?? row.fallbackLocale ?? "?"}</span>
              </span>
            )}
          </dd>

          <dt>Saved</dt>
          <dd>
            {row.updatedAt ? (
              <span title={absoluteTime(row.updatedAt)}>
                {relativeTime(row.updatedAt)}
                {row.version !== null && <span className={styles.faint}> · v{row.version}</span>}
              </span>
            ) : (
              <span className={styles.faint}>—</span>
            )}
          </dd>

          <dt>Published</dt>
          <dd>
            {row.publishes.length === 0 ? (
              <span className={styles.faint}>Never</span>
            ) : (
              <ul className={styles.pubList}>
                {row.publishes.map((p) => (
                  <li key={p.environmentUid} title={absoluteTime(p.time)}>
                    <span className={styles.envName}>{p.environmentName}</span>{" "}
                    {relativeTime(p.time)}
                    {typeof p.version === "number" && (
                      <span className={styles.faint}> · v{p.version}</span>
                    )}
                    {p.outdated && (
                      <span className={`${styles.chip} ${styles.chipStale}`} title="Saved since this publish">
                        stale
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </dd>

          <dt>Workflow</dt>
          <dd>
            {row.workflow?.name ? (
              <span className={styles.stage}>
                <span
                  className={styles.stageSwatch}
                  style={row.workflow.color ? { background: row.workflow.color } : undefined}
                />
                {row.workflow.name}
                {row.workflow.due_date && (
                  <span className={styles.faint} title={absoluteTime(row.workflow.due_date)}>
                    {" "}
                    · due {relativeTime(row.workflow.due_date)}
                  </span>
                )}
              </span>
            ) : (
              <span className={styles.faint}>{row.localized ? "No stage" : "—"}</span>
            )}
          </dd>
        </dl>
      )}

      {latestPublish && latestPublish.outdated && !row.error && (
        <div className={styles.hint}>Unpublished changes since the last publish.</div>
      )}
    </li>
  );
};

export default SidebarLocaleStatus;
