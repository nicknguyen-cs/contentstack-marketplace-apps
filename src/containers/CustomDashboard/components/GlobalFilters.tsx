import React from "react";
import { DashboardFilters, FilterOption } from "../types";

interface GlobalFiltersProps {
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
  contentTypeOptions: FilterOption[];
  localeOptions: FilterOption[];
  workflowStageOptions: FilterOption[];
}

const selectStyle: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid #d3d8de",
  borderRadius: "4px",
  fontSize: "13px",
  color: "#1c2b36",
  background: "#fff",
  minWidth: "140px",
  cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#6c7589",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: "4px",
  display: "block",
};

const GlobalFilters: React.FC<GlobalFiltersProps> = ({
  filters,
  onChange,
  contentTypeOptions,
  localeOptions,
  workflowStageOptions,
}) => {
  const set = (key: keyof DashboardFilters, value: DashboardFilters[keyof DashboardFilters]) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "16px",
        padding: "12px 16px",
        background: "#f4f5f7",
        borderRadius: "8px",
        marginBottom: "20px",
        alignItems: "flex-end",
      }}
    >
      <div>
        <label style={labelStyle}>Content Type</label>
        <select
          style={selectStyle}
          value={filters.contentType ?? ""}
          onChange={(e) => set("contentType", e.target.value || null)}
        >
          <option value="">All</option>
          {contentTypeOptions.map((ct) => (
            <option key={ct.value} value={ct.value}>
              {ct.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>Locale</label>
        <select
          style={selectStyle}
          value={filters.locale ?? ""}
          onChange={(e) => set("locale", e.target.value || null)}
        >
          <option value="">All</option>
          {localeOptions.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>Workflow Status</label>
        <select
          style={selectStyle}
          value={filters.workflowStatus ?? ""}
          onChange={(e) => set("workflowStatus", e.target.value || null)}
        >
          <option value="">All</option>
          {workflowStageOptions.map((ws) => (
            <option key={ws.value} value={ws.value}>
              {ws.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>Date From</label>
        <input
          type="date"
          style={selectStyle}
          value={filters.dateRange.start ?? ""}
          onChange={(e) =>
            set("dateRange", { ...filters.dateRange, start: e.target.value || null })
          }
        />
      </div>

      <div>
        <label style={labelStyle}>Date To</label>
        <input
          type="date"
          style={selectStyle}
          value={filters.dateRange.end ?? ""}
          onChange={(e) =>
            set("dateRange", { ...filters.dateRange, end: e.target.value || null })
          }
        />
      </div>

      <button
        style={{
          padding: "6px 12px",
          background: "transparent",
          border: "1px solid #d3d8de",
          borderRadius: "4px",
          fontSize: "12px",
          color: "#6c7589",
          cursor: "pointer",
        }}
        onClick={() =>
          onChange({
            contentType: null,
            locale: null,
            workflowStatus: null,
            dateRange: { start: null, end: null },
          })
        }
      >
        Clear
      </button>
    </div>
  );
};

export default GlobalFilters;
