# Find & Replace — stack dashboard widget

Stack-wide plain-text find and replace across entries. You choose content types and locales, preview every match with context, tick the entries you want changed, and confirm. Updates create new draft versions; nothing is ever published.

## Where it runs

| | |
|---|---|
| UI location | Stack dashboard (`cs.cm.stack.dashboard`), full width |
| Route | `/find-replace` |
| Manifest name | Find & Replace |

## Using it

1. Pick content types (all selected by default) and locales (master only by default; opt into more explicitly).
2. Enter the search term and replacement. Toggle **case sensitive** and **whole word** as needed.
3. **Preview matches** pages through the selected entries and lists matches with a snippet either side of each hit.
4. Tick the entries to change and click **Replace…**. A confirmation dialog states how many replacements across how many entries, then each row reports success or failure. Failed rows can be retried.

Editing the form after a scan invalidates the preview; scan again before replacing.

## Configuration

None. Everything goes through `appSdk.stack` as the logged-in user, on the branch the app is loaded in. The user's role must allow reading and updating the entries in question.

## What gets replaced

Only `text` fields without an enum: single-line, multi-line and markdown. The scan recurses into groups, global fields and modular blocks. Everything else is skipped on purpose so a replace can never corrupt a structured value: JSON RTE, links, files, references, selects, numbers, dates, and the top-level `url` slug.

The term is always escaped. There is no user-supplied regex.

## Safeguards

- **Fallback-locale trap.** Querying a non-master locale also returns fallback copies of entries that are not localized there. Writing one of those would localize the entry as a side effect, so those rows are skipped; the master pass covers their text.
- Scans are sequential (100 entries per page, no fan-out) and updates pause 150 ms between entries to stay under Management API rate limits. Scans can be cancelled.
- A soft cap of 5000 scanned entries surfaces "narrow the selection" instead of truncating silently.
- Only changed top-level fields are sent in each update; the CMA merges them.
- If the locale list cannot be loaded, the widget falls back to the master locale from stack data rather than failing.

## Files

| File | Purpose |
|------|---------|
| `FindReplace.tsx` | Widget shell and state |
| `hooks/useEntryScan.ts` | Paginated scan with cancel and stale-run guard |
| `scan.ts` | Field selection from schema, matching, snippet extraction |
| `api.ts` | `appSdk.stack` wrapper, error mapping |
| `components/` | SearchForm, MatchList, ReplaceResults |
