import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { WidgetProps } from "../../types";
import { DraftPublishedRow } from "./manifest";

const COLORS = {
  draft: "#f5a623",
  published: "#417505",
  modified: "#4a90e2",
};

const DraftPublishedWidget: React.FC<WidgetProps<DraftPublishedRow[]>> = ({ data, loading, error }) => {
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
    return <div style={{ padding: "24px", textAlign: "center", color: "#6c7589" }}>No data available</div>;
  }

  const totals = data.reduce(
    (acc, row) => ({
      total: acc.total + row.draft + row.published + row.modified,
      published: acc.published + row.published,
      draft: acc.draft + row.draft,
    }),
    { total: 0, published: 0, draft: 0 }
  );

  const pctPublished = totals.total > 0 ? Math.round((totals.published / totals.total) * 100) : 0;
  const pctDraft = totals.total > 0 ? Math.round((totals.draft / totals.total) * 100) : 0;

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ display: "flex", gap: "24px", marginBottom: "20px" }}>
        <KpiCard label="Total Entries" value={totals.total} />
        <KpiCard label="Published" value={`${pctPublished}%`} color={COLORS.published} />
        <KpiCard label="Draft" value={`${pctDraft}%`} color={COLORS.draft} />
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8eaf0" />
          <XAxis dataKey="contentType" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Bar dataKey="draft" name="Draft" fill={COLORS.draft} radius={[2, 2, 0, 0]} />
          <Bar dataKey="published" name="Published" fill={COLORS.published} radius={[2, 2, 0, 0]} />
          <Bar dataKey="modified" name="Modified" fill={COLORS.modified} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

interface KpiCardProps {
  label: string;
  value: string | number;
  color?: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, color }) => (
  <div
    style={{
      flex: 1,
      background: "#f4f5f7",
      borderRadius: "6px",
      padding: "12px 16px",
      minWidth: 0,
    }}
  >
    <div style={{ fontSize: "11px", color: "#6c7589", textTransform: "uppercase", letterSpacing: "0.05em" }}>
      {label}
    </div>
    <div style={{ fontSize: "22px", fontWeight: 600, marginTop: "4px", color: color || "#1c2b36" }}>{value}</div>
  </div>
);

export default DraftPublishedWidget;
