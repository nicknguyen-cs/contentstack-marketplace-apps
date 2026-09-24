import React, { Suspense } from "react";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { MarketplaceAppProvider } from "../../common/providers/MarketplaceAppProvider";
import { Route, Routes } from "react-router-dom";
import { EntrySidebarExtensionProvider } from "../../common/providers/EntrySidebarExtensionProvider";
import { AppConfigurationExtensionProvider } from "../../common/providers/AppConfigurationExtensionProvider";
import { CustomFieldExtensionProvider } from "../../common/providers/CustomFieldExtensionProvider";
import FieldModifierExtension from "../FieldModifier/FieldModifier";
import EntryDraftSidebar from "../SidebarWidget/EntrySidebar";

/**
 * All the routes are Lazy loaded.
 * This will ensure the bundle contains only the core code and respective route bundle
 * improving the page load time
 */
const CustomFieldExtension = React.lazy(() => import("../CustomField/CustomField"));
const EntrySidebarExtension = React.lazy(() => import("../SidebarWidget/EntrySidebar"));
const AppConfigurationExtension = React.lazy(() => import("../AppConfiguration/AppConfiguration"));
const AssetSidebarExtension = React.lazy(() => import("../AssetSidebarWidget/AssetSidebar"));
const StackDashboardExtension = React.lazy(() => import("../DashboardWidget/StackDashboard"));
const FullPageExtension = React.lazy(() => import("../FullPage/FullPage"));
const GlobalFullPageExtension = React.lazy(() => import("../GlobalFullPage/GlobalFullPage"));
const PageNotFound = React.lazy(() => import("../404/404"));
const DefaultPage = React.lazy(() => import("../index"));
const ContentTypeSidebarExtension = React.lazy(() => import("../ContentTypeSidebar/ContentTypeSidebar"));
const SidebarWidgetAiGenExtension = React.lazy(() => import("../SidebarWidgetAiGen/SidebarWidgetAiGen"));
const CustomDashboardExtension = React.lazy(() => import("../CustomDashboard/CustomDashboard"));
const DynamicUrlExtension = React.lazy(() => import("../DynamicUrl/DynamicUrl"));
const CustomReferenceFieldExtension = React.lazy(() => import("../CustomReferenceField/CustomReferenceField"));
const BranchConsoleExtension = React.lazy(() => import("../BranchConsole/BranchConsole"));
const SidebarLocalizeFromExtension = React.lazy(() => import("../SidebarLocalizeFrom/SidebarLocalizeFrom"));
const SidebarWidgetSeoPromptsExtension = React.lazy(() => import("../SidebarWidgetSeoPrompts/SidebarWidgetSeoPrompts"));
const FindReplaceExtension = React.lazy(() => import("../FindReplace/FindReplace"));
const SidebarLocaleStatusExtension = React.lazy(() => import("../SidebarLocaleStatus/SidebarLocaleStatus"));

function App() {
  return (
    <ErrorBoundary>
      <MarketplaceAppProvider>
        <Routes>
          <Route path="/" element={<DefaultPage />} />
          <Route
            path="/custom-field-collaboration"
            element={
              <Suspense>
                <CustomFieldExtensionProvider>
                  <CustomFieldExtension />
                </CustomFieldExtensionProvider>
              </Suspense>
            }
          />
          <Route
            path="/entry-sidebar"
            element={
              <Suspense>
                <EntrySidebarExtensionProvider>
                  <EntrySidebarExtension />
                </EntrySidebarExtensionProvider>
              </Suspense>
            }
          />
          <Route
            path="/app-configuration"
            element={
              <Suspense>
                <AppConfigurationExtensionProvider>
                  <AppConfigurationExtension />
                </AppConfigurationExtensionProvider>
              </Suspense>
            }
          />
          <Route
            path="/asset-sidebar"
            element={
              <Suspense>
                <AssetSidebarExtension />
              </Suspense>
            }
          />
          <Route
            path="/stack-dashboard"
            element={
              <Suspense>
                <StackDashboardExtension />
              </Suspense>
            }
          />
          <Route
            path="/full-page"
            element={
              <Suspense>
                <FullPageExtension />
              </Suspense>
            }
          />
          <Route
            path="/global-full-page"
            element={
              <Suspense>
                <GlobalFullPageExtension />
              </Suspense>
            }
          />
          <Route
            path="/field-modifier"
            element={
              <Suspense>
                <FieldModifierExtension />
              </Suspense>
            }
          />
          <Route
            path="/content-type-sidebar"
            element={
              <Suspense>
                <ContentTypeSidebarExtension />
              </Suspense>
            }
          />
           <Route
            path="/sidebar-draft"
            element={
              <Suspense>
                <EntrySidebarExtensionProvider>
                  <EntryDraftSidebar />
                </EntrySidebarExtensionProvider>
              </Suspense>
            }
          />
          <Route
            path="/sidebar-ai-generate"
            element={
              <Suspense>
                <EntrySidebarExtensionProvider>
                  <SidebarWidgetAiGenExtension />
                </EntrySidebarExtensionProvider>
              </Suspense>
            }
          />
          <Route
            path="/sidebar-seo-prompts"
            element={
              <Suspense>
                <EntrySidebarExtensionProvider>
                  <SidebarWidgetSeoPromptsExtension />
                </EntrySidebarExtensionProvider>
              </Suspense>
            }
          />
          <Route
            path="/custom-dashboard"
            element={
              <Suspense>
                <CustomDashboardExtension />
              </Suspense>
            }
          />
          <Route
            path="/find-replace"
            element={
              <Suspense>
                <FindReplaceExtension />
              </Suspense>
            }
          />
          <Route
            path="/dynamic-url"
            element={
              <Suspense>
                <CustomFieldExtensionProvider>
                  <DynamicUrlExtension />
                </CustomFieldExtensionProvider>
              </Suspense>
            }
          />
          <Route
            path="/custom-reference-field"
            element={
              <Suspense>
                <CustomReferenceFieldExtension />
              </Suspense>
            }
          />
          <Route
            path="/branch-console"
            element={
              <Suspense>
                <BranchConsoleExtension />
              </Suspense>
            }
          />
          <Route
            path="/sidebar-localize-from"
            element={
              <Suspense>
                <EntrySidebarExtensionProvider>
                  <SidebarLocalizeFromExtension />
                </EntrySidebarExtensionProvider>
              </Suspense>
            }
          />
          <Route
            path="/sidebar-locale-status"
            element={
              <Suspense>
                <EntrySidebarExtensionProvider>
                  <SidebarLocaleStatusExtension />
                </EntrySidebarExtensionProvider>
              </Suspense>
            }
          />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </MarketplaceAppProvider>
    </ErrorBoundary>
  );
}

export default App;
