import React from "react";

interface DashboardHeaderProps {
  onAddWidget: () => void;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ onAddWidget }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "16px",
    }}
  >
    <div>
      <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 600, color: "#1c2b36" }}>CMS Analytics Dashboard</h1>
      <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#6c7589" }}>
        Content metrics and workflow insights
      </p>
    </div>
    <button
      onClick={onAddWidget}
      style={{
        padding: "8px 16px",
        background: "#6c47ff",
        color: "#fff",
        border: "none",
        borderRadius: "6px",
        fontSize: "13px",
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      + Add Widget
    </button>
  </div>
);

export default DashboardHeader;
