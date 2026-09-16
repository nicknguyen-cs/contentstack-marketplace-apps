import React from "react";
import { WidgetProps } from "../../types";
import { MergeActivityData } from "./manifest";

const STATUS_COLORS: Record<string, string> = {
  complete: "#417505",
  completed: "#417505",
  success: "#417505",
  succeeded: "#417505",
  failed: "#d0021b",
  failure: "#d0021b",
};

const statusColor = (status: string) => STATUS_COLORS[status.toLowerCase()] ?? "#f5a623";

const formatDate = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

const MergeActivityWidget: React.FC<WidgetProps<MergeActivityData>> = ({ data, loading, error }) => {
  if (loading) {
    return <div style={{ padding: "24px", textAlign: "center", color: "#6c7589" }}>Loading...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: "24px", textAlign: "center", color: "#d0021b", fontSize: "13px" }}>
        {error}
      </div>
    );
  }

  if (!data) {
    return <div style={{ padding: "24px", textAlign: "center", color: "#6c7589" }}>No data available</div>;
  }

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "12px" }}>
        <span style={{ fontSize: "22px", fontWeight: 600, color: "#1c2b36" }}>{data.branchCount}</span>
        <span style={{ fontSize: "12px", color: "#6c7589" }}>
          branch{data.branchCount === 1 ? "" : "es"} on this stack
        </span>
      </div>

      {data.jobs.length === 0 ? (
        <div style={{ fontSize: "13px", color: "#6c7589" }}>No merges have run yet.</div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {data.jobs.map((job) => (
            <li
              key={job.uid}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                padding: "8px 0",
                borderBottom: "1px solid #f0f2f7",
                fontSize: "13px",
              }}
            >
              <span
                title={job.status}
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: statusColor(job.status),
                  marginTop: "5px",
                  flexShrink: 0,
                }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ fontFamily: "monospace", fontSize: "12px" }}>
                  {job.compareBranch} → {job.baseBranch}
                </span>
                <span style={{ display: "block", color: "#6c7589", fontSize: "11px" }}>
                  {job.status}
                  {job.createdAt ? ` · ${formatDate(job.createdAt)}` : ""}
                  {job.comment ? ` · ${job.comment}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: "10px", fontSize: "11px", color: "#6c7589" }}>
        Merge, cherry-pick, and revert from the Branch Console app (Apps → Branch Console).
      </div>
    </div>
  );
};

export default MergeActivityWidget;
