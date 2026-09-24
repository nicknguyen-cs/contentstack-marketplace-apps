# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Contentstack Marketplace App Boilerplate - a React/TypeScript application for building marketplace apps that integrate with the Contentstack CMS. Apps can appear in various UI locations within Contentstack (sidebars, custom fields, dashboards, full pages, etc.).

## Commands

```bash
# Development
npm run dev              # Start dev server on http://localhost:3000

# Build
npm run build            # Production build to dist/
npm run build:check      # TypeScript check + build

# Code Quality
npm run lint             # ESLint
npm run typecheck        # TypeScript type checking (no emit)
npm run format           # Prettier formatting

# E2E Tests (requires app running on localhost:3000)
npm run test:chrome      # Playwright tests in Chrome
npm run test:firefox     # Playwright tests in Firefox
npm run test:chrome-headed  # Chrome tests with browser visible
```

## Architecture

### Core Provider Pattern

The app uses a provider hierarchy that initializes the Contentstack App SDK and makes it available throughout the component tree:

1. **MarketplaceAppProvider** (`src/common/providers/MarketplaceAppProvider.tsx`)
   - Root provider that initializes `@contentstack/app-sdk`
   - Exposes SDK instance and app config via React Context
   - Handles token validation and SDK initialization failures

2. **Location-specific Providers** - Wrap components for specific UI locations:
   - `EntrySidebarExtensionProvider`
   - `AppConfigurationExtensionProvider`
   - `CustomFieldExtensionProvider`

### Hooks for SDK Access

Access SDK functionality through hooks in `src/common/hooks/`:
- `useAppSdk()` - Get the raw SDK instance
- `useApi()` - Structured API access (`callCmaApi`, `callDirectApi`)
- `useManagementClient()` - Contentstack Management SDK client
- `useAppConfig()` - App configuration
- `useEntry()`, `useCustomField()` - Entry/field data
- `useAppLocation()`, `useFrame()`, `useHostUrl()`

### Route-based UI Locations

Routes in `App.tsx` map to Contentstack UI locations. Each route lazy-loads its component. Every custom app has a README in its folder; the root README.md is the catalog.

| Route | Component | UI Location |
|-------|-----------|-------------|
| `/sidebar-locale-status` | SidebarLocaleStatus | Entry sidebar: per-locale localization, publish, workflow status |
| `/sidebar-localize-from` | SidebarLocalizeFrom | Entry sidebar: localize from a chosen source locale |
| `/entry-sidebar`, `/sidebar-draft` | SidebarWidget (EntrySidebar) | Entry sidebar: save/load draft to an asset |
| `/sidebar-ai-generate` | SidebarWidgetAiGen | Entry sidebar: OpenAI content generation |
| `/sidebar-seo-prompts` | SidebarWidgetSeoPrompts | Entry sidebar: SEO/AEO/GEO demo |
| `/custom-field-collaboration` | CustomField | Custom field: live collaboration (needs `server/`) |
| `/dynamic-url` | DynamicUrl | Custom field: URL composed from parent, taxonomy, title |
| `/custom-reference-field` | CustomReferenceField | Custom field: reference picker |
| `/find-replace` | FindReplace | Stack dashboard: find & replace |
| `/custom-dashboard` | CustomDashboard | Stack dashboard: widget grid |
| `/branch-console` | BranchConsole | Full page: branch compare/merge/revert |
| `/app-configuration` | AppConfiguration | App settings page |
| `/asset-sidebar`, `/stack-dashboard`, `/full-page`, `/global-full-page`, `/field-modifier`, `/content-type-sidebar` | boilerplate demos | unmodified template pages |

### Contentstack access patterns

Prefer `appSdk.stack` (runs as the logged-in user, no scopes) for new entry/content-type work. The `appSdk.api` proxy returns 403 in this app unless installation scopes match, and has no branch scopes at all. Branch endpoints and asset uploads go direct with the management token from App Configuration via `useBranchCmaApi`.

### Path Alias

`@/` is aliased to `src/` directory (configured in vite.config.ts).

## Key Dependencies

- `@contentstack/app-sdk` - SDK for building Contentstack apps
- `@contentstack/management` - Management API client
- `@contentstack/venus-components` - Contentstack UI component library

## Testing

- **E2E tests**: `e2e/tests/` using Playwright with page objects in `e2e/pages/`
- **Unit tests**: `src/**/*.test.tsx` files
- Tests require `.env` file (see `.env.sample`)

## Linting Rules

- `@typescript-eslint/no-explicit-any: "error"` - No `any` types allowed
