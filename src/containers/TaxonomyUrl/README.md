# Taxonomy URL — custom field

Keeps an entry's URL field in step with the taxonomy term the editor picks. Tag the entry with **Guides › Getting Started** and the URL becomes `/getting-started/my-entry-title`; re-tag it and the URL follows.

```
/{term}/{title}          the default
```

The pattern is configurable per field instance, so `/{taxonomy}/{term}/{title}` or `/{term_path}/{title}` work too.

## Where it runs

| | |
|---|---|
| UI location | Custom field (`cs.cm.stack.custom_field`), data type text |
| Route | `/taxonomy-url` |
| Manifest name | Taxonomy URL |
| Provider | `CustomFieldExtensionProvider` |

## Using it

Add the field to a content type that has a **URL** field, a **taxonomy** field and a title. The field shows the selected term, the title, the URL field's current value and the URL it composes from them.

- **Keep URL in sync** (on by default) rewrites the URL field whenever the term or the title changes. While it is on, manual edits to the URL field are overwritten on the next change.
- Untick it to stop the automatic writes. An **Apply** button appears when the composed URL differs from the current one.
- The URL is only written when every token in the pattern has a value. Until a term is picked the field says what it is waiting for and leaves the URL alone.

## Configuration

No app configuration. Everything is per instance, through the custom field's **config** JSON in the content type builder. These are the defaults:

```json
{
  "pattern": "/{term}/{title}",
  "taxonomyFieldUid": "taxonomies",
  "taxonomyUid": "",
  "titleFieldUid": "title",
  "urlFieldUid": "url",
  "autoSync": true
}
```

| Key | Meaning |
|-----|---------|
| `pattern` | The URL template. Anything outside braces is kept literally (`/blog/{term}/{title}`). |
| `taxonomyFieldUid` | The taxonomy field whose selected term drives the URL. |
| `taxonomyUid` | When the entry is tagged with terms from several taxonomies, use only this taxonomy's term. Empty means the first term found. |
| `titleFieldUid` | Field the `{title}` token is built from. |
| `urlFieldUid` | The field to write to. |
| `autoSync` | Initial state of the **Keep URL in sync** toggle. |

### Tokens

| Token | Expands to |
|-------|------------|
| `{term}` | The selected term's name |
| `{term_path}` | Every ancestor of the term, then the term: `guides/getting-started` |
| `{term_uid}` | The term's UID |
| `{taxonomy}` | The taxonomy's name |
| `{taxonomy_uid}` | The taxonomy's UID |
| `{title}` | The entry title |
| `{locale}` | The entry's locale code |

Every value is slugified: lower-cased, diacritics stripped, anything that is not a letter or digit becomes a hyphen. The result is normalised to a single leading slash, no trailing slash and no empty segments. Unknown tokens are reported in the field rather than written into the URL.

## How it works

- Term and taxonomy names are read through the Management SDK over the App SDK adapter, so the logged-in user's session is used and no token or app scope is needed. The App SDK's own `appSdk.stack` has no taxonomy API, which is why this app differs from the sidebar widgets.
- Names are requested in the entry's locale first (for stacks with localized taxonomies) and unlocalized second; if both fail the UID is slugified.
- `{term_path}` uses the term's `ancestors` call, orders the chain by walking `parent_uid`, then re-reads each ancestor in-locale for its name.
- Results are cached per term and locale for the life of the field, so typing in the title never triggers a request. Only the tokens the pattern uses are fetched.
- Writes go through `entry.getField(urlFieldUid).setData()`. A write-in-flight guard stops the change event that write triggers from writing again.

## Limitations

- Only one term drives the URL. With several terms tagged, set `taxonomyUid` to pick which taxonomy counts; within a taxonomy the first term wins.
- The URL is rebuilt inside the editor only. Renaming a term does not update entries that are already saved; see the Automate scripts in [Dynamic URL](../DynamicUrl/README.md) for the bulk-update pattern.
- If the URL field is set to be non-editable or is missing from the content type, the write fails and the field shows the error.

## Compared with Dynamic URL

[Dynamic URL](../DynamicUrl/README.md) prefixes the URL with a referenced parent entry's URL and treats the term as optional. This field has no parent, treats the term as required, and makes the pattern configurable. Use whichever matches the site's URL scheme.

## Files

| File | Purpose |
|------|---------|
| `TaxonomyUrl.tsx` | The field |
| `url.ts` | Pure helpers: config parsing, slugs, tokens, pattern composition |
| `api.ts` | Term and taxonomy lookups over the Management SDK |
| `types.ts` | Shared types |
