# Locale Status — entry sidebar widget

One card per stack locale, showing for the open entry:

- **Localized**: whether the entry has its own copy in that locale, or which locale it falls back to.
- **Saved**: when the localized copy was last saved, and its version number.
- **Published**: one line per environment with the publish time and version, plus a **stale** chip when the entry has been saved since that publish.
- **Workflow**: the workflow stage the localized copy sits in, with its colour and due date if set.

The master locale and the locale you are editing are chipped and sorted to the top. A checkbox hides locales the entry is not localized in, and the header summarises "X of Y locales localized".

## Where it runs

| | |
|---|---|
| UI location | Entry sidebar (`cs.cm.stack.sidebar`) |
| Route | `/sidebar-locale-status` |
| Manifest name | Locale Status |
| Provider | `EntrySidebarExtensionProvider` |

## Configuration

None. All reads go through `appSdk.stack`, which runs as the logged-in user. If the user's role cannot read the entry in a locale, that card shows an inline error and the rest still render.

## How it works

1. Fetch the stack's locales and environments once.
2. Fetch the entry once per locale with `include_publish_details=true` and `include_workflow=true`, at most four requests in flight so a stack with many locales stays under the Management API rate limit.
3. Build one row per locale. The CMA answers a request for an unlocalized locale with the fallback copy, and that copy's `locale` field names the fallback, so `response.locale === requested locale` is the localization test. No separate "entry languages" call is needed.
4. Re-run automatically when the editor fires `onSave`, `onPublish` or `onUnPublish`, and on the refresh button. Results from a superseded refresh are dropped.

## Design decisions

- **Unlocalized rows show a dash for Saved and Workflow.** The fetched copy belongs to the fallback locale, so its save time and workflow stage would be mislabelled. Publish info is still shown because publishes are recorded per target locale, which is accurate even for inherited content.
- **Stale detection** compares the published version to the current version of the same copy, so it is right for inherited publishes too. When the API omits the version, no stale flag is shown.
- Errors are per row and never blank the widget.

## Files

| File | Purpose |
|------|---------|
| `SidebarLocaleStatus.tsx` | Component, refresh orchestration, card rendering |
| `api.ts` | Typed wrapper over `appSdk.stack`, concurrency limiter, row builder, error mapping |
| `format.ts` | Relative and absolute time formatting |
| `types.ts` | Row and API response types |
| `SidebarLocaleStatus.module.css` | Styles |
