# Taxonomy URL — custom field

Writes the entry's URL from the taxonomy terms the editor picks. Tag an article `blog` and the URL becomes `/blog/my-title`; tag it `patch_notes` plus a season and it becomes `/patch-notes/season-3/my-title`.

Contentstack's own URL patterns can't switch shape based on a term and can't read custom fields. This field goes the other way: it writes the native URL field directly, live in the editor, so one content type can carry several URL schemes.

## Setup

1. Add the field (`/taxonomy-url`, data type text) to a content type that has a URL field and a taxonomy field.
2. Remove any URL pattern from the content type, or it will overwrite the field's work on save.
3. Paste a config into the field's **Config Parameter** (content type builder → field → Advanced).

## Config

```json
{
  "rules": [
    {
      "when": { "taxonomy": "article_type", "term": "blog" },
      "pattern": "/{rule_term}/{title}"
    },
    {
      "when": { "taxonomy": "article_type", "term": "patch_notes" },
      "pattern": "/{rule_term}/{term:season}/{title}"
    }
  ]
}
```

Rules run top to bottom; the first whose `when` term is tagged on the entry wins. `taxonomy` and `term` are UIDs, not names. If no rule matches, the field lists the entry's tags with their UIDs so you can copy them.

With no config at all the field uses `/{term}/{title}`.

Optional keys: `pattern` (fallback when no rule matches), `taxonomyFieldUid` (default `taxonomies`), `titleFieldUid` (`title`), `urlFieldUid` (`url`), `autoSync` (`true`).

## Tokens

| Token | Gives |
|-------|-------|
| `{rule_term}` | The term the rule matched on |
| `{term:x}` | The tagged term under parent term `x`, or from taxonomy `x` |
| `{term_path:x}` | Same, as a path of all its levels below `x` |
| `{title}` | The entry title |
| `{field:slug}` | Any root-level text field |
| `{locale}` | The entry's locale code |

Values are slugified (`Season 3` → `season-3`). Text outside braces is kept as is.

## In the editor

- **Keep URL in sync** rewrites the URL on every change. Untick it to get an **Apply** button instead. The choice is saved with the entry.
- The URL is only written once every token has a value. Until then the field says what is still missing.

## Notes

- Term names are read as the logged-in user through the Management SDK; no token or app config needed.
- One tag per slot: if two tags fit the same token, the first stored wins.
- Renaming a term does not update already-saved entries.

## Files

`types.ts` shapes · `url.ts` pure logic · `api.ts` Contentstack calls · `resolve.ts` builds one URL · `TaxonomyUrl.tsx` the React UI. Each file opens with an overview comment.
