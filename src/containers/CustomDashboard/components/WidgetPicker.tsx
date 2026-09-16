import React from "react";
import { WidgetManifest } from "../types";

interface WidgetPickerProps {
  allWidgets: WidgetManifest[];
  activeIds: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  content: "Content",
  workflow: "Workflow",
  analytics: "Analytics",
};

const WidgetPicker: React.FC<WidgetPickerProps> = ({ allWidgets, activeIds, onToggle, onClose }) => {
  const grouped = allWidgets.reduce<Record<string, WidgetManifest[]>>((acc, w) => {
    (acc[w.category] = acc[w.category] || []).push(w);
    return acc;
  }, {});

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "10px",
          padding: "24px",
          width: "480px",
          maxWidth: "90vw",
          maxHeight: "80vh",
          overflow: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>Manage Widgets</h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: "18px",
              cursor: "pointer",
              color: "#6c7589",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {Object.entries(grouped).map(([category, widgets]) => (
          <div key={category} style={{ marginBottom: "20px" }}>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#9aa3af",
                marginBottom: "8px",
              }}
            >
              {CATEGORY_LABELS[category] ?? category}
            </div>
            {widgets.map((w) => {
              const isActive = activeIds.includes(w.id);
              return (
                <div
                  key={w.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    border: "1px solid #e8eaf0",
                    marginBottom: "6px",
                    background: isActive ? "#f8f7ff" : "#fff",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "#1c2b36" }}>{w.title}</div>
                    <div style={{ fontSize: "12px", color: "#6c7589", marginTop: "2px" }}>{w.description}</div>
                  </div>
                  <button
                    onClick={() => onToggle(w.id)}
                    style={{
                      marginLeft: "12px",
                      padding: "5px 12px",
                      border: "1px solid",
                      borderRadius: "4px",
                      fontSize: "12px",
                      fontWeight: 500,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      ...(isActive
                        ? { background: "#fff", borderColor: "#d3d8de", color: "#6c7589" }
                        : { background: "#6c47ff", borderColor: "#6c47ff", color: "#fff" }),
                    }}
                  >
                    {isActive ? "Remove" : "Add"}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default WidgetPicker;
