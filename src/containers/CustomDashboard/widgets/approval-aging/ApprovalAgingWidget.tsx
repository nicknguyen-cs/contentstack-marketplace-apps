import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { WidgetProps, Entry } from "../../types";

interface AgingBucket {
  label: string;
  count: number;
  color: string;
}

function getDaysWaiting(entry: Entry): number {
  const updated = new Date(entry.updated_at).getTime();
  const now = Date.now();
  return (now - updated) / (1000 * 60 * 60 * 24);
}

function bucketEntries(entries: Entry[]): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { label: "<1 day", count: 0, color: "#417505" },
    { label: "1–3 days", count: 0, color: "#f5a623" },
    { label: "3–7 days", count: 0, color: "#e8760a" },
    { label: "7+ days", count: 0, color: "#d0021b" },
  ];

  for (const entry of entries) {
    const days = getDaysWaiting(entry);
    if (days < 1) buckets[0].count++;
    else if (days < 3) buckets[1].count++;
    else if (days < 7) buckets[2].count++;
    else buckets[3].count++;
  }

  return buckets;
}

const ApprovalAgingWidget: React.FC<WidgetProps<Entry[]>> = ({ data, loading, error }) => {
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

  if (!data || data.length === 0) {
    return <div style={{ padding: "24px", textAlign: "center", color: "#6c7589" }}>No entries awaiting approval</div>;
  }

  const buckets = bucketEntries(data);
  const sorted = [...data].sort((a, b) => getDaysWaiting(b) - getDaysWaiting(a));

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ marginBottom: "4px", fontSize: "12px", color: "#6c7589" }}>
        {data.length} entries awaiting approval
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={buckets} layout="vertical" margin={{ top: 4, right: 16, left: 60, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8eaf0" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} width={60} />
          <Tooltip formatter={(value: number) => [`${value} entries`, "Count"]} />
          <Bar dataKey="count" radius={[0, 2, 2, 0]}>
            {buckets.map((bucket, index) => (
              <Cell key={index} fill={bucket.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div style={{ marginTop: "16px", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e8eaf0" }}>
              <Th>Title</Th>
              <Th>Content Type</Th>
              <Th>Stage</Th>
              <Th>Days Waiting</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry) => {
              const days = getDaysWaiting(entry);
              return (
                <tr key={entry.uid} style={{ borderBottom: "1px solid #f0f1f3" }}>
                  <Td>{entry.title}</Td>
                  <Td style={{ color: "#6c7589" }}>{entry.content_type_uid.replace(/-/g, " ")}</Td>
                  <Td>
                    {entry.workflow_stage && (
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: "10px",
                          fontSize: "11px",
                          background: entry.workflow_stage.color + "22",
                          color: entry.workflow_stage.color,
                          fontWeight: 500,
                        }}
                      >
                        {entry.workflow_stage.name}
                      </span>
                    )}
                  </Td>
                  <Td style={{ fontWeight: 500, color: days >= 7 ? "#d0021b" : days >= 3 ? "#e8760a" : "#1c2b36" }}>
                    {days < 1 ? "<1" : Math.floor(days)}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Th: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <th style={{ textAlign: "left", padding: "6px 8px", color: "#6c7589", fontWeight: 600, fontSize: "11px", textTransform: "uppercase" }}>
    {children}
  </th>
);

const Td: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <td style={{ padding: "7px 8px", ...style }}>{children}</td>
);

export default ApprovalAgingWidget;
