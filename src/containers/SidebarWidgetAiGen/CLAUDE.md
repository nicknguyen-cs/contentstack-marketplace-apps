# SidebarWidgetAiGen Plugin

AI-powered content generator sidebar widget for Contentstack entries. Generates on-topic content for all supported fields using OpenAI, then applies it to the entry form via the App SDK.

## Architecture & Data Flow

1. **SDK Init** (`SidebarWidgetAiGen.tsx`) - Initializes `@contentstack/app-sdk`, reads app config (API keys, base URL), determines the current content type UID.
2. **Schema Fetch** (`services.ts` → `fetchContentTypeSchema()`) - Fetches the content type schema from CMA (`GET /v3/content_types/{uid}?include_global_field=true`).
3. **Slot Discovery** (`generator.ts`) - Traverses schema + entry data to build `GeneratableSlot[]` — one slot per generatable field instance.
4. **LLM Generation** (`generator.ts` → `generateEntryContent()`) - Sends slot descriptions to OpenAI, receives nested JSON; reads values by slot key path via `getValueByPath()`, coerces per slot via `coerceSlotsFromParsed()`, returns flat `Record<slot.key, value>`.
5. **Apply to Entry** (`SidebarWidgetAiGen.tsx`) - For each slot, `fieldPath = slot.path.join(".")`, `entry.getField(fieldPath).setData(flatGenerated[slot.key])`. No nested payload assembly; apply is per-slot via the App SDK. User must save to persist.

## File Overview

| File | Purpose |
|------|---------|
| `SidebarWidgetAiGen.tsx` | React component: UI, SDK init, orchestrates generation flow and per-slot apply via getField/setData |
| `generator.ts` | Schema traversal, slot building, OpenAI call, path-based read + type coercion |
| `services.ts` | CMA API calls (schema fetch) |
| `types.ts` | TypeScript interfaces for config, slots, schema fields, block types |
| `htmlToJsonRte.ts` | HTML string to JSON RTE document conversion (wraps `@contentstack/json-rte-serializer`) |
| `SidebarWidgetAiGen.css` | Component styles |

## Field Discovery (Slots)

A **slot** (`GeneratableSlot`) represents one field instance to generate content for. It has:
- `path` — array of segments to reach the value in the entry object (e.g. `["body"]` or `["blocks", 0, "hero", "title"]`)
- `key` — dot-joined stable key used as the JSON key in the LLM prompt/response
- `data_type` — the type the LLM should produce (`text`, `number`, `boolean`, `isodate`, `link`, `json_rte`)

### Schema Traversal

`buildGeneratableSlots()` walks the content type schema against current entry data:
- **Top-level scalars** — directly added if `isScalarGeneratable()` returns true
- **Groups** — recurses into group data (supports arrays of group items)
- **Modular Blocks** — iterates existing block instances, adds slots for each generatable field
- **Global Fields** — resolves `reference_to` to get the global field schema, then recurses

`buildSlotsForBlockType()` creates slots for a **new** block instance (user-selected block type, not yet in entry data).

### `isScalarGeneratable(field)`

Returns true for fields the AI can generate:
- `text`, `number`, `boolean`, `isodate`, `link` (from `GENERATABLE_DATA_TYPES`)
- `text` with `enum.choices` (select fields)
- `json` with `field_metadata.allow_json_rte === true` (JSON RTE fields)

Excludes: `reference`, `file`, fields with `extension_uid`, plain `json` (non-RTE).

## Supported Field Types

| `data_type` | LLM Output | Coercion |
|-------------|-----------|----------|
| `text` | String | Passthrough |
| `number` | Number | `Number(value)` |
| `boolean` | Boolean | Truthy check |
| `isodate` | ISO 8601 string | `String(value)` |
| `link` | `{ title, url }` object | Fallback to `{ title: String(value), url: "#" }` |
| `json_rte` | HTML string | `convertHtmlToJsonRte()` → JSON RTE document |
| `text` + enum | One of allowed values | Passthrough |

## JSON RTE Conversion Pipeline

JSON RTE fields (`data_type: "json"` + `field_metadata.allow_json_rte: true`) follow this flow:

1. **Slot creation** — `slotFromScalarField()` sets `data_type` to `"json_rte"` (internal marker)
2. **LLM prompt** — System prompt tells the model to return an HTML string with `<h2>`, `<h3>`, `<p>`, `<strong>`, `<em>`, `<ul>`/`<ol>` elements
3. **Coercion** — `coerceSlotsFromParsed()` reads value by slot key from nested LLM JSON, then calls `convertHtmlToJsonRte(String(value))`
4. **Conversion** — `htmlToJsonRte.ts` uses `DOMParser` to parse HTML, then `htmlToJson()` from `@contentstack/json-rte-serializer` to produce the JSON RTE document
5. **Apply** — `field.setData()` accepts the JSON RTE document object natively

## Modular Blocks

Two modes for modular blocks:

1. **Existing instances** — `buildGeneratableSlots()` finds block instances already in entry data and creates slots for their generatable fields
2. **New user-selected types** — `extractBlockTypesFromSchema()` lists available block types with generatable fields; `buildSlotsForBlockType()` creates slots at the next available index; the UI shows checkboxes for each type

## Key Functions

- `isJsonRteField(field)` — checks `data_type === "json"` && `field_metadata.allow_json_rte === true`
- `isScalarGeneratable(field)` — gate for whether a field can be AI-generated
- `slotFromScalarField(field, path, key)` — creates a `GeneratableSlot` from a schema field
- `buildGeneratableSlots(schema, entryData, globalFieldSchemas)` — main slot builder for existing entry data
- `buildSlotsForBlockType(schema, fieldUid, typeUid, index)` — slot builder for new block instances
- `generateEntryContent(topic, slots, title, apiKey, orgId)` — calls OpenAI, reads nested response by slot key via `getValueByPath()`, returns coerced flat values via `coerceSlotsFromParsed()`
- `getValueByPath(obj, dotKey)` — read value from nested object by dot path (e.g. `my_group.my_link` or `blocks.0.hero.title`)
- `coerceSlotsFromParsed(parsed, slots)` — iterate slots, read value by path from parsed LLM JSON, coerce type (number, boolean, link, JSON RTE, etc.)
- `convertHtmlToJsonRte(html)` — HTML string to JSON RTE document

## Testing Changes

1. `npm run typecheck` — verify no type errors
2. `npm run lint` — verify no lint errors
3. `npm run dev` — start dev server on localhost:3000
4. Open an entry with the target field types in Contentstack, run AI generation, verify:
   - Fields appear in the generated slot count
   - Generated content populates correctly in the editor
   - For JSON RTE: headings, paragraphs, bold/italic, lists render correctly
   - Saving the entry persists the generated content
