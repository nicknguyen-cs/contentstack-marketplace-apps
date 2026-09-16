import React from "react";
import styles from "../BranchConsole.module.css";
import { CompareItem, compareItemKey } from "../types";

interface CompareViewProps {
  items: CompareItem[];
  loading: boolean;
  error: string | null;
  baseBranch: string;
  compareBranch: string;
  cherryPick: boolean;
  selectedKeys: ReadonlySet<string>;
  onToggleItem: (key: string) => void;
  onToggleAll: (selectAll: boolean) => void;
  onRefresh: () => void;
}

const statusBadge = (item: CompareItem, compareBranch: string, baseBranch: string) => {
  switch (item.status) {
    case "compare_only":
      return <span className={`${styles.badge} ${styles.badgeNew}`}>New in {compareBranch}</span>;
    case "modified":
      return <span className={`${styles.badge} ${styles.badgeModified}`}>Modified</span>;
    case "base_only":
      return <span className={`${styles.badge} ${styles.badgeBaseOnly}`}>Only in {baseBranch}</span>;
    default:
      return <span className={styles.badge}>{item.status}</span>;
  }
};

const typeLabel = (item: CompareItem) =>
  item.type === "global_field" ? "Global field" : "Content type";

/**
 * Schema diff between the two branches (content types + global fields — the
 * scope the CMA merge API supports). In cherry-pick mode each row gets a
 * checkbox that feeds item_merge_strategies.
 */
const CompareView: React.FC<CompareViewProps> = ({
  items,
  loading,
  error,
  baseBranch,
  compareBranch,
  cherryPick,
  selectedKeys,
  onToggleItem,
  onToggleAll,
  onRefresh,
}) => {
  const bothPicked = !!baseBranch && !!compareBranch && baseBranch !== compareBranch;
  const allSelected = items.length > 0 && items.every((i) => selectedKeys.has(compareItemKey(i)));

  return (
    <div className={styles.card}>
      <div className={styles.cardHeaderRow}>
        <h4 className={styles.cardTitle}>
          Changes: <span className={styles.mono}>{compareBranch || "?"}</span> →{" "}
          <span className={styles.mono}>{baseBranch || "?"}</span>
        </h4>
        <button className={styles.btn} onClick={onRefresh} disabled={!bothPicked || loading}>
          {loading ? "Comparing…" : "Refresh"}
        </button>
      </div>

      {!bothPicked ? (
        <p className={styles.muted}>Pick a source and a target branch to see the schema diff.</p>
      ) : error ? (
        <div className={`${styles.banner} ${styles.bannerError}`}>{error}</div>
      ) : loading && items.length === 0 ? (
        <p className={styles.muted}>Comparing branches…</p>
      ) : items.length === 0 ? (
        <p className={styles.muted}>
          No schema differences — content types and global fields are identical between these
          branches.
        </p>
      ) : (
        <div className={styles.scrollX}>
          <table className={styles.table}>
            <thead>
              <tr>
                {cherryPick && (
                  <th style={{ width: 32 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => onToggleAll(e.target.checked)}
                      aria-label="Select all items"
                    />
                  </th>
                )}
                <th>Item</th>
                <th>Kind</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const key = compareItemKey(item);
                return (
                  <tr key={key}>
                    {cherryPick && (
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(key)}
                          onChange={() => onToggleItem(key)}
                          aria-label={`Select ${item.title ?? item.uid}`}
                        />
                      </td>
                    )}
                    <td>
                      <div>{item.title ?? item.uid}</div>
                      <div className={`${styles.mono} ${styles.muted}`}>{item.uid}</div>
                    </td>
                    <td>{typeLabel(item)}</td>
                    <td>{statusBadge(item, compareBranch, baseBranch)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CompareView;
