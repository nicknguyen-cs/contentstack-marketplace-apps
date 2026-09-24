# Entry Draft — entry sidebar widget

Save the editor's current state, including unsaved changes, to a JSON asset and load it back later. Nothing is written to the entry itself, so no entry version is created and nothing is published.

Use it to park work in progress on an entry you are not ready to save, or to hand a draft to a colleague.

## Where it runs

| | |
|---|---|
| UI location | Entry sidebar (`cs.cm.stack.sidebar`) |
| Routes | `/entry-sidebar` and `/sidebar-draft` (same component; only `/entry-sidebar` is in the manifest) |
| Provider | `EntrySidebarExtensionProvider` |

## Using it

- **Save as draft** reads the editor's draft data (`entry.getDraftData()`), strips system keys, and uploads it as an asset named `draft_{contentType}_{entryUid}_{locale}`. If that asset already exists its file is replaced.
- **Load draft** finds the asset by that title, downloads the JSON and writes each field back into the open editor with `field.setData()`. You then save the entry as normal.

The card shows when the draft was last saved, or "No draft saved yet".

## Configuration

Requires **Stack API Key** and **Management Token** from [App Configuration](../AppConfiguration/README.md). Region sets the API base URL. The widget shows an inline warning until both are set.

## How it works

Asset create and replace go directly to the Management API (`POST /v3/assets`, `PUT /v3/assets/{uid}`) with the management token. The asset file itself is downloaded from the CDN without custom headers, because asset URLs do not allow an `Authorization` header under CORS.

## Limitations

- Drafts are ordinary stack assets. Anyone who can read assets can read a draft.
- One draft per entry per locale.
- Loading applies values to the form only. Reference, file and custom-extension fields depend on the App SDK accepting the stored value.

## Files

| File | Purpose |
|------|---------|
| `EntrySidebar.tsx` | Component and save/load flow |
| `services.ts` | Asset find, create, replace and download |
| `types.ts` | Config and asset types |
