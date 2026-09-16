import React from "react";

interface WidgetCardProps {
  title: string;
  cols: number;
  onRemove: () => void;
  children: React.ReactNode;
}

const WidgetCard: React.FC<WidgetCardProps> = ({ title, cols, onRemove, children }) => (
  <div
    style={{
      gridColumn: `span ${Math.min(cols, 4)}`,
      background: "#fff",
      borderRadius: "8px",
      border: "1px solid #e8eaf0",
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      overflow: "hidden",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        borderBottom: "1px solid #f0f1f3",
      }}
    >
      <span style={{ fontSize: "14px", fontWeight: 600, color: "#1c2b36" }}>{title}</span>
      <button
        onClick={onRemove}
        title="Remove widget"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "#9aa3af",
          fontSize: "16px",
          lineHeight: 1,
          padding: "2px 4px",
          borderRadius: "4px",
        }}
      >
        ✕
      </button>
    </div>
    <div>{children}</div>
  </div>
);

export default WidgetCard;
