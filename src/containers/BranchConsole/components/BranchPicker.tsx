import React from "react";
import styles from "../BranchConsole.module.css";
import { Branch } from "../types";

interface BranchPickerProps {
  branches: Branch[];
  /** Source of the changes (CMA "compare_branch"). */
  compare: string;
  /** Target that receives the changes (CMA "base_branch"). */
  base: string;
  onCompareChange: (uid: string) => void;
  onBaseChange: (uid: string) => void;
  onSwap: () => void;
  disabled?: boolean;
}

const BranchPicker: React.FC<BranchPickerProps> = ({
  branches,
  compare,
  base,
  onCompareChange,
  onBaseChange,
  onSwap,
  disabled,
}) => {
  const renderOptions = () => (
    <>
      <option value="">Select a branch…</option>
      {branches.map((b) => (
        <option key={b.uid} value={b.uid}>
          {b.uid}
          {b.alias?.length ? ` (alias: ${b.alias.map((a) => a.uid).join(", ")})` : ""}
        </option>
      ))}
    </>
  );

  return (
    <div className={styles.pickerRow}>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Merge changes from (source)</label>
        <select
          className={styles.select}
          value={compare}
          onChange={(e) => onCompareChange(e.target.value)}
          disabled={disabled}
        >
          {renderOptions()}
        </select>
      </div>

      <button
        type="button"
        className={`${styles.btn} ${styles.swapBtn}`}
        onClick={onSwap}
        disabled={disabled || (!base && !compare)}
        title="Swap direction — move updates the other way"
      >
        ⇄ Swap
      </button>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>Into (target)</label>
        <select
          className={styles.select}
          value={base}
          onChange={(e) => onBaseChange(e.target.value)}
          disabled={disabled}
        >
          {renderOptions()}
        </select>
      </div>

      {base && compare && base === compare && (
        <span className={styles.muted}>Source and target must be different branches.</span>
      )}
    </div>
  );
};

export default BranchPicker;
