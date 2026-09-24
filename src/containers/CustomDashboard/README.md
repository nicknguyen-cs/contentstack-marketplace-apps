# Custom Dashboard — stack dashboard widget

A composable dashboard: pick widgets from a registry, filter them globally by content type, locale and workflow stage, and the grid re-fetches as filters change. The selection is remembered per browser.

## Where it runs

| | |
|---|---|
| UI location | Stack dashboard (`cs.cm.stack.dashboard`), full width |
| Route | `/custom-dashboard` |

## Shipped widgets

| Widget | Shows | Needs |
|--------|-------|-------|
| **Draft vs Published** | Draft, published and modified-since-publish counts per content type | Nothing extra |
| **Approval Aging** | How long entries have sat in workflow stages that require approval | Nothing extra |
| **Branch Merge Activity** | Branch count and the latest merge jobs | Branches enabled + management token |

Without a content type filter, Draft vs Published looks at the first five content types and up to 100 entries each.

## Configuration

A **Management Token** in [App Configuration](../AppConfiguration/README.md) is needed only for the merge-activity widget, because the branch queue endpoint is not reachable through the App SDK proxy. The other two widgets work through the proxy.

## Adding a widget

Each widget is a folder under `widgets/` exporting a `WidgetModule`: `{ manifest, fetchData(filters, callCmaApi), Component }`. The manifest carries `id`, `title`, `description`, `category`, `supportedFilters` (which of content type, locale, date range it honours) and `defaultCols` (grid width). Register it in `widgets/registry.ts` and it appears in the **Add Widget** picker. Per-widget loading and error state is handled by the shell.

## How it works

- Filter dropdowns are populated from `/v3/content_types`, `/v3/locales` and `/v3/workflows`, each tolerating failure so one missing scope does not blank the bar.
- API calls go through `useBranchCmaApi().callBranchApi`: branch endpoints go direct with the management token, everything else through the proxy.
- Widget selection is stored in `localStorage` under `cs-dashboard-widgets`.

## Files

| File | Purpose |
|------|---------|
| `CustomDashboard.tsx` | Shell, filters, fetch orchestration |
| `components/` | DashboardHeader, GlobalFilters, WidgetGrid, WidgetCard, WidgetPicker |
| `widgets/registry.ts` | Widget registry |
| `widgets/*/` | One folder per widget |
