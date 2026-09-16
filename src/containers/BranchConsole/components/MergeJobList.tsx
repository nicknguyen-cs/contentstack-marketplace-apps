import React from "react";
import styles from "../BranchConsole.module.css";
import { MergeJob, isJobFailed, isJobInProgress, mergeJobStatus } from "../types";

interface MergeJobListProps {
  jobs: MergeJob[];
  loading: boolean;
  error: string | null;
  polling: boolean;
  onRefresh: () => void;
}

const statusBadge = (job: MergeJob) => {
  const status = mergeJobStatus(job);
  if (isJobInProgress(job)) {
    return (
      <span className={`${styles.badge} ${styles.badgeInProgress}`}>
        <span className={styles.spinnerDot} />
        {status}
      </span>
    );
  }
  if (isJobFailed(job)) {
    return <span className={`${styles.badge} ${styles.badgeFailed}`}>{status}</span>;
  }
  return <span className={`${styles.badge} ${styles.badgeComplete}`}>{status}</span>;
};

const formatDate = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

const MergeJobList: React.FC<MergeJobListProps> = ({ jobs, loading, error, polling, onRefresh }) => (
  <div className={styles.card}>
    <div className={styles.cardHeaderRow}>
      <h4 className={styles.cardTitle}>
        Merge jobs
        {polling && <span className={styles.chip}>auto-refreshing</span>}
      </h4>
      <button className={styles.btn} onClick={onRefresh} disabled={loading}>
        Refresh
      </button>
    </div>

    {error ? (
      <div className={`${styles.banner} ${styles.bannerError}`}>{error}</div>
    ) : loading && jobs.length === 0 ? (
      <p className={styles.muted}>Loading merge jobs…</p>
    ) : jobs.length === 0 ? (
      <p className={styles.muted}>No merges have run on this stack yet.</p>
    ) : (
      <div className={styles.scrollX}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Status</th>
              <th>Direction</th>
              <th>Strategy</th>
              <th>Comment</th>
              <th>Started</th>
              <th>Job</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const base = job.merge_details?.base_branch ?? job.params?.base_branch ?? "?";
              const compare =
                job.merge_details?.compare_branch ?? job.params?.compare_branch ?? "?";
              const hasErrors =
                job.errors != null && (!Array.isArray(job.errors) || job.errors.length > 0);
              return (
                <tr key={job.uid}>
                  <td>{statusBadge(job)}</td>
                  <td>
                    <span className={styles.mono}>
                      {compare} → {base}
                    </span>
                  </td>
                  <td className={styles.mono}>{job.params?.default_merge_strategy ?? "—"}</td>
                  <td>
                    {job.params?.merge_comment || <span className={styles.muted}>—</span>}
                    {hasErrors && (
                      <details>
                        <summary className={styles.muted}>errors</summary>
                        <pre className={styles.mono} style={{ whiteSpace: "pre-wrap" }}>
                          {JSON.stringify(job.errors, null, 2)}
                        </pre>
                      </details>
                    )}
                  </td>
                  <td>{formatDate(job.created_at)}</td>
                  <td className={styles.mono}>{job.uid.slice(0, 8)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

export default MergeJobList;
