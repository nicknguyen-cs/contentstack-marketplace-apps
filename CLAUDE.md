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

Routes in `App.tsx` map to Contentstack UI locations. Each route lazy-loads its component:

| Route | Component | UI Location |
|-------|-----------|-------------|
| `/custom-field` | CustomField | Custom field in content type |
| `/entry-sidebar` | EntrySidebar | Entry editor sidebar |
| `/app-configuration` | AppConfiguration | App settings page |
| `/asset-sidebar` | AssetSidebar | Asset editor sidebar |
| `/stack-dashboard` | StackDashboard | Stack dashboard widget |
| `/full-page` | FullPage | Full page within stack |
| `/global-full-page` | GlobalFullPage | Organization-level full page |
| `/field-modifier` | FieldModifier | Field modifier location |
| `/content-type-sidebar` | ContentTypeSidebar | Content type builder sidebar |

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
