import React, { useState } from "react";
import styles from "../BranchConsole.module.css";
import { CompareItem, MergeStrategy } from "../types";
import ConfirmDialog from "../../../components/ConfirmDialog";

export type MergeMode = "all" | "cherry_pick";

// "ignore" is excluded — it's the internal strategy used for cherry-picking.
const GLOBAL_STRATEGIES: Array<{ value: MergeStrategy; label: string; description: string }> = [
  {
    value: "merge_prefer_compare",
    label: "Merge, source wins",
    description: "Merge everything; when an item differs in both branches, keep the source version.",
  },
  {
    value: "merge_prefer_base",
    label: "Merge, target wins",
    description: "Merge everything; when an item differs in both branches, keep the target version.",
  },
  {
    value: "merge_new_only",
    label: "New items only",
    description: "Only add items that exist in the source but not yet in the target.",
  },
  {
    value: "merge_modified_only_prefer_compare",
    label: "Modified only, source wins",
    description: "Only update items modified in both branches, keeping the source version.",
  },
  {
    value: "merge_modified_only_prefer_base",
    label: "Modified only, target wins",
    description: "Only update items modified in both branches, keeping the target version.",
  },
  {
    value: "overwrite_with_compare",
    label: "Overwrite target",
    description:
      "Replace the target's content types and global fields entirely with the source's. Destructive — items missing from the source are removed from the target.",
  },
];

const CHERRY_STRATEGIES: Array<{ value: MergeStrategy; label: string }> = [
  { value: "merge_prefer_compare", label: "Source wins on conflict" },
  { value: "merge_prefer_base", label: "Target wins on conflict" },
  { value: "overwrite_with_compare", label: "Overwrite item with source version" },
];

interface MergeWizardProps {
  baseBranch: string;
  compareBranch: string;
  totalChanges: number;
  selectedItems: CompareItem[];
  mode: MergeMode;
  onModeChange: (mode: MergeMode) => void;
  merging: boolean;
  onMerge: (options: {
    strategy: MergeStrategy;
    itemStrategy: MergeStrategy;
    comment: string;
    createRevertBranch: boolean;
  }) => void;
  /** Downloads a JSON schema snapshot of the target branch. */
  onDownloadSnapshot: () => Promise<void>;
  /** The diff (CompareView) — rendered between the settings and the review/merge step. */
  children?: React.ReactNode;
}

/**
 * Strategy selection + confirmation for a merge. Cherry-pick mode sends
 * default_merge_strategy=ignore with per-item strategies for the selection.
 */
const MergeWizard: React.FC<MergeWizardProps> = ({
  baseBranch,
  compareBranch,
  totalChanges,
  selectedItems,
  mode,
  onModeChange,
  merging,
  onMerge,
  onDownloadSnapshot,
  children,
}) => {
  const [strategy, setStrategy] = useState<MergeStrategy>("merge_prefer_compare");
  const [itemStrategy, setItemStrategy] = useState<MergeStrategy>("merge_prefer_compare");
  const [comment, setComment] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Default ON: merges create a revert (backup) branch unless explicitly opted out.
  const [createRevertBranch, setCreateRevertBranch] = useState(true);
  const [snapshotBusy, setSnapshotBusy] = useState(false);

  const ready = !!baseBranch && !!compareBranch && baseBranch !== compareBranch;
  const cherryPick = mode === "cherry_pick";
  const itemCount = cherryPick ? selectedItems.length : totalChanges;
  const canMerge = ready && !merging && itemCount > 0;

  const handleConfirm = () => {
    setConfirmOpen(false);
    onMerge({ strategy, itemStrategy, comment: comment.trim(), createRevertBranch });
  };

  const handleSnapshot = async () => {
    setSnapshotBusy(true);
    try {
      await onDownloadSnapshot();
    } finally {
      setSnapshotBusy(false);
    }
  };

  return (
    <>
    <div className={styles.card}>
      <h4 className={styles.cardTitle}>Merge settings</h4>

      <div className={styles.radioGroup} style={{ marginBottom: 16 }}>
        <label className={styles.radioOption}>
          <input
            type="radio"
            name="merge-mode"
            checked={!cherryPick}
            onChange={() => onModeChange("all")}
          />
          <span>
            <span className={styles.radioLabel}>Merge all changes</span>
            <div className={styles.radioDescription}>
              Apply one strategy to every changed item.
            </div>
          </span>
        </label>
        <label className={styles.radioOption}>
          <input
            type="radio"
            name="merge-mode"
            checked={cherryPick}
            onChange={() => onModeChange("cherry_pick")}
          />
          <span>
            <span className={styles.radioLabel}>Cherry-pick items</span>
            <div className={styles.radioDescription}>
              Merge only the items you check in the diff below; everything else is left untouched.
            </div>
          </span>
        </label>
      </div>

      {cherryPick ? (
        <div className={styles.field} style={{ marginBottom: 12 }}>
          <label className={styles.fieldLabel}>Strategy for the selected items</label>
          <select
            className={styles.select}
            value={itemStrategy}
            onChange={(e) => setItemStrategy(e.target.value as MergeStrategy)}
          >
            {CHERRY_STRATEGIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className={styles.field} style={{ marginBottom: 12 }}>
          <label className={styles.fieldLabel}>Merge strategy</label>
          <select
            className={styles.select}
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as MergeStrategy)}
          >
            {GLOBAL_STRATEGIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <div className={styles.radioDescription}>
            {GLOBAL_STRATEGIES.find((s) => s.value === strategy)?.description}
          </div>
        </div>
      )}

      <div className={styles.radioGroup} style={{ marginBottom: 12 }}>
        <label className={styles.radioOption}>
          <input
            type="checkbox"
            checked={createRevertBranch}
            onChange={(e) => setCreateRevertBranch(e.target.checked)}
          />
          <span>
            <span className={styles.radioLabel}>Create revert branch (recommended)</span>
            <div className={styles.radioDescription}>
              Contentstack backs up <span className={styles.mono}>{baseBranch || "the target"}</span>{" "}
              before merging so the merge can be undone from the Revert tab. Uncheck only if backup
              creation is failing on this stack (known Contentstack bug on am_v2 stacks) — the merge
              then runs with <span className={styles.mono}>no_revert=true</span> and cannot be
              reverted from this app.
            </div>
          </span>
        </label>
        {!createRevertBranch && (
          <div className={`${styles.banner} ${styles.bannerError}`} style={{ marginBottom: 0 }}>
            <span>
              No revert branch will be created — this merge cannot be undone from the Revert tab.
              Download a schema snapshot of{" "}
              <span className={styles.mono}>{baseBranch || "the target"}</span> first as a manual
              restore reference.
            </span>
            <button
              type="button"
              className={styles.btn}
              onClick={() => void handleSnapshot()}
              disabled={!baseBranch || snapshotBusy}
            >
              {snapshotBusy ? "Exporting…" : "Download snapshot"}
            </button>
          </div>
        )}
      </div>
    </div>

    {children}

    <div className={styles.card}>
      <h4 className={styles.cardTitle}>Review &amp; merge</h4>

      <div className={styles.field} style={{ marginBottom: 12, minWidth: 0 }}>
        <label className={styles.fieldLabel}>Merge comment (recommended)</label>
        <textarea
          className={styles.textarea}
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Why this merge? Shows up in the merge job history."
        />
      </div>

      <div className={styles.summaryBox}>
        {ready ? (
          <>
            Merging <strong>{itemCount}</strong> item{itemCount === 1 ? "" : "s"} from{" "}
            <span className={styles.mono}>{compareBranch}</span> into{" "}
            <span className={styles.mono}>{baseBranch}</span>.{" "}
            {createRevertBranch ? (
              <>
                A revert branch of <span className={styles.mono}>{baseBranch}</span> is created
                automatically, so this can be undone from the Revert tab.
              </>
            ) : (
              <strong>No revert branch will be created — this merge cannot be undone.</strong>
            )}{" "}
            Entries and assets are not affected — branch merge covers content types and global
            fields only.
          </>
        ) : (
          "Pick a source and target branch to enable merging."
        )}
      </div>

      <button
        className={`${styles.btn} ${styles.btnPrimary}`}
        disabled={!canMerge}
        onClick={() => setConfirmOpen(true)}
      >
        {merging ? "Merging…" : cherryPick ? "Merge selected items" : "Merge branches"}
      </button>
      {cherryPick && selectedItems.length === 0 && (
        <span className={styles.muted} style={{ marginLeft: 10 }}>
          Check at least one item in the diff above to merge.
        </span>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm merge"
        danger={!createRevertBranch || (!cherryPick && strategy === "overwrite_with_compare")}
        body={
          <p>
            This merges <strong>{itemCount}</strong> item{itemCount === 1 ? "" : "s"} from{" "}
            <span className={styles.mono}>{compareBranch}</span> into{" "}
            <span className={styles.mono}>{baseBranch}</span>
            {cherryPick
              ? " (cherry-pick)"
              : ` using ${GLOBAL_STRATEGIES.find((s) => s.value === strategy)?.label ?? strategy}`}
            .{" "}
            {createRevertBranch ? (
              "A revert branch is created first."
            ) : (
              <strong>No revert branch will be created — this cannot be undone from the app.</strong>
            )}
          </p>
        }
        confirmWord={baseBranch}
        confirmLabel="Start merge"
        busy={merging}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
    </>
  );
};

export default MergeWizard;
