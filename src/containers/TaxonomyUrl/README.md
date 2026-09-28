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

Add the field to a content type that has a **URL** field and a **taxonomy** field. Remove any URL pattern from the content type, so Contentstack doesn't regenerate the URL on save and fight the field. The custom field's own value stores only the per-entry sync choice (`auto` or `manual`).

The field shows the pattern in use (and which rule chose it), each term the pattern needs, the URL field's current value and the composed URL.

When no rule matches, the field lists every term the entry is tagged with as `taxonomy_uid › term_uid`. Copy those UIDs into the rule's `when`; they are UIDs, not display names, and must match exactly.

- **Keep URL in sync** (on by default) rewrites the URL field whenever a term or a source field changes. While it is on, manual edits to the URL field are overwritten on the next change.
- Untick it to stop the automatic writes. An **Apply** button appears when the composed URL differs from the current one. The choice is written to the custom field's value, so it is saved with the entry and survives a reload.
- The URL is only written when every token in the pattern has a value. Until then the field shows a **URL not generated yet** warning listing each missing tag or field in plain words, and leaves the URL alone.

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

This example is for one taxonomy, `article_type`, whose top-level terms are `blog`, `patch_notes` and `season` (with the individual seasons as children of `season`):

```json
{
  "rules": [
    {
      "when": { "taxonomy": "article_type", "term": "blog" },
      "pattern": "/{rule_term}/{title}"
    },
    {
      "when": { "taxonomy": "article_type", "term": "patch_notes" },
      "pattern": "/{rule_term}/{term:season}/{title}",
      "label": "Patch notes"
    }
  ]
}
```

A blog entry tagged `blog` gets `/blog/my-title`. A patch notes entry tagged `patch_notes` and `season_3` gets `/patch-notes/season-3/my-title`. Until it is tagged with a season, the field shows a warning listing what is still needed and leaves the URL alone.

`when.taxonomy` and `when.term` are UIDs, not display names. When no rule matches, the field lists the entry's tagged terms as `taxonomy_uid › term_uid` so you can copy them.

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
| `autoSync` | Default for the **Keep URL in sync** toggle on entries that haven't chosen yet. |

### Tokens

| Token | Expands to |
|-------|------------|
| `{term}` / `{term:x}` | The term's name |
| `{term_path}` / `{term_path:x}` | The term's ancestors then the term: `basics/getting-started` |
| `{term_uid}` / `{term_uid:x}` | The term's UID |
| `{taxonomy}` / `{taxonomy:x}` | The taxonomy's name |
| `{taxonomy_uid}` / `{taxonomy_uid:x}` | The taxonomy's UID |
| `{rule_term}` | The term that matched the rule, whichever position it was tagged in |
| `{rule_term_path}` | The matched term's ancestors, then the term |
| `{title}` | The entry title |
| `{field:slug}` | Any root-level text field, by UID |
| `{locale}` | The entry's locale code |

**Qualifiers.** `{rule_term}` needs none: it is always the term the rule matched on, which is the safe choice for the first segment. A term token without a qualifier reads the primary term (the `taxonomyUid` config, else the first term tagged). With a qualifier `x`, the field looks for a tagged term in two ways:

1. If `x` is a **taxonomy UID**, the entry's first term from that taxonomy. Use this when each concept is its own taxonomy.
2. Otherwise `x` is treated as a **parent term UID**, and the token reads the tagged term that sits anywhere under it. Use this when one taxonomy holds groups like `article_type`, `franchise` and `season` as top-level terms. `{term_path:x}` then gives only the segments below `x`.

Anything outside braces is kept literally. Every value is slugified: lower-cased, diacritics stripped, anything that is not a letter or digit becomes a hyphen. The result is normalised to a single leading slash, no trailing slash and no empty segments. Invalid tokens are reported in the field rather than written into the URL.

## How it works

- Term and taxonomy names are read through the Management SDK over the App SDK adapter, so the logged-in user's session is used and no token or app scope is needed. The App SDK's own `appSdk.stack` has no taxonomy API, which is why this app differs from the sidebar widgets.
- Only the terms the chosen pattern mentions are fetched, and only the detail it needs: the taxonomy name for `{taxonomy}`, the ancestor chain for `{term_path}`.
- A parent-term qualifier needs every tagged term's ancestor chain to find the match. Those are fetched once per term and cached with everything else.
- Names are requested in the entry's locale first (for stacks with localized taxonomies) and unlocalized second; if both fail the UID is slugified.
- `{term_path}` uses the term's `ancestors` call, orders the chain by walking `parent_uid`, then re-reads each ancestor in-locale for its name.
- Results are cached per term, locale and detail level for the life of the field, so typing in a text field never triggers a request.
- Writes go through `entry.getField(urlFieldUid).setData()`. A write-in-flight guard stops the change event that write triggers from writing again.

## Limitations

- One term per slot. If two tagged terms both fit a qualifier (two terms from the same taxonomy, or two under the same parent), the first one stored wins.
- `{field:x}` reads root-level string fields only. Group and modular-block fields aren't reachable.
- The URL is rebuilt inside the editor only. Renaming a term does not update entries that are already saved; see the Automate scripts in [Dynamic URL](../DynamicUrl/README.md) for the bulk-update pattern.
- If the URL field is non-editable or missing from the content type, the write fails and the field shows the error.

## Compared with Dynamic URL

[Dynamic URL](../DynamicUrl/README.md) prefixes the URL with a referenced parent entry's URL and treats the term as optional. This field has no parent, treats every token as required, and supports conditional patterns. Use whichever matches the site's URL scheme.

## Files

Read them in this order; each file starts with an overview comment.

| File | Purpose |
|------|---------|
| `types.ts` | The data shapes: config, rules, tags, resolved terms, UI state |
| `url.ts` | Pure helpers with no Contentstack or React: config parsing, tokens, rule selection, slugs, composing the path |
| `api.ts` | The Management SDK calls that fetch term, taxonomy and ancestor names |
| `resolve.ts` | `buildUrl`: takes an entry and the config, returns the composed URL and everything the UI shows. Plus the term cache |
| `TaxonomyUrl.tsx` | The React component: hooks for the SDK client, the sync toggle and iframe height; the recompute loop; the write path; the UI |
| `TaxonomyUrl.module.css` | Styles |
