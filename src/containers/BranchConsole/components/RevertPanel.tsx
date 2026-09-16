import React, { useMemo, useState } from "react";
import styles from "../BranchConsole.module.css";
import { Branch, MergeJob } from "../types";
import ConfirmDialog from "../../../components/ConfirmDialog";

interface RevertPanelProps {
  branches: Branch[];
  jobs: MergeJob[];
  reverting: boolean;
  onRevert: (backupBranch: string, targetBranch: string) => void;
}

/**
 * Contentstack has no revert endpoint. Every merge auto-creates a backup
 * branch of the base branch; reverting = merging that backup back into the
 * target with overwrite_with_compare, restoring the pre-merge schema.
 */
const RevertPanel: React.FC<RevertPanelProps> = ({ branches, jobs, reverting, onRevert }) => {
  const [backupBranch, setBackupBranch] = useState("");
  const [targetBranch, setTargetBranch] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Backup branches first — they're the usual revert source.
  const sortedBranches = useMemo(() => {
    const isBackup = (b: Branch) => b.uid.toLowerCase().includes("backup");
    return [...branches].sort((a, b) => Number(isBackup(b)) - Number(isBackup(a)));
  }, [branches]);

  const mergedBases = useMemo(() => {
    const bases = jobs
      .map((j) => j.merge_details?.base_branch ?? j.params?.base_branch)
      .filter((b): b is string => !!b);
    return Array.from(new Set(bases));
  }, [jobs]);

  const ready = !!backupBranch && !!targetBranch && backupBranch !== targetBranch;

  return (
    <div className={styles.card}>
      <h4 className={styles.cardTitle}>Revert a merge</h4>
      <p className={styles.muted} style={{ marginTop: 0 }}>
        Merges create a revert (backup) branch of the target before applying changes — unless
        &quot;Create revert branch&quot; was unchecked for that merge. Reverting restores the
        target&apos;s content types and global fields from that backup (using an overwrite merge).
        Entries are unaffected.
        {mergedBases.length > 0 && (
          <>
            {" "}
            Branches merged into recently: <span className={styles.mono}>{mergedBases.join(", ")}</span>.
          </>
        )}
      </p>

      <div className={styles.pickerRow} style={{ marginBottom: 12 }}>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Restore from (backup branch)</label>
          <select
            className={styles.select}
            value={backupBranch}
            onChange={(e) => setBackupBranch(e.target.value)}
          >
            <option value="">Select a branch…</option>
            {sortedBranches.map((b) => (
              <option key={b.uid} value={b.uid}>
                {b.uid}
                {b.uid.toLowerCase().includes("backup") ? " (backup)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Branch to restore (target)</label>
          <select
            className={styles.select}
            value={targetBranch}
            onChange={(e) => setTargetBranch(e.target.value)}
          >
            <option value="">Select a branch…</option>
            {branches.map((b) => (
              <option key={b.uid} value={b.uid}>
                {b.uid}
              </option>
            ))}
          </select>
        </div>
      </div>

      {ready && (
        <div className={styles.summaryBox}>
          The schema of <span className={styles.mono}>{targetBranch}</span> will be overwritten to
          match <span className={styles.mono}>{backupBranch}</span> exactly. A fresh backup of{" "}
          <span className={styles.mono}>{targetBranch}</span> is created before the revert runs.
        </div>
      )}

      <button
        className={`${styles.btn} ${styles.btnDanger}`}
        disabled={!ready || reverting}
        onClick={() => setConfirmOpen(true)}
      >
        {reverting ? "Reverting…" : "Revert"}
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm revert"
        danger
        body={
          <p>
            This overwrites all content types and global fields of{" "}
            <span className={styles.mono}>{targetBranch}</span> with the versions from{" "}
            <span className={styles.mono}>{backupBranch}</span>.
          </p>
        }
        confirmWord={targetBranch}
        confirmLabel="Revert branch"
        busy={reverting}
        onConfirm={() => {
          setConfirmOpen(false);
          onRevert(backupBranch, targetBranch);
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};

export default RevertPanel;
