// Types for the Branch Console — modelled on the CMA branch endpoints:
// /v3/stacks/branches, /v3/stacks/branches_compare, /v3/stacks/branches_merge,
// /v3/stacks/branches_queue

export type CmaCall = (endpoint: string, options?: RequestInit) => Promise<Response>;

export interface Branch {
  uid: string;
  source?: string;
  alias?: Array<{ uid: string }>;
  created_at?: string;
  updated_at?: string;
}

export type CompareItemType = "content_type" | "global_field";

// compare_only: exists only in the compare (source) branch
// base_only: exists only in the base (target) branch
export type CompareStatus = "modified" | "compare_only" | "base_only";

export interface CompareItem {
  uid: string;
  title?: string;
  type: CompareItemType;
  status: CompareStatus;
}

export type MergeStrategy =
  | "merge_prefer_base"
  | "merge_prefer_compare"
  | "merge_new_only"
  | "merge_modified_only_prefer_base"
  | "merge_modified_only_prefer_compare"
  | "overwrite_with_compare"
  | "ignore";

export interface ItemMergeStrategy {
  uid: string;
  type: CompareItemType;
  merge_strategy: MergeStrategy;
}

export interface MergeParams {
  base_branch: string;
  compare_branch: string;
  default_merge_strategy: MergeStrategy;
  merge_comment?: string;
  item_merge_strategies?: ItemMergeStrategy[];
  /** Skips the auto-created revert (backup) branch. Only ever sent on explicit user opt-out. */
  no_revert?: boolean;
}

export interface MergeJob {
  uid: string;
  created_at?: string;
  created_by?: string;
  params?: {
    base_branch?: string;
    compare_branch?: string;
    default_merge_strategy?: string;
    merge_comment?: string;
  };
  merge_details?: {
    base_branch?: string;
    compare_branch?: string;
    status?: string;
  };
  errors?: unknown;
}

export const compareItemKey = (item: Pick<CompareItem, "type" | "uid">): string =>
  `${item.type}:${item.uid}`;

const TERMINAL_JOB_STATUSES = new Set([
  "complete",
  "completed",
  "success",
  "succeeded",
  "failed",
  "failure",
]);

export const mergeJobStatus = (job: MergeJob): string => job.merge_details?.status ?? "unknown";

export const isJobInProgress = (job: MergeJob): boolean => {
  const status = job.merge_details?.status?.toLowerCase();
  return !!status && !TERMINAL_JOB_STATUSES.has(status);
};

export const isJobFailed = (job: MergeJob): boolean => {
  const status = job.merge_details?.status?.toLowerCase();
  return status === "failed" || status === "failure";
};
