import { WidgetModule, Entry, WorkflowStage, CallCmaApi, DashboardFilters } from "../../types";
import ApprovalAgingWidget from "./ApprovalAgingWidget";

interface CmaWorkflowStage {
  uid: string;
  name: string;
  color?: string;
  require_approval?: boolean;
}

interface CmaWorkflow {
  uid: string;
  workflow_stages?: CmaWorkflowStage[];
}

interface CmaEntry {
  uid: string;
  title: string;
  locale: string;
  _version: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  publish_details?: Array<{ version: number; time?: string }>;
  _workflow?: {
    workflow_stage?: {
      uid: string;
      title?: string;
      color?: string;
    };
  };
}

function resolveWorkflowStage(
  entry: CmaEntry,
  workflows: CmaWorkflow[]
): WorkflowStage | undefined {
  const stageRef = entry._workflow?.workflow_stage;
  if (!stageRef) return undefined;

  for (const wf of workflows) {
    const stage = (wf.workflow_stages ?? []).find((s) => s.uid === stageRef.uid);
    if (stage) {
      return {
        uid: stage.uid,
        name: stage.name,
        color: stage.color ?? stageRef.color ?? "#6c7589",
        require_approval: stage.require_approval ?? false,
      };
    }
  }

  // Stage not found in workflow data; build minimal object from entry ref
  return {
    uid: stageRef.uid,
    name: stageRef.title ?? stageRef.uid,
    color: stageRef.color ?? "#6c7589",
    require_approval: true, // queried with require_approval filter
  };
}

function computeStatus(entry: CmaEntry): Entry["status"] {
  if (!entry.publish_details?.length) return "draft";
  if (entry._version === entry.publish_details[0].version) return "published";
  return "modified";
}

function mapCmaEntries(
  cmaEntries: CmaEntry[],
  contentTypeUid: string,
  workflows: CmaWorkflow[]
): Entry[] {
  return cmaEntries.map((e) => ({
    uid: e.uid,
    title: e.title,
    content_type_uid: contentTypeUid,
    locale: e.locale,
    status: computeStatus(e),
    workflow_stage: resolveWorkflowStage(e, workflows),
    created_at: e.created_at,
    updated_at: e.updated_at,
    published_at: e.publish_details?.[0]?.time,
    created_by: e.created_by,
    updated_by: e.updated_by,
  }));
}

async function fetchApprovalAgingData(
  filters: DashboardFilters,
  callCmaApi: CallCmaApi
): Promise<Entry[]> {
  const wfRes = await callCmaApi("/v3/workflows");
  const wfData = await wfRes.json() as { workflows?: CmaWorkflow[] };
  const workflows: CmaWorkflow[] = wfData.workflows ?? [];

  const approvalStageUids: string[] = workflows
    .flatMap((wf) => wf.workflow_stages ?? [])
    .filter((s) => s.require_approval)
    .map((s) => s.uid);

  if (approvalStageUids.length === 0) return [];

  const ctRes = await callCmaApi("/v3/content_types");
  const ctData = await ctRes.json() as { content_types?: Array<{ uid: string }> };
  let contentTypes = ctData.content_types ?? [];
  if (filters.contentType) {
    contentTypes = contentTypes.filter((ct) => ct.uid === filters.contentType);
  }

  const query = JSON.stringify({ "_workflow.workflow_stage.uid": { $in: approvalStageUids } });
  const allEntries: Entry[] = [];

  await Promise.all(
    contentTypes.map(async (ct) => {
      const params = new URLSearchParams({
        include_publish_details: "true",
        limit: "50",
        query,
        ...(filters.locale ? { locale: filters.locale } : {}),
      });
      const res = await callCmaApi(`/v3/content_types/${ct.uid}/entries?${params}`);
      const data = await res.json() as { entries?: CmaEntry[] };
      const entries = mapCmaEntries(data.entries ?? [], ct.uid, workflows);
      allEntries.push(...entries);
    })
  );

  return allEntries;
}

export const approvalAgingWidget: WidgetModule<Entry[]> = {
  manifest: {
    id: "approval-aging",
    title: "Approval Queue Aging",
    description: "Entries stuck in approval workflow stages, grouped by time waiting.",
    category: "workflow",
    supportedFilters: ["contentType", "locale", "workflowStatus"],
    defaultCols: 2,
  },
  fetchData: fetchApprovalAgingData,
  Component: ApprovalAgingWidget,
};
