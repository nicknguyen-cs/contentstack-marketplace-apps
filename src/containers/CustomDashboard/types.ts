import React from "react";

// CMS Domain Types

export interface WorkflowStage {
  uid: string;
  name: string;
  color: string; // hex
  require_approval: boolean;
}

export interface Entry {
  uid: string;
  title: string;
  content_type_uid: string;
  locale: string;
  status: "draft" | "published" | "modified";
  workflow_stage?: WorkflowStage;
  created_at: string; // ISO 8601
  updated_at: string;
  published_at?: string;
  created_by: string; // User uid
  updated_by: string;
}

export interface ContentType {
  uid: string;
  title: string;
  description: string;
}

export interface Locale {
  code: string; // e.g. "en-us"
  name: string;
}

export interface User {
  uid: string;
  first_name: string;
  last_name: string;
  email: string;
}

// Filter option for dynamic dropdowns
export interface FilterOption {
  value: string;
  label: string;
}

// Widget System Types

export interface DashboardFilters {
  contentType: string | null;
  locale: string | null;
  workflowStatus: string | null;
  dateRange: { start: string | null; end: string | null };
}

export type CallCmaApi = (endpoint: string, options?: RequestInit) => Promise<Response>;

export interface WidgetManifest {
  id: string;
  title: string;
  description: string;
  category: "content" | "workflow" | "analytics";
  supportedFilters: Array<"contentType" | "locale" | "workflowStatus" | "dateRange">;
  defaultCols: number; // grid columns (1–3)
}

export interface WidgetProps<T = unknown> {
  data: T;
  filters: DashboardFilters;
  loading: boolean;
  error?: string;
}

export interface WidgetModule<T = unknown> {
  manifest: WidgetManifest;
  fetchData: (filters: DashboardFilters, callCmaApi: CallCmaApi) => Promise<T>;
  Component: React.ComponentType<WidgetProps<T>>;
}
