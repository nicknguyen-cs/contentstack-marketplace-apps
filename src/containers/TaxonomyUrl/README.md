# Taxonomy URL — custom field

Keeps an entry's URL field in step with the taxonomy terms the editor picks, so one content type can carry several URL schemes. Tag an article as **blog** and the URL becomes `/blog/my-slug`; tag it **patch notes** and it becomes `/patchnotes/halo-infinite/season-3/my-slug`.

```
/{term}/{title}                                   the default, one pattern
/patchnotes/{term:franchise}/{term:season}/{field:slug}   a rule pattern
```

## Why this exists

Contentstack's URL patterns are a single static template per content type. They can reference native root-level text fields and taxonomies, but not custom fields, and they can't switch pattern based on a term. This field goes the other way round: instead of the URL pattern reading a custom field, the custom field **writes the native URL field** through the App SDK. The URL updates live in the editor and is saved with the entry in the same version.

## Where it runs

| | |
|---|---|
| UI location | Custom field (`cs.cm.stack.custom_field`), data type text |
| Route | `/taxonomy-url` |
| Manifest name | Taxonomy URL |
| Provider | `CustomFieldExtensionProvider` |

## Using it

Add the field to a content type that has a **URL** field and a **taxonomy** field. Remove any URL pattern from the content type, so Contentstack doesn't regenerate the URL on save and fight the field. The custom field's own value is unused; it is just where the code mounts.

The field shows the pattern in use (and which rule chose it), each term the pattern needs, the URL field's current value and the composed URL.

- **Keep URL in sync** (on by default) rewrites the URL field whenever a term or a source field changes. While it is on, manual edits to the URL field are overwritten on the next change.
- Untick it to stop the automatic writes. An **Apply** button appears when the composed URL differs from the current one.
- The URL is only written when every token in the pattern has a value. Until then the field says what it is waiting for and leaves the URL alone.

## Configuration

No app configuration. Everything is per instance, through the custom field's **config** JSON in the content type builder.

### One pattern

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

These are the defaults; an empty config gives exactly this.

### Conditional patterns

Add `rules`. They are evaluated in order and the first one whose term is tagged on the entry wins. `pattern` becomes the fallback; leave it out to write nothing when no rule matches.

```json
{
  "rules": [
    {
      "when": { "taxonomy": "article_type", "term": "blog" },
      "pattern": "/{term:article_type}/{field:slug}"
    },
    {
      "when": { "taxonomy": "article_type", "term": ["patchnotes", "patch_notes"] },
      "pattern": "/patchnotes/{term:franchise}/{term:season}/{field:slug}",
      "label": "Patch notes"
    },
    {
      "when": { "taxonomy": "article_type", "term": "guides" },
      "pattern": "/guides/{term_path:guide_category}/{field:slug}"
    }
  ],
  "pattern": "/{term:article_type}/{field:slug}"
}
```

| Key | Meaning |
|-----|---------|
| `rules[].when.taxonomy` | Taxonomy UID to look in. |
| `rules[].when.term` | Term UID, or a list of them, that selects the rule. |
| `rules[].pattern` | The template to use when the rule matches. |
| `rules[].label` | Optional name shown in the field; defaults to `taxonomy: term`. |
| `pattern` | Fallback template when no rule matches. Defaults to `/{term}/{title}` when there are no rules, and to nothing when there are. |
| `taxonomyFieldUid` | The taxonomy field holding the entry's terms. |
| `taxonomyUid` | Which taxonomy the unqualified `{term}` reads from. Empty means the first term tagged. |
| `titleFieldUid` | Field the `{title}` token is built from. |
| `urlFieldUid` | The field to write to. |
| `autoSync` | Initial state of the **Keep URL in sync** toggle. |

### Tokens

| Token | Expands to |
|-------|------------|
| `{term}` / `{term:franchise}` | The term's name, from the primary taxonomy or the named one |
| `{term_path}` / `{term_path:x}` | Every ancestor of the term, then the term: `guides/getting-started` |
| `{term_uid}` / `{term_uid:x}` | The term's UID |
| `{taxonomy}` / `{taxonomy:x}` | The taxonomy's name |
| `{taxonomy_uid}` / `{taxonomy_uid:x}` | The taxonomy's UID |
| `{title}` | The entry title |
| `{field:slug}` | Any root-level text field, by UID |
| `{locale}` | The entry's locale code |

Anything outside braces is kept literally. Every value is slugified: lower-cased, diacritics stripped, anything that is not a letter or digit becomes a hyphen. The result is normalised to a single leading slash, no trailing slash and no empty segments. Invalid tokens are reported in the field rather than written into the URL.

## How it works

- Term and taxonomy names are read through the Management SDK over the App SDK adapter, so the logged-in user's session is used and no token or app scope is needed. The App SDK's own `appSdk.stack` has no taxonomy API, which is why this app differs from the sidebar widgets.
- Only the terms the chosen pattern mentions are fetched, and only the detail it needs: the taxonomy name for `{taxonomy}`, the ancestor chain for `{term_path}`.
- Names are requested in the entry's locale first (for stacks with localized taxonomies) and unlocalized second; if both fail the UID is slugified.
- `{term_path}` uses the term's `ancestors` call, orders the chain by walking `parent_uid`, then re-reads each ancestor in-locale for its name.
- Results are cached per term, locale and detail level for the life of the field, so typing in a text field never triggers a request.
- Writes go through `entry.getField(urlFieldUid).setData()`. A write-in-flight guard stops the change event that write triggers from writing again.

## Limitations

- One term per taxonomy. If an entry carries two terms from the same taxonomy, the first one stored wins.
- `{field:x}` reads root-level string fields only. Group and modular-block fields aren't reachable.
- The URL is rebuilt inside the editor only. Renaming a term does not update entries that are already saved; see the Automate scripts in [Dynamic URL](../DynamicUrl/README.md) for the bulk-update pattern.
- If the URL field is non-editable or missing from the content type, the write fails and the field shows the error.

## Compared with Dynamic URL

[Dynamic URL](../DynamicUrl/README.md) prefixes the URL with a referenced parent entry's URL and treats the term as optional. This field has no parent, treats every token as required, and supports conditional patterns. Use whichever matches the site's URL scheme.

## Files

| File | Purpose |
|------|---------|
| `TaxonomyUrl.tsx` | The field |
| `url.ts` | Pure helpers: config and rule parsing, slugs, tokens, pattern selection and composition |
| `api.ts` | Term and taxonomy lookups over the Management SDK |
| `types.ts` | Shared types |
