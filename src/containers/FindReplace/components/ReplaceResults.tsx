import React from "react";
import styles from "../FindReplace.module.css";
import { ReplaceResult } from "../types";

interface ReplaceResultsProps {
  results: ReplaceResult[];
  replacing: boolean;
  onRetryFailed: () => void;
}

const ReplaceResults: React.FC<ReplaceResultsProps> = ({ results, replacing, onRetryFailed }) => {
  if (results.length === 0) return null;

  const failed = results.filter((r) => !r.ok);
  const succeeded = results.length - failed.length;

  return (
    <div className={styles.card}>
      <div className={styles.cardHeaderRow}>
        <h3 className={styles.cardTitle}>
          Replace results — {succeeded} updated{failed.length > 0 ? `, ${failed.length} failed` : ""}
        </h3>
        {failed.length > 0 && (
          <button type="button" className={styles.btn} onClick={onRetryFailed} disabled={replacing}>
            Retry failed
          </button>
        )}
      </div>
      <p className={styles.muted}>
        Updated entries got a new draft version — nothing was published. Use each entry&apos;s version history to
        review or roll back.
      </p>
      <div className={styles.matchScroll}>
        {results.map((result) => (
          <div key={`${result.contentTypeUid}:${result.entryUid}:${result.locale}`} className={styles.resultRow}>
            <span className={result.ok ? `${styles.badge} ${styles.badgeOk}` : `${styles.badge} ${styles.badgeFail}`}>
              {result.ok ? "Updated" : "Failed"}
            </span>
            <span className={styles.matchEntryTitle}>{result.entryTitle}</span>
            <span className={styles.chip}>{result.locale}</span>
            <span className={styles.muted}>
              {result.contentTypeTitle} · <span className={styles.mono}>{result.entryUid}</span> · {result.matchCount}{" "}
              {result.matchCount === 1 ? "replacement" : "replacements"}
            </span>
            {!result.ok && result.error && <div className={styles.resultError}>{result.error}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ReplaceResults;
