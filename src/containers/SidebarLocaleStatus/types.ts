export interface StackLocale {
  code: string;
  name: string;
  fallback_locale?: string | null;
}

export interface StackEnvironment {
  uid: string;
  name: string;
}

/** One row of an entry's `publish_details` (present with include_publish_details=true). */
export interface PublishDetail {
  environment: string;
  locale: string;
  time: string;
  user?: string;
  version?: number;
}

/** The `_workflow` block the CMA attaches to an entry that sits in a workflow. */
export interface EntryWorkflow {
  uid?: string;
  name?: string;
  color?: string;
  assigned_to?: unknown;
  due_date?: string;
}

/** Subset of a fetched entry that the widget reads. */
export interface FetchedEntry {
  uid?: string;
  locale?: string;
  _version?: number;
  updated_at?: string;
  updated_by?: string;
  publish_details?: PublishDetail[];
  _workflow?: EntryWorkflow;
}

export interface PublishState {
  environmentUid: string;
  environmentName: string;
  time: string;
  /** Entry version that was published; undefined when the API omits it. */
  version?: number;
  /** True when the entry has been saved since this publish. */
  outdated: boolean;
}

export interface LocaleRow {
  code: string;
  name: string;
  isMaster: boolean;
  isCurrent: boolean;
  fallbackLocale: string | null;
  /** True when the entry has its own copy in this locale. */
  localized: boolean;
  /** Locale whose content this row actually serves (differs from `code` when not localized). */
  servedFrom: string | null;
  version: number | null;
  updatedAt: string | null;
  publishes: PublishState[];
  workflow: EntryWorkflow | null;
  /** Per-row load failure — the other rows still render. */
  error: string | null;
}
