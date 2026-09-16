import React, { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./SidebarLocalizeFrom.module.css";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useAppLocation } from "../../common/hooks/useAppLocation";
import { useAppSdk } from "../../common/hooks/useAppSdk";
import { useCurrentBranch } from "../../common/hooks/useCurrentBranch";
import { useEntry } from "../../common/hooks/useEntry";
import {
  StackHandle,
  friendlyApiError,
  getEntryLocales,
  getStackLocales,
  isEntryLocalizedIn,
  localizeEntryFromSource,
} from "./api";
import { EntryLocaleStatus, StackLocale } from "./types";

interface SidebarEntryHandle {
  content_type?: { uid?: string };
  locale?: string;
}

interface Banner {
  kind: "success" | "error";
  text: string;
}

/**
 * "Localize From Locale" — entry sidebar widget. Lets an editor localize the
 * locale they're editing by copying content from a chosen source locale,
 * instead of the fallback chain Contentstack's native localize flow uses.
 *
 * All reads/writes go through the App SDK's stack API (appSdk.stack), which
 * runs with the logged-in user's session — no app-proxy permissions or
 * management token involved.
 */
const SidebarLocalizeFrom: React.FC = () => {
  const { location } = useAppLocation();
  const { entryData } = useEntry();
  const { branchUid } = useCurrentBranch();
  const appSdk = useAppSdk();

  const stack = (appSdk?.stack as unknown as StackHandle | undefined) ?? undefined;

  const sidebarEntry: SidebarEntryHandle | undefined =
    location && "entry" in location ? (location as { entry?: SidebarEntryHandle }).entry : undefined;
  const contentTypeUid = sidebarEntry?.content_type?.uid ?? "";
  // The locale of the content the editor is actually showing. For an
  // unlocalized entry this is the fallback locale, NOT the one being edited.
  const payloadLocale =
    typeof (entryData as Record<string, unknown>)?.locale === "string"
      ? ((entryData as Record<string, unknown>).locale as string)
      : "";
  // The locale being edited (SDK entry handle), falling back to the payload's.
  const currentLocale = sidebarEntry?.locale ?? payloadLocale;
  const entryUid =
    typeof (entryData as Record<string, unknown>)?.uid === "string"
      ? ((entryData as Record<string, unknown>).uid as string)
      : "";

  const [stackLocales, setStackLocales] = useState<StackLocale[]>([]);
  const [entryLocales, setEntryLocales] = useState<EntryLocaleStatus[]>([]);
  // Set after a successful copy — the editor payload stays stale until reload.
  const [localizedOverride, setLocalizedOverride] = useState<boolean | null>(null);
  // Locale-loading failure, kept separate from copy-result banners and
  // cleared on every refresh so a recovered retry doesn't leave a stale error.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sourceLocale, setSourceLocale] = useState("");
  const [copying, setCopying] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);

  // Purely local, no API involved: the editor payload reports the locale of
  // the content it serves — for an unlocalized entry that's the fallback
  // locale, so equality with the editing locale means localized.
  const currentLocalized =
    localizedOverride ?? (!!payloadLocale && !!currentLocale && payloadLocale === currentLocale);

  const refreshStatus = useCallback(async () => {
    if (!stack || !contentTypeUid || !entryUid) return;
    setLoading(true);
    setLoadError(null);
    // Independent fetches — one failing must not blank the other or the
    // SDK-derived localized status (which needs no network at all).
    const [localesResult, statusesResult] = await Promise.allSettled([
      getStackLocales(stack),
      getEntryLocales(stack, contentTypeUid, entryUid),
    ]);
    if (localesResult.status === "fulfilled") setStackLocales(localesResult.value);
    if (statusesResult.status === "fulfilled") setEntryLocales(statusesResult.value);
    const failure = [localesResult, statusesResult].find(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );
    if (failure) {
      setLoadError(friendlyApiError(failure.reason, "Failed to load locales"));
    }
    setLoading(false);
  }, [stack, contentTypeUid, entryUid]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // The SDK's stack data is authoritative for the master locale; the
  // no-fallback heuristic over the locales list is only a fallback.
  const masterLocale = useMemo(() => {
    const stackData = appSdk?.stack?.getData() as { master_locale?: string } | undefined;
    return stackData?.master_locale ?? stackLocales.find((l) => !l.fallback_locale)?.code ?? null;
  }, [appSdk, stackLocales]);

  const sourceOptions = useMemo(
    () =>
      stackLocales
        .filter((l) => l.code !== currentLocale)
        .map((l) => ({
          ...l,
          localized: isEntryLocalizedIn(entryLocales, l.code, masterLocale),
        })),
    [stackLocales, entryLocales, currentLocale, masterLocale]
  );

  const runCopy = useCallback(async () => {
    if (!stack) return;
    setConfirmOpen(false);
    setCopying(true);
    setBanner(null);
    try {
      await localizeEntryFromSource(stack, contentTypeUid, entryUid, sourceLocale, currentLocale);
      setBanner({
        kind: "success",
        text: `Localized ${currentLocale} from ${sourceLocale}. Reload the entry to see the new content.`,
      });
      // The editor's payload snapshot is stale until the page reloads — we
      // just localized this locale, so assert it.
      setLocalizedOverride(true);
      void refreshStatus();
    } catch (err: unknown) {
      setBanner({ kind: "error", text: friendlyApiError(err, "Copy failed") });
    } finally {
      setCopying(false);
    }
  }, [stack, contentTypeUid, entryUid, sourceLocale, currentLocale, refreshStatus]);

  const handleCopyClick = () => {
    if (currentLocalized) {
      // Overwriting existing localized content — typed confirmation.
      setConfirmOpen(true);
    } else {
      void runCopy();
    }
  };

  if (!appSdk || (loading && stackLocales.length === 0 && !loadError)) {
    return <div className={styles.empty}>Loading…</div>;
  }

  if (!entryUid) {
    return (
      <div className={styles.empty}>
        Save the entry first — a draft that has never been saved can&apos;t be localized yet.
      </div>
    );
  }

  if (masterLocale && currentLocale === masterLocale) {
    return (
      <div className={styles.empty}>
        You&apos;re editing the master locale (<span className={styles.mono}>{masterLocale}</span>).
        Switch to another locale to localize it from a source of your choice.
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <h4 className={styles.title}>Localize from a locale</h4>
      <p className={styles.muted}>
        Copy content into <span className={styles.mono}>{currentLocale}</span> from a locale you
        pick — instead of its fallback chain.
      </p>

      <div
        className={`${styles.statusBanner} ${
          currentLocalized ? styles.statusLocalized : styles.statusInheriting
        }`}
      >
        {currentLocalized ? (
          <>
            <span className={styles.mono}>{currentLocale}</span> is localized — it has its own
            content. Copying will <strong>replace</strong> it.
          </>
        ) : (
          <>
            <span className={styles.mono}>{currentLocale}</span> is not localized yet — it currently
            inherits fallback content. Pick a source below to localize it.
          </>
        )}
      </div>

      {loadError && (
        <div className={`${styles.banner} ${styles.bannerError}`}>
          <span>Couldn&apos;t load the locale list: {loadError}</span>
          <button
            className={styles.bannerClose}
            onClick={() => void refreshStatus()}
            aria-label="Retry"
            title="Retry"
          >
            ↻
          </button>
        </div>
      )}

      {banner && (
        <div
          className={`${styles.banner} ${
            banner.kind === "success" ? styles.bannerSuccess : styles.bannerError
          }`}
        >
          <span>{banner.text}</span>
          <button className={styles.bannerClose} onClick={() => setBanner(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.fieldLabel}>Copy from</label>
        <select
          className={styles.select}
          value={sourceLocale}
          onChange={(e) => setSourceLocale(e.target.value)}
          disabled={copying}
        >
          <option value="">Select a source locale…</option>
          {sourceOptions.map((l) => (
            <option key={l.code} value={l.code} disabled={!l.localized}>
              {l.name} ({l.code}){l.localized ? "" : " — not localized"}
            </option>
          ))}
        </select>
      </div>

      <button
        className={styles.btn}
        disabled={!sourceLocale || copying}
        onClick={handleCopyClick}
      >
        {copying ? "Copying…" : `Copy & localize ${currentLocale}`}
      </button>

      <p className={styles.footnote}>
        Non-localizable fields keep their shared values. If this locale should <em>always</em> seed
        from the same source, set its fallback language in stack settings instead.
      </p>

      <details className={styles.footnote}>
        <summary>Diagnostics</summary>
        <div>
          editing: <span className={styles.mono}>{currentLocale}</span> · payload serves:{" "}
          <span className={styles.mono}>{payloadLocale || "?"}</span> · localized:{" "}
          <span className={styles.mono}>{String(currentLocalized)}</span> · master:{" "}
          <span className={styles.mono}>{masterLocale ?? "?"}</span> · branch:{" "}
          <span className={styles.mono}>{branchUid ?? "—"}</span>
        </div>
        <pre className={styles.mono} style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>
          {JSON.stringify(entryLocales, null, 1)}
        </pre>
      </details>

      <ConfirmDialog
        open={confirmOpen}
        title="Replace localized content?"
        danger
        body={
          <p>
            <span className={styles.mono}>{currentLocale}</span> already has its own localized
            content. Copying from <span className={styles.mono}>{sourceLocale}</span> replaces it
            (a new entry version is created, so history is kept). Unsaved edits in the open editor
            are not included — reloading after the copy discards them.
          </p>
        }
        confirmWord={currentLocale}
        confirmLabel="Replace content"
        busy={copying}
        onConfirm={() => void runCopy()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};

export default SidebarLocalizeFrom;
