import React from "react";
import styles from "../FindReplace.module.css";
import { EntryMatch, MatchSnippet } from "../types";

/** One row per entry per locale — the same entry can match in several locales. */
export const entryKey = (match: EntryMatch) => `${match.contentTypeUid}:${match.entryUid}:${match.locale}`;

interface MatchListProps {
  results: EntryMatch[];
  selectedKeys: Set<string>;
  onToggle: (key: string) => void;
  onToggleAll: (select: boolean) => void;
}

const Snippet: React.FC<{ snippet: MatchSnippet; removed?: boolean }> = ({ snippet, removed }) => (
  <span className={styles.snippet}>
    {snippet.prefix}
    <mark className={removed ? styles.markBefore : styles.markAfter}>{snippet.match || "∅"}</mark>
    {snippet.suffix}
  </span>
);

const MatchList: React.FC<MatchListProps> = ({ results, selectedKeys, onToggle, onToggleAll }) => {
  if (results.length === 0) return null;

  const allSelected = results.every((r) => selectedKeys.has(entryKey(r)));

  return (
    <div className={styles.card}>
      <div className={styles.cardHeaderRow}>
        <h3 className={styles.cardTitle}>Matches</h3>
        <label className={styles.checkboxOption}>
          <input type="checkbox" checked={allSelected} onChange={(e) => onToggleAll(e.target.checked)} />
          Select all entries
        </label>
      </div>
      <div className={styles.matchScroll}>
        {results.map((result) => {
          const key = entryKey(result);
          const matchCount = result.matches.reduce((sum, m) => sum + m.count, 0);
          return (
            <div key={key} className={styles.matchEntry}>
              <label className={styles.matchEntryHeader}>
                <input type="checkbox" checked={selectedKeys.has(key)} onChange={() => onToggle(key)} />
                <span className={styles.matchEntryTitle}>{result.entryTitle}</span>
                <span className={styles.chip}>{result.locale}</span>
                <span className={styles.muted}>
                  {result.contentTypeTitle} · <span className={styles.mono}>{result.entryUid}</span> · {matchCount}{" "}
                  {matchCount === 1 ? "match" : "matches"}
                </span>
              </label>
              <div className={styles.matchFields}>
                {result.matches.map((field) => (
                  <div key={field.path} className={styles.matchField}>
                    <div className={styles.matchFieldPath}>
                      <span className={styles.mono}>{field.path}</span>
                      {field.count > 1 && <span className={styles.chip}>×{field.count}</span>}
                    </div>
                    <div className={styles.matchDiff}>
                      <Snippet snippet={field.before} removed />
                      <span className={styles.diffArrow}>→</span>
                      <Snippet snippet={field.after} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MatchList;
