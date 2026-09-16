import React, { useCallback, useEffect, useState } from "react";
import styles from "./CustomDashboard.module.css";
import { DashboardFilters, FilterOption, WidgetModule } from "./types";
import { widgetRegistry, allWidgets } from "./widgets/registry";
import DashboardHeader from "./components/DashboardHeader";
import GlobalFilters from "./components/GlobalFilters";
import WidgetGrid from "./components/WidgetGrid";
import WidgetCard from "./components/WidgetCard";
import WidgetPicker from "./components/WidgetPicker";
import { useBranchCmaApi } from "../../common/hooks/useBranchCmaApi";

const STORAGE_KEY = "cs-dashboard-widgets";

const DEFAULT_FILTERS: DashboardFilters = {
  contentType: null,
  locale: null,
  workflowStatus: null,
  dateRange: { start: null, end: null },
};

const EMPTY_FILTER_OPTIONS = {
  contentTypes: [] as FilterOption[],
  locales: [] as FilterOption[],
  workflowStages: [] as FilterOption[],
};

function loadActiveIds(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as string[];
  } catch {
    // ignore
  }
  return allWidgets.map((w) => w.manifest.id);
}

const CustomDashboard: React.FC = () => {
  // Branch-aware: /v3/stacks/branch* goes direct with the configured management
  // token (the app proxy has no branch scopes); everything else uses the proxy.
  const { callBranchApi: callCmaApi, isApiReady } = useBranchCmaApi();

  const [activeWidgetIds, setActiveWidgetIds] = useState<string[]>(loadActiveIds);
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [widgetData, setWidgetData] = useState<Record<string, unknown>>({});
  const [widgetLoading, setWidgetLoading] = useState<Record<string, boolean>>({});
  const [widgetErrors, setWidgetErrors] = useState<Record<string, string>>({});
  const [filterOptions, setFilterOptions] = useState(EMPTY_FILTER_OPTIONS);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Persist widget selection
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activeWidgetIds));
  }, [activeWidgetIds]);

  // Populate filter dropdowns once SDK is ready
  useEffect(() => {
    if (!isApiReady) return;

    Promise.all([
      callCmaApi("/v3/content_types")
        .then((r) => r.json() as Promise<{ content_types?: Array<{ uid: string; title: string }> }>)
        .then((d) =>
          (d.content_types ?? []).map((ct) => ({ value: ct.uid, label: ct.title }))
        )
        .catch(() => [] as FilterOption[]),

      callCmaApi("/v3/locales")
        .then((r) => r.json() as Promise<{ locales?: Array<{ code: string; name: string }> }>)
        .then((d) =>
          (d.locales ?? []).map((l) => ({ value: l.code, label: l.name }))
        )
        .catch(() => [] as FilterOption[]),

      callCmaApi("/v3/workflows")
        .then((r) =>
          r.json() as Promise<{
            workflows?: Array<{
              workflow_stages?: Array<{ uid: string; name: string; require_approval?: boolean }>;
            }>;
          }>
        )
        .then((d) =>
          (d.workflows ?? [])
            .flatMap((wf) => wf.workflow_stages ?? [])
            .filter((s) => s.require_approval)
            .map((s) => ({ value: s.uid, label: s.name }))
        )
        .catch(() => [] as FilterOption[]),
    ]).then(([contentTypes, locales, workflowStages]) => {
      setFilterOptions({ contentTypes, locales, workflowStages });
    });
  }, [isApiReady, callCmaApi]);

  // Fetch widget data whenever active widgets, filters, or API readiness changes
  useEffect(() => {
    if (!isApiReady) return;

    activeWidgetIds.forEach((id) => {
      const widget = widgetRegistry[id] as WidgetModule | undefined;
      if (!widget) return;

      setWidgetLoading((prev) => ({ ...prev, [id]: true }));
      setWidgetErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      widget
        .fetchData(filters, callCmaApi)
        .then((data) => {
          setWidgetData((prev) => ({ ...prev, [id]: data }));
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : "Failed to load widget data";
          setWidgetErrors((prev) => ({ ...prev, [id]: message }));
        })
        .finally(() => {
          setWidgetLoading((prev) => ({ ...prev, [id]: false }));
        });
    });
  }, [activeWidgetIds, filters, isApiReady, callCmaApi]);

  const removeWidget = useCallback((id: string) => {
    setActiveWidgetIds((prev) => prev.filter((wid) => wid !== id));
  }, []);

  const toggleWidget = useCallback((id: string) => {
    setActiveWidgetIds((prev) => (prev.includes(id) ? prev.filter((wid) => wid !== id) : [...prev, id]));
  }, []);

  return (
    <div className={styles.shell}>
      <DashboardHeader onAddWidget={() => setPickerOpen(true)} />
      <GlobalFilters
        filters={filters}
        onChange={setFilters}
        contentTypeOptions={filterOptions.contentTypes}
        localeOptions={filterOptions.locales}
        workflowStageOptions={filterOptions.workflowStages}
      />

      {activeWidgetIds.length === 0 ? (
        <div className={styles.empty}>
          <h3>No widgets added</h3>
          <p>Click &quot;+ Add Widget&quot; to get started</p>
        </div>
      ) : (
        <WidgetGrid>
          {activeWidgetIds.map((id) => {
            const widget = widgetRegistry[id] as WidgetModule | undefined;
            if (!widget) return null;
            const WidgetComponent = widget.Component;
            return (
              <WidgetCard
                key={id}
                title={widget.manifest.title}
                cols={widget.manifest.defaultCols}
                onRemove={() => removeWidget(id)}
              >
                <WidgetComponent
                  data={widgetData[id]}
                  filters={filters}
                  loading={widgetLoading[id] ?? false}
                  error={widgetErrors[id]}
                />
              </WidgetCard>
            );
          })}
        </WidgetGrid>
      )}

      {pickerOpen && (
        <WidgetPicker
          allWidgets={allWidgets.map((w) => w.manifest)}
          activeIds={activeWidgetIds}
          onToggle={toggleWidget}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
};

export default CustomDashboard;
