import { Branch, CmaCall, CompareItem, MergeJob, MergeParams } from "./types";

const COMPARE_PAGE_LIMIT = 100;
const MAX_COMPARE_PAGES = 20;

export async function listBranches(callCmaApi: CmaCall): Promise<Branch[]> {
  const res = await callCmaApi("/v3/stacks/branches");
  const data = (await res.json()) as { branches?: Branch[] };
  return data.branches ?? [];
}

export async function compareBranches(
  callCmaApi: CmaCall,
  baseBranch: string,
  compareBranch: string
): Promise<CompareItem[]> {
  const items: CompareItem[] = [];

  for (let page = 0; page < MAX_COMPARE_PAGES; page++) {
    const params = new URLSearchParams({
      base_branch: baseBranch,
      compare_branch: compareBranch,
      limit: String(COMPARE_PAGE_LIMIT),
      skip: String(page * COMPARE_PAGE_LIMIT),
    });
    const res = await callCmaApi(`/v3/stacks/branches_compare?${params}`);
    const data = (await res.json()) as { diff?: CompareItem[] };
    const diff = data.diff ?? [];
    items.push(...diff);
    if (diff.length < COMPARE_PAGE_LIMIT) break;
  }

  return items;
}

// By default every merge leaves an auto-created revert (backup) branch that
// RevertPanel can merge back. no_revert is sent ONLY when the user explicitly
// unchecks "Create revert branch" in the wizard (added as a workaround for a
// Contentstack-confirmed bug where backup creation fails on am_v2 stacks).
export async function mergeBranches(
  callCmaApi: CmaCall,
  params: MergeParams
): Promise<{ jobUid: string | null; notice?: string }> {
  const query = new URLSearchParams({
    base_branch: params.base_branch,
    compare_branch: params.compare_branch,
    default_merge_strategy: params.default_merge_strategy,
  });
  if (params.merge_comment) query.set("merge_comment", params.merge_comment);
  if (params.no_revert) query.set("no_revert", "true");

  const body =
    params.default_merge_strategy === "ignore"
      ? { item_merge_strategies: params.item_merge_strategies ?? [] }
      : {};

  const res = await callCmaApi(`/v3/stacks/branches_merge?${query}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as {
    uid?: string;
    notice?: string;
    merge_details?: { uid?: string };
  };

  return { jobUid: data.uid ?? data.merge_details?.uid ?? null, notice: data.notice };
}

export async function listMergeJobs(callCmaApi: CmaCall): Promise<MergeJob[]> {
  const res = await callCmaApi("/v3/stacks/branches_queue");
  const data = (await res.json()) as { queue?: MergeJob[] };
  return data.queue ?? [];
}

export async function getMergeJob(callCmaApi: CmaCall, jobUid: string): Promise<MergeJob | null> {
  const res = await callCmaApi(`/v3/stacks/branches_queue/${jobUid}`);
  const data = (await res.json()) as { queue?: MergeJob[] } & Partial<MergeJob>;
  if (Array.isArray(data.queue)) return data.queue[0] ?? null;
  return data.uid ? (data as MergeJob) : null;
}

export interface SchemaSnapshot {
  branch: string;
  exported_at: string;
  content_types: unknown[];
  global_fields: unknown[];
}

/**
 * Exports a branch's full schema (content types + global fields) as a manual
 * restore reference — the safety net when merging without a revert branch.
 * Must be called with the token-authenticated caller so the `branch` header
 * is honored.
 */
export async function fetchSchemaSnapshot(
  callTokenApi: CmaCall,
  branch: string
): Promise<SchemaSnapshot> {
  const PAGE_LIMIT = 100;
  const MAX_PAGES = 30;

  const fetchAll = async (
    path: string,
    key: "content_types" | "global_fields",
    extraParams: Record<string, string> = {}
  ): Promise<unknown[]> => {
    const items: unknown[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({
        limit: String(PAGE_LIMIT),
        skip: String(page * PAGE_LIMIT),
        ...extraParams,
      });
      const res = await callTokenApi(`${path}?${params}`, { headers: { branch } });
      const data = (await res.json()) as Record<string, unknown[] | undefined>;
      const batch = data[key] ?? [];
      items.push(...batch);
      if (batch.length < PAGE_LIMIT) break;
    }
    return items;
  };

  return {
    branch,
    exported_at: new Date().toISOString(),
    content_types: await fetchAll("/v3/content_types", "content_types", {
      include_global_field_schema: "true",
    }),
    global_fields: await fetchAll("/v3/global_fields", "global_fields"),
  };
}

/** Pull Contentstack's error_message out of an error string that has the response body appended. */
function extractServerMessage(message: string): string | null {
  const jsonStart = message.indexOf("{");
  if (jsonStart === -1) return null;
  try {
    const parsed = JSON.parse(message.slice(jsonStart)) as { error_message?: string };
    return parsed.error_message ?? null;
  } catch {
    return null;
  }
}

/** Turn a raw CMA error into something an editor can act on — never hiding the raw detail. */
export function friendlyApiError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : fallback;
  const serverMessage = extractServerMessage(message);
  const detail = serverMessage
    ? ` (Contentstack said: "${serverMessage}")`
    : message
      ? ` (${message.length > 260 ? `${message.slice(0, 260)}…` : message})`
      : "";

  // Branch calls authenticate with the management token from the app
  // configuration — a 401/403 almost always means that token is the problem.
  if (/\b(401|403)\b/.test(message)) {
    return (
      "Contentstack rejected the credentials for this request. Check the Management Token in the " +
      "app configuration: it must belong to this stack, be unexpired, and have write access." +
      detail
    );
  }
  if (/\b422\b/.test(message)) {
    return `The stack was not found with these credentials — usually an API key or region mismatch.${detail}`;
  }
  if (/\b412\b/.test(message)) {
    return `Branches are not enabled on this stack (plan-gated feature).${detail}`;
  }
  if (/\b429\b/.test(message)) {
    return "Rate limited by the Management API — wait a moment and retry.";
  }
  return serverMessage ?? message ?? fallback;
}
