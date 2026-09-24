# Reference Picker — custom field

A replacement for the native reference field. It reads the field's allowed content types from the schema, opens a modal with a content type dropdown and a multi-select table of entries, and stores the selection in the same `[{ uid, _content_type_uid }]` shape as a normal reference field.

## Where it runs

| | |
|---|---|
| UI location | Custom field (`cs.cm.stack.custom_field`) |
| Route | `/custom-reference-field` |
| Manifest name | Reference Picker |

## Using it

Click **Select Reference** to open the picker, choose a content type, tick entries and confirm. Selected entries render as reference rows with a remove button. The frame resizes to fit the list.

## Configuration

None. Entries are queried through the Management SDK over the App SDK adapter, so the logged-in user's role applies. Allowed content types come from the field's `reference_to` setting.

## How it works

On load, saved references are grouped by content type and each group is rehydrated with one `uid: { $in: [...] }` query, so a field with references to five entries across two types makes two requests. Rows use the Venus `EntryReferenceDetails` component.

## Limitations

- The entry table shows the default first page of results per content type; there is no pagination or search box yet.
- Selection order is the order entries were ticked.

## Files

| File | Purpose |
|------|---------|
| `CustomReferenceField.tsx` | Field, rehydration, frame sizing |
| `components/SelectModal.tsx` | Content type select and entry table |
