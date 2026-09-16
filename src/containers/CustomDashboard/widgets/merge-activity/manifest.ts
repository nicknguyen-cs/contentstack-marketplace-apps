import { WidgetModule, CallCmaApi, DashboardFilters } from "../../types";
import MergeActivityWidget from "./MergeActivityWidget";

export interface MergeActivityJob {
  uid: string;
  status: string;
  baseBranch: string;
  compareBranch: string;
  comment: string;
  createdAt: string;
}

export interface MergeActivityData {
  branchCount: number;
  jobs: MergeActivityJob[];
}

interface QueueJob {
  uid: string;
  created_at?: string;
  params?: { base_branch?: string; compare_branch?: string; merge_comment?: string };
  merge_details?: { base_branch?: string; compare_branch?: string; status?: string };
}

async function fetchMergeActivity(
  _filters: DashboardFilters,
  callCmaApi: CallCmaApi
): Promise<MergeActivityData> {
  let branchCount = 0;
  try {
    const branchesRes = await callCmaApi("/v3/stacks/branches");
    const branchesData = (await branchesRes.json()) as { branches?: Array<{ uid: string }> };
    branchCount = (branchesData.branches ?? []).length;
  } catch {
    throw new Error(
      "Branches unavailable — enable Branches on this stack and set a Management Token in the app configuration."
    );
  }

  const queueRes = await callCmaApi("/v3/stacks/branches_queue");
  const queueData = (await queueRes.json()) as { queue?: QueueJob[] };
  const jobs = (queueData.queue ?? []).slice(0, 5).map((job) => ({
    uid: job.uid,
    status: job.merge_details?.status ?? "unknown",
    baseBranch: job.merge_details?.base_branch ?? job.params?.base_branch ?? "?",
    compareBranch: job.merge_details?.compare_branch ?? job.params?.compare_branch ?? "?",
    comment: job.params?.merge_comment ?? "",
    createdAt: job.created_at ?? "",
  }));

  return { branchCount, jobs };
}

export const mergeActivityWidget: WidgetModule<MergeActivityData> = {
  manifest: {
    id: "merge-activity",
    title: "Branch Merge Activity",
    description: "Branch count and the latest merge jobs on this stack. Run merges from the Branch Console app.",
    category: "workflow",
    supportedFilters: [],
    defaultCols: 1,
  },
  fetchData: fetchMergeActivity,
  Component: MergeActivityWidget,
};
