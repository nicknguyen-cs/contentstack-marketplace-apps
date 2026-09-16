import { WidgetModule, CallCmaApi, DashboardFilters } from "../../types";
import DraftPublishedWidget from "./DraftPublishedWidget";

export interface DraftPublishedRow {
  contentType: string;
  draft: number;
  published: number;
  modified: number;
}

async function fetchDraftPublishedData(
  filters: DashboardFilters,
  callCmaApi: CallCmaApi
): Promise<DraftPublishedRow[]> {
  const ctRes = await callCmaApi("/v3/content_types");
  const ctData = await ctRes.json() as { content_types?: Array<{ uid: string; title: string }> };
  const contentTypes = ctData.content_types ?? [];

  const targetCTs = filters.contentType
    ? contentTypes.filter((ct) => ct.uid === filters.contentType)
    : contentTypes.slice(0, 5);

  const rows = await Promise.all(
    targetCTs.map(async (ct) => {
      const params = new URLSearchParams({
        include_publish_details: "true",
        limit: "100",
        ...(filters.locale ? { locale: filters.locale } : {}),
      });
      const res = await callCmaApi(`/v3/content_types/${ct.uid}/entries?${params}`);
      const data = await res.json() as {
        entries?: Array<{
          _version: number;
          publish_details?: Array<{ version: number }>;
        }>;
      };
      const entries = data.entries ?? [];
      return {
        contentType: ct.title,
        draft: entries.filter((e) => !e.publish_details?.length).length,
        published: entries.filter(
          (e) => e.publish_details?.length && e._version === e.publish_details[0].version
        ).length,
        modified: entries.filter(
          (e) => e.publish_details?.length && e._version !== e.publish_details[0].version
        ).length,
      };
    })
  );

  return rows;
}

export const draftPublishedWidget: WidgetModule<DraftPublishedRow[]> = {
  manifest: {
    id: "draft-published",
    title: "Draft vs Published",
    description: "Entry status breakdown by content type — draft, published, and modified counts.",
    category: "content",
    supportedFilters: ["contentType", "locale", "dateRange"],
    defaultCols: 2,
  },
  fetchData: fetchDraftPublishedData,
  Component: DraftPublishedWidget,
};
