import React from "react";

interface WidgetGridProps {
  children: React.ReactNode;
}

const WidgetGrid: React.FC<WidgetGridProps> = ({ children }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: "16px",
    }}
  >
    {children}
  </div>
);

export default WidgetGrid;
