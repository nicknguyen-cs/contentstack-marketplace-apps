import { draftPublishedWidget } from "./draft-published/manifest";
import { approvalAgingWidget } from "./approval-aging/manifest";
import { mergeActivityWidget } from "./merge-activity/manifest";
import { WidgetModule } from "../types";

export const widgetRegistry: Record<string, WidgetModule> = {
  [draftPublishedWidget.manifest.id]: draftPublishedWidget as WidgetModule,
  [approvalAgingWidget.manifest.id]: approvalAgingWidget as WidgetModule,
  [mergeActivityWidget.manifest.id]: mergeActivityWidget as WidgetModule,
};

export const allWidgets = Object.values(widgetRegistry);
