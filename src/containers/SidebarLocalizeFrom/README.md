# Localize From Locale — entry sidebar widget

Contentstack's native "localize" copies the fallback chain into a locale. This widget lets an editor pick **any** already-localized locale as the source instead, then copies its content into the locale currently being edited.

Typical use: `fr-ca` should start from `fr-fr`, not from the `en-us` master it falls back to.

## Where it runs

| | |
|---|---|
| UI location | Entry sidebar (`cs.cm.stack.sidebar`) |
| Route | `/sidebar-localize-from` |
| Manifest name | Localize From Locale |
| Provider | `EntrySidebarExtensionProvider` |

## Using it

1. Open a saved entry and switch to the locale you want to localize (not the master).
2. The banner tells you whether that locale is already localized or currently inheriting fallback content.
3. Pick a source locale. Locales the entry is not localized in are listed but disabled.
4. Click **Copy & localize**. If the target already has its own content, a typed confirmation asks you to type the locale code before it is replaced.
5. Reload the entry to see the copied content. Unsaved edits in the open editor are not part of the copy.

## Configuration

None. Reads and writes go through `appSdk.stack` as the logged-in user, so the user's role must allow updating entries in the target locale.

## How it works

- Reads the entry as it exists in the source locale, strips system keys (`uid`, `_version`, `_workflow`, `publish_details`, `ACL`, and so on), and writes the remaining fields to the target locale with `Entry.language(target).update()`. That write is what localizes the target. A new entry version is created, so history is kept.
- Non-localizable fields keep their shared values; the API ignores them in the update.
- Localized status for the current locale is derived without a network call: the editor payload reports the locale of the content it serves, and for an unlocalized entry that is the fallback locale. Equality with the editing locale means localized.
- After a successful copy the widget asserts "localized" itself, because the editor's payload stays stale until the page reloads.

## Limitations

- Master locale: the widget shows a message and does nothing. There is nothing to localize the master from.
- Unsaved drafts (no entry UID yet) cannot be localized.
- Copies are whole-entry. There is no per-field selection.

## Files

| File | Purpose |
|------|---------|
| `SidebarLocalizeFrom.tsx` | Component, status banner, confirm flow |
| `api.ts` | Stack API wrapper, copy routine, system key list, error mapping |
| `types.ts` | Locale and status types |
