import React, { useEffect, useState } from "react";
import styles from "./ConfirmDialog.module.css";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: React.ReactNode;
  /** The word the user must type to enable the confirm button (e.g. target branch uid or locale code). */
  confirmWord: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Typed confirmation dialog for destructive operations — the user must type
 * the confirm word before the confirm button enables.
 */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  body,
  confirmWord,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}) => {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  if (!open) return null;

  const matches = typed.trim() === confirmWord;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={title}>
      <div className={styles.dialog}>
        <h3>{title}</h3>
        <div className={styles.dialogBody}>
          {body}
          <p>
            Type <span className={styles.mono}>{confirmWord}</span> to confirm:
          </p>
          <input
            className={styles.input}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmWord}
            autoFocus
          />
        </div>
        <div className={styles.dialogActions}>
          <button className={styles.btn} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className={`${styles.btn} ${danger ? styles.btnDanger : styles.btnPrimary}`}
            onClick={onConfirm}
            disabled={!matches || busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
