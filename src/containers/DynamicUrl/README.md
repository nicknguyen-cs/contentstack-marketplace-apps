# Dynamic URL — custom field

Builds an entry's URL from three sources and keeps it in sync:

```
/{parent-url}/{taxonomy-term}/{title-slug}
```

Renaming the entry, re-tagging it, or re-parenting it just swaps one segment. The composition is idempotent, so the field can rebuild the URL on every change without drift.

## Where it runs

| | |
|---|---|
| UI location | Custom field (`cs.cm.stack.custom_field`), data type text |
| Route | `/dynamic-url` |
| Manifest name | Dynamic URL |
| Provider | `CustomFieldExtensionProvider` |

## Using it

The field shows a breakdown: current locale, the parent's URL and which locale it came from, the taxonomy term, the title slug, the URL field's current value, and the composed URL. **Auto-sync** is on by default and writes the composed URL into the entry's URL field whenever an input changes. Untick it to get an **Apply to URL field** button for manual control.

## Configuration

No app configuration. Field UIDs are overridable per instance through the custom field's **config** JSON in the content type builder:

```json
{
  "referenceFieldUid": "parent",
  "urlFieldUid": "url",
  "parentSlugFieldUid": "url",
  "taxonomyFieldUid": "taxonomies",
  "taxonomyUid": "",
  "titleFieldUid": "title"
}
```

The values above are the defaults. `taxonomyUid` selects which taxonomy's term to use when the entry is tagged with several; leave it empty to use the first term found. If the entry has no term at all, the taxonomy segment is omitted.

## How it works

- The parent entry is fetched in the entry's current locale through the Management SDK (over the App SDK adapter, so the user's session is used), falling back to the master locale.
- Taxonomy values are not localizable, so the term itself is fetched in-locale to get its localized name. If that fails the term UID is slugified instead.
- Writes use `entry.getField(urlFieldUid).setData()` and a last-written guard prevents re-entrant updates.

## Bulk updates when a parent changes

Changing a parent's URL does not touch its children from inside the editor. Two scripts in this folder are meant to run as **Contentstack Automate** steps (Node 18+, no dependencies):

1. `script_1.js` finds the children of a changed parent entry and returns `{ parent_url, parent_uid, references }`.
2. `script.js` rewrites each child's master-locale URL using the same composition as the field, so the field and the script never disagree.

Both take `api_key` and `management_token` as inputs.

## Files

| File | Purpose |
|------|---------|
| `DynamicUrl.tsx` | The field (component name `ParentUrlField`) |
| `script_1.js`, `script.js` | Automate steps for cascading parent URL changes |
