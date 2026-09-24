# SEO/AEO/GEO Demo Prompts — entry sidebar widget

A sales-demo widget that shows what answer-engine optimisation does for an entry. It never writes to the entry.

On **Run demo** it:

1. Runs a generation agent over the entry's content to produce a publish-ready "answer layer": answer-first copy, a meta title and description, key facts, a buyer FAQ, and schema.org JSON-LD (`Article` + `FAQPage`) assembled deterministically from those fields.
2. Takes the FAQ's buyer questions and asks an answer engine each one twice, once against a degraded snippet of the un-optimised page and once against the generated layer, under a strict "answer only from the source, otherwise say Not stated" rule.
3. Opens a modal with the before/after scoreboard and the generated artifact.

This is a real model with **simulated** post-publish retrieval. No search engine is queried.

## Where it runs

| | |
|---|---|
| UI location | Entry sidebar (`cs.cm.stack.sidebar`) |
| Route | `/sidebar-seo-prompts` |
| Manifest name | SEO/AEO/GEO Demo Prompts |
| Provider | `EntrySidebarExtensionProvider` |

## Configuration

**OpenAI API Key** (and optional org ID) from [App Configuration](../AppConfiguration/README.md). No Contentstack tokens are needed; the entry is read through the App SDK.

The OpenAI call is made from the browser with the configured key. That is fine for demos; for anything shared, put a proxy in front of it.

## Notes

- Uses `gpt-4o-mini` on purpose. A stronger model often answers the un-optimised prompt well already, which hides the gap the demo is meant to show.
- Up to four questions are tested per run.
- Thin entries may not yield buyer questions; the widget says so and stops.
- The header shows the cloud, region and host the app is loaded in, derived from the parent frame origin.

## Files

| File | Purpose |
|------|---------|
| `SidebarWidgetSeoPrompts.tsx` | Component, run orchestration, host detection |
| `agent.ts` | Generation agent and JSON-LD assembly |
| `promptBuilder.ts` | Degraded "before" snippet and answer-engine prompts |
| `runChat.ts` | OpenAI chat call |
| `ComparisonModal.tsx`, `Markdown.tsx` | Results UI |
