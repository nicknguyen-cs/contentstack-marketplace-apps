# Contentstack Marketplace Apps

A collection of apps for the [Contentstack](https://www.contentstack.com) CMS, built on the official [Marketplace App Boilerplate](https://www.contentstack.com/docs/developers/developer-hub/marketplace-app-boilerplate/) and the [App SDK](https://www.contentstack.com/docs/developers/developer-hub/app-sdk). Everything ships as **one Developer Hub app**: each UI location (sidebar widget, custom field, dashboard widget, full page) is a route in a single React + TypeScript + Vite codebase, so you install once and enable whichever locations you want.

Each app has its own README next to its code. This page is the map.

## The apps

### Entry sidebar widgets

| App | What it does | Docs |
|-----|--------------|------|
| **Locale Status** | One card per stack locale: is the entry localized there, when was it last saved, where and when was it published (and is that publish stale), and which workflow stage it is in. | [`src/containers/SidebarLocaleStatus`](src/containers/SidebarLocaleStatus/README.md) |
| **Localize From Locale** | Localize the locale you are editing by copying content from a source locale you choose, instead of the fallback chain. | [`src/containers/SidebarLocalizeFrom`](src/containers/SidebarLocalizeFrom/README.md) |
| **Entry Draft** | Save the editor's current, unsaved state to a JSON asset and load it back later. No entry version is created. | [`src/containers/SidebarWidget`](src/containers/SidebarWidget/README.md) |
| **AI Content Generator** | Fill every supported field in an entry with on-topic content from OpenAI, including modular blocks, groups, global fields and JSON RTE. | [`src/containers/SidebarWidgetAiGen`](src/containers/SidebarWidgetAiGen/README.md) |
| **SEO/AEO/GEO Demo** | Sales demo: generates an answer-engine-ready layer for the entry and scores an answer engine before vs. after. Read-only. | [`src/containers/SidebarWidgetSeoPrompts`](src/containers/SidebarWidgetSeoPrompts/README.md) |

### Custom fields

| App | What it does | Docs |
|-----|--------------|------|
| **Live Collaboration** | Google-Docs-style presence and field sync between editors on the same entry, over a small socket.io relay. | [`src/containers/CustomField`](src/containers/CustomField/README.md) |
| **Dynamic URL** | Builds the entry's URL from a referenced parent, an optional taxonomy term and the title, and keeps it in sync. | [`src/containers/DynamicUrl`](src/containers/DynamicUrl/README.md) |
| **Reference Picker** | A replacement reference field with a searchable modal table for picking entries across the allowed content types. | [`src/containers/CustomReferenceField`](src/containers/CustomReferenceField/README.md) |

### Stack dashboard widgets

| App | What it does | Docs |
|-----|--------------|------|
| **Find & Replace** | Stack-wide plain-text find and replace across content types and locales, with a preview before anything is written. | [`src/containers/FindReplace`](src/containers/FindReplace/README.md) |
| **Custom Dashboard** | A composable widget grid with global filters. Ships Draft vs Published, Approval Aging and Branch Merge Activity widgets. | [`src/containers/CustomDashboard`](src/containers/CustomDashboard/README.md) |

### Full page

| App | What it does | Docs |
|-----|--------------|------|
| **Branch Console** | Compare, merge, cherry-pick and revert branch schemas (content types and global fields) from inside Contentstack. | [`src/containers/BranchConsole`](src/containers/BranchConsole/README.md) |

### App configuration

| App | What it does | Docs |
|-----|--------------|------|
| **App Configuration** | The settings page the other apps read from: stack credentials, region, and OpenAI keys, with live validation and a connection test. | [`src/containers/AppConfiguration`](src/containers/AppConfiguration/README.md) |

The remaining folders under `src/containers` (`AssetSidebarWidget`, `ContentTypeSidebar`, `DashboardWidget`, `FieldModifier`, `FullPage`, `GlobalFullPage`, `404`, `Tooltip`) are unmodified boilerplate demo pages.

## Getting started

### Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

### Register the app in Contentstack

1. In **Developer Hub**, create a new app targeting a stack.
2. Under **Hosting**, pick custom hosting and set the URL to `http://localhost:3000` (or your deployed URL).
3. Under **UI Locations**, add the locations you want. The paths and names are listed in [`manifest.json`](manifest.json). For example, the Locale Status sidebar is `cs.cm.stack.sidebar` at `/sidebar-locale-status`.
4. Install the app on your stack.
5. Open the app's **Configuration** page in the stack and fill in what the apps you enabled need. See [App Configuration](src/containers/AppConfiguration/README.md) and each app's README.

You can also import `manifest.json` into Developer Hub directly with the Contentstack CLI (`csdx app:create` / `csdx app:update`).

### Which apps need configuration

| Needs | Apps |
|-------|------|
| Nothing beyond the logged-in user's role | Locale Status, Localize From Locale, Find & Replace, Reference Picker, Dynamic URL |
| Stack API key + management token | Entry Draft, Branch Console, Custom Dashboard (merge widget only), AI Content Generator |
| OpenAI API key | AI Content Generator, SEO/AEO/GEO Demo |
| A running socket.io relay (`server/`) | Live Collaboration |

## How the apps talk to Contentstack

Three access patterns are used on purpose, and each app's README says which one it uses.

- **`appSdk.stack`** (Locale Status, Localize From Locale, Find & Replace). The host window makes the Management API call as the logged-in user, so the user's own role applies and no token or app scope is needed. This is the default for anything new.
- **Management SDK over the App SDK adapter** (Dynamic URL, Reference Picker). Same session-based auth, using `@contentstack/management` for typed calls.
- **Direct `fetch` with the management token from App Configuration** (Entry Draft, Branch Console, AI Content Generator). Used for endpoints the App SDK proxy cannot reach, such as branch compare and merge, asset uploads, and schema reads that must honour a `branch` header.

The `appSdk.api` proxy is avoided for entry and branch work. It returns 403 unless the installation carries matching OAuth scopes, and there is no scope at all for branch merge. See `src/common/hooks/useBranchCmaApi.ts` and `src/containers/FindReplace/api.ts` for the notes behind that decision.

## Repository layout

```
src/
  containers/          one folder per app (each with its own README)
  common/
    providers/         MarketplaceAppProvider + per-location providers
    hooks/             useAppSdk, useEntry, useAppConfig, useBranchCmaApi, ...
  components/          shared UI (ConfirmDialog, ErrorBoundary, ConfigModal)
server/                socket.io relay for Live Collaboration (deployed separately)
scripts/               one-off CMA scripts (e.g. global field usage report)
data/                  the demo content type schema these apps were built against
e2e/                   Playwright tests for the boilerplate locations
patches/               patch-package patch for @contentstack/app-sdk
manifest.json          Developer Hub app manifest (all UI locations and paths)
```

## Scripts

```bash
npm run dev            # dev server on :3000
npm run build          # production build to dist/
npm run preview        # serve the build
npm run format         # prettier
npm run test:chrome    # Playwright e2e (needs .env, see .env.sample)
```

`npm run typecheck` and `npm run lint` currently fail on a clean checkout: the repo pins TypeScript 4.9, which cannot parse the `moduleResolution: bundler` tsconfig, and `@typescript-eslint/eslint-plugin` is not installed. `npm run build` (esbuild) is the working check. Running `npx -p typescript@5 tsc --noEmit` gives a real type check.

## Conventions

- Every app is lazy-loaded from `src/containers/App/App.tsx` and mounted at its own route. Add a route there and a matching entry in `manifest.json` when you add an app.
- Entry sidebar routes are wrapped in `EntrySidebarExtensionProvider`; custom fields in `CustomFieldExtensionProvider`.
- Styling is plain CSS modules per app. The Venus component library is available but most apps keep to their own small stylesheets so they fit a 300px sidebar.
- `@typescript-eslint/no-explicit-any` is an error. The App SDK's stack API is typed `any` upstream, so apps narrow it with a small local interface (see `api.ts` in any sidebar app).
- No secrets in code. Tokens come from App Configuration; the socket relay URL comes from `VITE_SOCKET_URL`.

## Known gaps

- `/sidebar-draft` mounts the same Entry Draft component as `/entry-sidebar` and is not in the manifest.
- The Playwright suite covers only the boilerplate locations, not the apps above.

## License

MIT. The scaffold is Contentstack's boilerplate (see [LICENSE](LICENSE)); the apps are built on top of it.
