# AI Content Generator — Contentstack Sidebar Widget

A sidebar widget for Contentstack that uses OpenAI to generate on-topic content for all supported fields in an entry. Open any entry, type a topic (or leave blank for a random one), and click **Generate with AI** to populate fields instantly.

## Features

- **One-click generation** for text, number, boolean, date, link, select, and Rich Text (JSON RTE) fields
- **Modular Blocks support** — generates content for existing block instances and lets you add new blocks via checkboxes
- **Nested structures** — handles groups inside blocks, groups inside groups, multiple-instance groups, and global fields
- **Rich Text** — produces formatted HTML (headings, lists, bold/italic) and converts it to Contentstack's JSON RTE format automatically
- **Progress feedback** — shows which field is being generated and applied in real time

## Setup

### 1. App Configuration

In the Contentstack app settings page, fill in:

| Field | Description |
|-------|-------------|
| **Stack API Key** | Your stack's API key |
| **Management Token** | A management token with read access to content types |
| **Region** | US, EU, or Azure NA (sets the CMA base URL) |
| **OpenAI API Key** | Your OpenAI API key (stored in server configuration) |
| **OpenAI Organization ID** | *(Optional)* Your OpenAI org ID |

### 2. Enable the Sidebar

Add the app as a **Sidebar Widget** on the content types you want to use it with. The widget will appear in the entry editor sidebar.

## How It Works

### Generation Flow

1. **Fetch schema** — The widget reads the current entry's content type schema from the CMA, including global field definitions.

2. **Discover fields (slots)** — Walks the schema against the current entry data to build a flat list of "slots" — one per field instance to generate. Each slot has:
   - A `path` to locate the value in the entry (e.g. `["page_components", 0, "hero", "title"]`)
   - A `key` used as the JSON key in the LLM prompt/response (e.g. `page_components.0.hero.title`)
   - The field's `data_type` so the LLM knows what to produce

3. **Call OpenAI** — Sends all slot keys and types to `gpt-4o-mini` with a system prompt that describes each output format. The model returns a single JSON object with one value per field.

4. **Coerce and convert** — Parses the response and coerces each value to the correct type (numbers, booleans, link objects, ISO dates). For JSON RTE fields, converts the HTML string into a JSON RTE document using `@contentstack/json-rte-serializer`.

5. **Apply to entry** — Sets each value via the App SDK's `entry.getField(uid).setData(value)`:
   - **Scalar fields** (top-level text, number, etc.) — set directly
   - **Group fields** — assembled into a nested object/array then set on the top-level group field
   - **Block fields** — assembled into the full blocks array (merged with existing blocks) then set on the blocks field

The entry is updated in the editor but **not saved automatically** — the user reviews and saves.

### Supported Field Types

| Content Type Field | What Gets Generated |
|--------------------|-------------------|
| Single-line text | On-topic string |
| Multi-line text | On-topic paragraph |
| Rich Text (JSON RTE) | Formatted HTML converted to JSON RTE document |
| Number | Contextual number |
| Boolean | `true` / `false` |
| Date (ISO) | ISO 8601 date string |
| Link | `{ title, url }` object |
| Select (enum) | One of the allowed values |
| Group (single) | Recurses into child fields |
| Group (multiple) | Generates for each existing instance; 2 instances for new blocks |
| Modular Blocks | Generates for existing instances + user-selected new block types |
| Global Fields | Resolves the referenced schema and recurses |

**Skipped:** Reference fields, file/asset fields, fields with custom extensions.

### New Block Generation

The sidebar shows checkboxes for each available block type in the content type. Check a block type to generate a new instance with AI-populated fields appended to the existing blocks array. The field count shown next to each block type includes fields in nested groups.

## File Overview

| File | Purpose |
|------|---------|
| `SidebarWidgetAiGen.tsx` | React component — UI, SDK init, orchestration |
| `generator.ts` | Schema traversal, slot building, OpenAI call, type coercion, entry apply |
| `services.ts` | CMA API calls (content type schema fetch) |
| `types.ts` | TypeScript interfaces |
| `htmlToJsonRte.ts` | HTML to JSON RTE document conversion |
| `SidebarWidgetAiGen.css` | Component styles |

## Development

```bash
npm run dev          # Start dev server on localhost:3000
npm run build        # Production build
npm run typecheck    # TypeScript check
```

Open an entry in Contentstack with the sidebar widget enabled, and the widget will load from your dev server.
