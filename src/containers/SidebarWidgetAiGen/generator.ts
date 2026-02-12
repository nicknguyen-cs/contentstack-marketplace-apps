import { ENTRY_SYSTEM_KEYS } from "../../common/utils/applyEntryData";
import { convertHtmlToJsonRte } from "./htmlToJsonRte";
import type {
  ContentTypeSchemaField,
  FieldSummary,
  GeneratableSlot,
  GlobalFieldSchemasMap,
  SelectableBlockType,
} from "./types";

function getGlobalFieldSchema(
  uid: string,
  map: GlobalFieldSchemasMap | undefined
): ContentTypeSchemaField[] | undefined {
  if (!map) return undefined;
  // Handle record format: { uid: schema[] } or { uid: { schema: schema[] } }
  const v = (map as Record<string, unknown>)[uid];
  if (v) {
    return Array.isArray(v) ? v : (v as { schema?: ContentTypeSchemaField[] }).schema;
  }
  return undefined;
}

/**
 * Normalize global_fields from API response into a record keyed by UID.
 * Handles both array format [{uid, schema}] and record format {uid: {schema}}.
 */
export function normalizeGlobalFieldSchemas(
  raw: unknown
): Record<string, { schema?: ContentTypeSchemaField[] }> | undefined {
  if (!raw) return undefined;
  // Already a record keyed by UID
  if (!Array.isArray(raw) && typeof raw === "object") {
    return raw as Record<string, { schema?: ContentTypeSchemaField[] }>;
  }
  // Array format: [{uid: "...", schema: [...]}, ...]
  if (Array.isArray(raw)) {
    const map: Record<string, { schema?: ContentTypeSchemaField[] }> = {};
    for (const item of raw) {
      if (item && typeof item === "object" && "uid" in item) {
        const entry = item as { uid: string; schema?: ContentTypeSchemaField[] };
        map[entry.uid] = { schema: entry.schema };
      }
    }
    return Object.keys(map).length > 0 ? map : undefined;
  }
  return undefined;
}

/** Get the block type key from a block wrapper, ignoring `_metadata`. */
function getBlockTypeKey(wrapper: Record<string, unknown>): string | undefined {
  return Object.keys(wrapper).find((k) => k !== "_metadata");
}

/** Data types we can generate values for (scalar). Reference, file, extension are skipped. */
const GENERATABLE_DATA_TYPES = new Set([
  "text",
  "number",
  "boolean",
  "isodate",
  "link",
]);

/** Check if a field is a JSON RTE (Rich Text Editor) field. */
function isJsonRteField(field: ContentTypeSchemaField): boolean {
  return (
    field.data_type === "json" &&
    !!field.field_metadata?.allow_json_rte
  );
}

/** Check if a field is the URL/slug field (derived from title, not LLM-generated). */
function isUrlField(field: ContentTypeSchemaField): boolean {
  return field.uid === "url" && (field.data_type ?? "text") === "text";
}


export function isScalarGeneratable(field: ContentTypeSchemaField): boolean {
  const dataType = field.data_type ?? "text";
  if (dataType === "reference" || dataType === "file" || field.extension_uid) {
    return false;
  }
  if (isUrlField(field)) return false;
  if (isJsonRteField(field)) return true;
  return (
    GENERATABLE_DATA_TYPES.has(dataType) ||
    (dataType === "text" && field.enum?.choices != null)
  );
}

export function slotFromScalarField(
  field: ContentTypeSchemaField,
  path: (string | number)[],
  key: string
): GeneratableSlot {
  const dataType = isJsonRteField(field) ? "json_rte" : (field.data_type ?? "text");
  const slot: GeneratableSlot = {
    path,
    key,
    display_name: field.display_name ?? field.uid,
    data_type: dataType,
  };
  if (field.enum?.choices?.length) {
    slot.choices = field.enum.choices;
  }
  return slot;
}

/**
 * Recursively add slots for generatable scalar fields in a schema slice, for existing entry data only.
 * Used for group items and global field objects.
 */
function appendSlotsForSchema(
  schema: ContentTypeSchemaField[],
  currentData: Record<string, unknown> | unknown[],
  pathPrefix: (string | number)[],
  keyPrefix: string,
  out: GeneratableSlot[],
  globalFieldSchemas?: GlobalFieldSchemasMap
): void {
  for (const field of schema) {
    const dataType = field.data_type ?? "text";
    if (dataType === "reference" || dataType === "file" || field.extension_uid) {
      continue;
    }
    const value = Array.isArray(currentData)
      ? undefined
      : (currentData as Record<string, unknown>)[field.uid];
    if (dataType === "group" && field.schema) {
      if (value == null || typeof value !== "object") continue;
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          if (item != null && typeof item === "object") {
            appendSlotsForSchema(
              field.schema,
              item as Record<string, unknown>,
              [...pathPrefix, field.uid, i],
              keyPrefix + field.uid + "." + i + ".",
              out,
              globalFieldSchemas
            );
          }
        }
      } else {
        appendSlotsForSchema(
          field.schema,
          value as Record<string, unknown>,
          [...pathPrefix, field.uid],
          keyPrefix + field.uid + ".",
          out,
          globalFieldSchemas
        );
      }
      continue;
    }
    if (dataType === "blocks" && field.blocks) {
      if (!Array.isArray(value)) continue;
      for (let i = 0; i < value.length; i++) {
        const wrapper = value[i] as Record<string, unknown> | undefined;
        if (!wrapper || typeof wrapper !== "object") continue;
        const blockType = getBlockTypeKey(wrapper);
        if (!blockType) continue;
        const blockData = wrapper[blockType] as Record<string, unknown> | undefined;
        if (!blockData || typeof blockData !== "object") continue;
        const blockDef = field.blocks.find((b) => b.uid === blockType);
        const blockSchema = blockDef?.schema;
        if (!blockSchema) continue;
        appendSlotsForSchema(
          blockSchema,
          blockData,
          [...pathPrefix, field.uid, i, blockType],
          keyPrefix + field.uid + "." + i + "." + blockType + ".",
          out,
          globalFieldSchemas
        );
      }
      continue;
    }
    // Handle scalar generatable fields (including JSON RTE) before global_field check,
    // because JSON RTE fields with embedded entries have reference_to set
    if (isScalarGeneratable(field)) {
      if (!Array.isArray(currentData)) {
        const path = [...pathPrefix, field.uid];
        const key = keyPrefix + field.uid;
        out.push(slotFromScalarField(field, path, key));
      }
      continue;
    }
    if (dataType === "global_field" || field.reference_to) {
      const refUid =
        typeof field.reference_to === "string"
          ? field.reference_to
          : Array.isArray(field.reference_to)
            ? field.reference_to[0]
            : undefined;
      const schemaFromGlobal = refUid ? getGlobalFieldSchema(refUid, globalFieldSchemas) : undefined;
      const schemaToUse = field.schema ?? schemaFromGlobal ?? [];
      const arr = Array.isArray(schemaToUse) ? schemaToUse : [];
      if (arr.length) {
        const obj = (value != null && typeof value === "object" && !Array.isArray(value))
          ? value as Record<string, unknown>
          : {};
        appendSlotsForSchema(
          arr,
          obj,
          [...pathPrefix, field.uid],
          keyPrefix + field.uid + ".",
          out,
          globalFieldSchemas
        );
      }
      continue;
    }
  }
}

/**
 * Build generatable slots from content type schema and current entry data.
 * Only includes fields that are already instanced (existing group items, block instances, global object).
 */
export function buildGeneratableSlots(
  schema: ContentTypeSchemaField[],
  entryData: Record<string, unknown>,
  globalFieldSchemas?: GlobalFieldSchemasMap
): GeneratableSlot[] {
  const out: GeneratableSlot[] = [];
  for (const field of schema) {
    const dataType = field.data_type ?? "text";
    if (dataType === "reference" || dataType === "file" || field.extension_uid) {
      continue;
    }
    const value = entryData[field.uid];
    if (dataType === "group" && field.schema) {
      if (value == null || typeof value !== "object") continue;
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          if (item != null && typeof item === "object") {
            appendSlotsForSchema(
              field.schema,
              item as Record<string, unknown>,
              [field.uid, i],
              field.uid + "." + i + ".",
              out,
              globalFieldSchemas
            );
          }
        }
      } else {
        appendSlotsForSchema(
          field.schema,
          value as Record<string, unknown>,
          [field.uid],
          field.uid + ".",
          out,
          globalFieldSchemas
        );
      }
      continue;
    }
    if (dataType === "blocks" && field.blocks) {
      if (!Array.isArray(value)) continue;
      for (let i = 0; i < value.length; i++) {
        const wrapper = value[i] as Record<string, unknown> | undefined;
        if (!wrapper || typeof wrapper !== "object") continue;
        const blockType = getBlockTypeKey(wrapper);
        if (!blockType) continue;
        const blockData = wrapper[blockType] as Record<string, unknown> | undefined;
        if (!blockData || typeof blockData !== "object") continue;
        const blockDef = field.blocks.find((b) => b.uid === blockType);
        const blockSchema = blockDef?.schema;
        if (!blockSchema) continue;
        appendSlotsForSchema(
          blockSchema,
          blockData,
          [field.uid, i, blockType],
          field.uid + "." + i + "." + blockType + ".",
          out,
          globalFieldSchemas
        );
      }
      continue;
    }
    // Handle scalar generatable fields (including JSON RTE) before global_field check,
    // because JSON RTE fields with embedded entries have reference_to set
    if (isScalarGeneratable(field)) {
      out.push(
        slotFromScalarField(field, [field.uid], field.uid)
      );
      continue;
    }
    if (dataType === "global_field" || field.reference_to) {
      const refUid =
        typeof field.reference_to === "string"
          ? field.reference_to
          : Array.isArray(field.reference_to)
            ? field.reference_to[0]
            : undefined;
      const schemaFromGlobal = refUid ? getGlobalFieldSchema(refUid, globalFieldSchemas) : undefined;
      const schemaToUse = field.schema ?? schemaFromGlobal ?? [];
      const arr = Array.isArray(schemaToUse) ? schemaToUse : [];
      if (arr.length) {
        const obj = (value != null && typeof value === "object" && !Array.isArray(value))
          ? value as Record<string, unknown>
          : {};
        appendSlotsForSchema(
          arr,
          obj,
          [field.uid],
          field.uid + ".",
          out,
          globalFieldSchemas
        );
      }
      continue;
    }
  }
  return out;
}

/** Recursively count generatable scalar fields in a schema (including nested groups). */
function countGeneratableFields(schema: ContentTypeSchemaField[]): number {
  let count = 0;
  for (const field of schema) {
    if (isScalarGeneratable(field)) {
      count += 1;
    } else if (field.data_type === "group" && field.schema) {
      count += countGeneratableFields(field.schema);
    }
  }
  return count;
}

export function extractBlockTypesFromSchema(
  schema: ContentTypeSchemaField[]
): SelectableBlockType[] {
  const blockTypes: SelectableBlockType[] = [];

  for (const field of schema) {
    if (field.data_type === "blocks" && field.blocks) {
      for (const block of field.blocks) {
        const fieldCount = countGeneratableFields(block.schema ?? []);
        if (fieldCount > 0) {
          blockTypes.push({
            uid: `${field.uid}.${block.uid}`,
            fieldUid: field.uid,
            typeUid: block.uid,
            title: block.title ?? block.uid,
            fieldCount,
          });
        }
      }
    }
  }

  return blockTypes;
}

/**
 * Build slots purely from schema (no entry data). For `multiple: true` groups,
 * generate 2 instances (indices 0 and 1). For single groups, recurse into their schema.
 */
function appendSlotsFromSchemaOnly(
  schema: ContentTypeSchemaField[],
  pathPrefix: (string | number)[],
  keyPrefix: string,
  out: GeneratableSlot[],
  globalFieldSchemas?: GlobalFieldSchemasMap
): void {
  for (const field of schema) {
    const dataType = field.data_type ?? "text";
    if (dataType === "reference" || dataType === "file" || field.extension_uid) {
      continue;
    }
    if (dataType === "group" && field.schema) {
      if (field.multiple) {
        // Generate 2 instances for multiple groups
        for (let i = 0; i < 2; i++) {
          appendSlotsFromSchemaOnly(
            field.schema,
            [...pathPrefix, field.uid, i],
            keyPrefix + field.uid + "." + i + ".",
            out,
            globalFieldSchemas
          );
        }
      } else {
        appendSlotsFromSchemaOnly(
          field.schema,
          [...pathPrefix, field.uid],
          keyPrefix + field.uid + ".",
          out,
          globalFieldSchemas
        );
      }
      continue;
    }
    if (dataType === "global_field" || field.reference_to) {
      const refUid =
        typeof field.reference_to === "string"
          ? field.reference_to
          : Array.isArray(field.reference_to)
            ? field.reference_to[0]
            : undefined;
      const schemaFromGlobal = refUid ? getGlobalFieldSchema(refUid, globalFieldSchemas) : undefined;
      const schemaToUse = field.schema ?? schemaFromGlobal ?? [];
      const arr = Array.isArray(schemaToUse) ? schemaToUse : [];
      if (arr.length) {
        appendSlotsFromSchemaOnly(
          arr,
          [...pathPrefix, field.uid],
          keyPrefix + field.uid + ".",
          out,
          globalFieldSchemas
        );
      }
      continue;
    }
    if (isScalarGeneratable(field)) {
      const path = [...pathPrefix, field.uid];
      const key = keyPrefix + field.uid;
      out.push(slotFromScalarField(field, path, key));
    }
  }
}

export function buildSlotsForBlockType(
  schema: ContentTypeSchemaField[],
  blockFieldUid: string,
  blockTypeUid: string,
  instanceIndex: number,
  globalFieldSchemas?: GlobalFieldSchemasMap
): GeneratableSlot[] {
  const blockField = schema.find((f) => f.uid === blockFieldUid);
  if (!blockField?.blocks) return [];

  const blockDef = blockField.blocks.find((b) => b.uid === blockTypeUid);
  if (!blockDef?.schema) return [];

  const slots: GeneratableSlot[] = [];
  appendSlotsFromSchemaOnly(
    blockDef.schema,
    [blockFieldUid, instanceIndex, blockTypeUid],
    `${blockFieldUid}.${instanceIndex}.${blockTypeUid}.`,
    slots,
    globalFieldSchemas
  );
  return slots;
}

/**
 * Count existing block instances per block field in entry data.
 * Returns a map of fieldUid -> count.
 */
export function countExistingBlocks(
  entryData: Record<string, unknown>,
  schema: ContentTypeSchemaField[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const field of schema) {
    if (field.data_type === "blocks") {
      const value = entryData[field.uid];
      counts[field.uid] = Array.isArray(value) ? value.length : 0;
    }
  }
  return counts;
}

/**
 * Build a flat list of field summaries for the LLM from the content type schema.
 * Only includes top-level generatable fields (text, number, boolean, isodate, link, select).
 * Skips reference, file, blocks, group (or we could recurse one level into group for MVP).
 */
export function buildFieldSummaries(schema: ContentTypeSchemaField[]): FieldSummary[] {
  const out: FieldSummary[] = [];
  for (const field of schema) {
    const dataType = field.data_type ?? "text";
    if (dataType === "reference" || dataType === "file" || field.extension_uid) {
      continue;
    }
    if (dataType === "group" || dataType === "blocks") {
      continue; // MVP: skip nested; could recurse into field.schema / field.blocks later
    }
    const jsonRte = isJsonRteField(field);
    const isGeneratable =
      jsonRte ||
      GENERATABLE_DATA_TYPES.has(dataType) ||
      (dataType === "text" && field.enum?.choices != null);
    if (!isGeneratable) {
      continue;
    }
    const summary: FieldSummary = {
      uid: field.uid,
      display_name: field.display_name ?? field.uid,
      data_type: jsonRte ? "json_rte" : dataType,
    };
    if (field.enum?.choices?.length) {
      summary.choices = field.enum.choices;
    }
    out.push(summary);
  }
  return out;
}

/**
 * Build nested payload from entry data and flat generated values.
 * The App SDK getField() accepts only top-level field UIDs; setData() must receive the full nested value.
 * This reassembles a payload keyed by top-level field UID so we can call getField(uid).setData(payload[uid]).
 */
export function buildNestedPayloadFromSlots(
  entryData: Record<string, unknown>,
  slots: GeneratableSlot[],
  flatGenerated: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(entryData)) {
    if (ENTRY_SYSTEM_KEYS.has(key)) continue;
    const v = entryData[key];
    result[key] =
      v !== null && typeof v === "object"
        ? JSON.parse(JSON.stringify(v))
        : v;
  }
  for (const slot of slots) {
    const value = flatGenerated[slot.key];
    if (value === undefined) continue;
    const path = slot.path;
    if (path.length === 0) continue;

    let current: Record<string, unknown> | unknown[] = result;
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i];
      const nextSeg = path[i + 1];
      const isNextNumeric = typeof nextSeg === "number";

      if (Array.isArray(current)) {
        const idx = seg as number;
        while (current.length <= idx) {
          current.push(undefined);
        }
        if (current[idx] == null) {
          current[idx] = isNextNumeric ? [] : {};
        }
        current = current[idx] as Record<string, unknown> | unknown[];
      } else {
        const key = seg as string;
        if (current[key] == null) {
          current[key] = isNextNumeric ? [] : {};
        }
        current = current[key] as Record<string, unknown> | unknown[];
      }
    }

    const last = path[path.length - 1];
    if (Array.isArray(current)) {
      const idx = last as number;
      while (current.length <= idx) {
        current.push(undefined);
      }
      current[idx] = value;
    } else if (current && typeof current === "object") {
      (current as Record<string, unknown>)[last as string] = value;
    }
  }

  for (const slot of slots) {
    if (slot.path.length >= 4 && typeof slot.path[1] === "number") {
      const fieldUid = slot.path[0] as string;
      const idx = slot.path[1] as number;
      const arr = result[fieldUid];
      if (!Array.isArray(arr)) continue;
      const wrapper = arr[idx] as Record<string, unknown> | undefined;
      if (wrapper && typeof wrapper === "object" && !wrapper._metadata) {
        wrapper._metadata = { uid: crypto.randomUUID() };
      }
    }
  }

  return result;
}

export type ApplyGeneratedProgressCallback = (
  fieldKey: string,
  index: number,
  total: number
) => void;

/**
 * Apply generated values to the entry: scalars via setData(value), blocks via setData(array of block wrappers).
 * Slot-driven: no full nested payload. Each top-level scalar is set once; each blocks field gets an array of
 * { [blockTypeUid]: { [fieldUid]: value } } — field data only, no _metadata.
 * If entryData is provided, blocks are merged into the existing array (metadata stripped) so the UI gets only field data.
 */
export async function applyGeneratedToEntry(
  entry: {
    getField: (key: string) => { setData: (value: unknown) => Promise<unknown> } | undefined;
  },
  slots: GeneratableSlot[],
  flatGenerated: Record<string, unknown>,
  onProgress?: ApplyGeneratedProgressCallback,
  entryData?: Record<string, unknown>
): Promise<void> {
  if (!entry || typeof entry.getField !== "function") {
    throw new Error("Entry or getField not available.");
  }

  const scalarSlots = slots.filter((s) => s.path.length === 1);
  const blockSlots = slots.filter(
    (s) => s.path.length >= 4 && typeof s.path[1] === "number"
  );
  // Group slots: path.length > 1, not block slots (groups, nested groups, global fields)
  const groupSlots = slots.filter(
    (s) => s.path.length > 1 && !(s.path.length >= 4 && typeof s.path[1] === "number")
  );

  const scalarFieldUids = [...new Set(scalarSlots.map((s) => s.path[0] as string))];
  const blocksFieldUids = [...new Set(blockSlots.map((s) => s.path[0] as string))];
  const groupFieldUids = [...new Set(groupSlots.map((s) => s.path[0] as string))];
  const totalOps = scalarFieldUids.length + blocksFieldUids.length + groupFieldUids.length;
  let opIndex = 0;

  for (const fieldUid of scalarFieldUids) {
    const slot = scalarSlots.find((s) => (s.path[0] as string) === fieldUid);
    if (!slot) continue;
    const value = flatGenerated[slot.key];
    if (value === undefined) continue;
    const field = entry.getField(fieldUid);
    if (field?.setData) {
      if (onProgress) onProgress(fieldUid, opIndex, totalOps);
      await field.setData(value);
    }
    opIndex += 1;
  }

  // Apply group-level fields: build the full nested value for each top-level group field
  for (const groupFieldUid of groupFieldUids) {
    const slotsForField = groupSlots.filter((s) => (s.path[0] as string) === groupFieldUid);
    const existingValue = entryData?.[groupFieldUid];
    let base: unknown = existingValue != null && typeof existingValue === "object"
      ? JSON.parse(JSON.stringify(existingValue))
      : (slotsForField.some((s) => typeof s.path[1] === "number") ? [] : {});

    for (const slot of slotsForField) {
      const value = flatGenerated[slot.key];
      if (value === undefined) continue;
      const innerPath = slot.path.slice(1);
      if (innerPath.length === 0) continue;

      // Walk the path and set the value
      let current: Record<string, unknown> | unknown[] = base as Record<string, unknown> | unknown[];
      for (let i = 0; i < innerPath.length - 1; i++) {
        const seg = innerPath[i];
        const nextSeg = innerPath[i + 1];
        const isNextNumeric = typeof nextSeg === "number";

        if (Array.isArray(current)) {
          const arrIdx = seg as number;
          while (current.length <= arrIdx) {
            current.push(isNextNumeric ? [] : {});
          }
          if (current[arrIdx] == null) {
            current[arrIdx] = isNextNumeric ? [] : {};
          }
          current = current[arrIdx] as Record<string, unknown> | unknown[];
        } else {
          const key = seg as string;
          if (current[key] == null) {
            current[key] = isNextNumeric ? [] : {};
          }
          current = current[key] as Record<string, unknown> | unknown[];
        }
      }

      const last = innerPath[innerPath.length - 1];
      if (Array.isArray(current)) {
        const arrIdx = last as number;
        while (current.length <= arrIdx) {
          current.push(undefined);
        }
        current[arrIdx] = value;
      } else if (current && typeof current === "object") {
        (current as Record<string, unknown>)[last as string] = value;
      }
    }

    const field = entry.getField(groupFieldUid);
    if (field?.setData) {
      if (onProgress) onProgress(groupFieldUid, opIndex, totalOps);
      await field.setData(base);
    }
    opIndex += 1;
  }

  for (const blocksFieldUid of blocksFieldUids) {
    const slotsForField = blockSlots.filter((s) => (s.path[0] as string) === blocksFieldUid);

    // Build the blocks array using buildNestedPayloadFromSlots which handles arbitrary depth
    const existingBlocks = entryData?.[blocksFieldUid];
    const baseArray = Array.isArray(existingBlocks)
      ? (JSON.parse(JSON.stringify(existingBlocks)) as Record<string, unknown>[]).map((wrapper) => {
          if (wrapper != null && typeof wrapper === "object") {
            delete wrapper._metadata;
          }
          return wrapper;
        })
      : [];

    // For each slot, walk into the baseArray using path segments after index 0 (the blocks field uid)
    for (const slot of slotsForField) {
      const value = flatGenerated[slot.key];
      if (value === undefined) continue;
      // path is [blocksFieldUid, index, blockType, ...nestedPath, fieldUid]
      const innerPath = slot.path.slice(1); // e.g. [0, "hero", "hero_cta", 0, "link"]
      if (innerPath.length === 0) continue;

      // Ensure the array is large enough
      const idx = innerPath[0] as number;
      while (baseArray.length <= idx) {
        baseArray.push({});
      }

      // Walk the path and set the value
      let current: Record<string, unknown> | unknown[] = baseArray;
      for (let i = 0; i < innerPath.length - 1; i++) {
        const seg = innerPath[i];
        const nextSeg = innerPath[i + 1];
        const isNextNumeric = typeof nextSeg === "number";

        if (Array.isArray(current)) {
          const arrIdx = seg as number;
          while (current.length <= arrIdx) {
            current.push(isNextNumeric ? [] : {});
          }
          if (current[arrIdx] == null) {
            current[arrIdx] = isNextNumeric ? [] : {};
          }
          current = current[arrIdx] as Record<string, unknown> | unknown[];
        } else {
          const key = seg as string;
          if (current[key] == null) {
            current[key] = isNextNumeric ? [] : {};
          }
          current = current[key] as Record<string, unknown> | unknown[];
        }
      }

      const last = innerPath[innerPath.length - 1];
      if (Array.isArray(current)) {
        const arrIdx = last as number;
        while (current.length <= arrIdx) {
          current.push(undefined);
        }
        current[arrIdx] = value;
      } else if (current && typeof current === "object") {
        (current as Record<string, unknown>)[last as string] = value;
      }
    }

    const field = entry.getField(blocksFieldUid);
    if (field?.setData) {
      if (onProgress) onProgress(blocksFieldUid, opIndex, totalOps);
      await field.setData(baseArray);
    }
    opIndex += 1;
  }
}

/** Get a value from a nested object by dot path (e.g. "my_group.my_link" or "blocks.0.hero.title"). */
function getValueByPath(
  obj: Record<string, unknown>,
  dotKey: string
): unknown {
  if (!dotKey) return obj;
  const segments = dotKey.split(".");
  let current: unknown = obj;
  for (const seg of segments) {
    if (current == null || typeof current !== "object") return undefined;
    const num = Number(seg);
    if (Number.isInteger(num) && !Number.isNaN(num) && Array.isArray(current)) {
      current = current[num];
    } else if (current && typeof current === "object" && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return current;
}

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

/**
 * Call OpenAI chat completions to generate a JSON object of slot key -> value.
 * Returns a flat record keyed by slot key; coerces types where needed.
 */
export async function generateEntryContent(
  topic: string,
  slots: GeneratableSlot[],
  contentTitle: string,
  openaiApiKey: string,
  openaiOrgId?: string
): Promise<Record<string, unknown>> {
  if (!openaiApiKey.trim()) {
    throw new Error("OpenAI API key is not configured.");
  }
  const fieldList = slots
    .map((s) => {
      let line = `- ${s.key} (${s.display_name}): ${s.data_type}`;
      if (s.choices?.length) {
        const vals = s.choices.map((c) => {
          const choice = c as { value?: string; key?: string };
          return choice.value ?? choice.key ?? "";
        }).filter(Boolean);
        line += `, one of: ${vals.join(", ")}`;
      }
      return line;
    })
    .join("\n");

  const systemPrompt =
    "You are a content writer. Return only valid JSON, no markdown or code fences. " +
    "Keys are exactly the field keys given. Values must match the described type and be on-topic, realistic, and varied. " +
    "For link type use object: { \"title\": \"...\", \"url\": \"https://...\" }. " +
    "For isodate use ISO 8601 date string. For boolean use true or false. For number use a number. For select use one of the allowed values. " +
    "For json_rte type, return an HTML string with headings (<h2>, <h3>), paragraphs (<p>), <strong>, <em>, <ul>/<ol> lists. Do not use code blocks or tables.";
  const userPrompt = `Topic: ${topic}\nContent type: ${contentTitle}\nGenerate one value per field. Return JSON only.\n\nFields:\n${fieldList}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${openaiApiKey.trim()}`,
  };
  if (openaiOrgId?.trim()) {
    headers["OpenAI-Organization"] = openaiOrgId.trim();
  }
  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${errBody}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("OpenAI returned empty response.");
  }

  let raw = content;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    raw = jsonMatch[0];
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("OpenAI response was not valid JSON.");
  }

  return coerceSlotsFromParsed(parsed, slots);
}

/**
 * Read values from nested parsed JSON by slot key path and coerce to slot types.
 * Iterates slots (not payload keys) so link and other object-valued fields are preserved.
 */
function coerceSlotsFromParsed(
  parsed: Record<string, unknown>,
  slots: GeneratableSlot[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const slot of slots) {
    const raw =
      parsed[slot.key] !== undefined
        ? parsed[slot.key]
        : getValueByPath(parsed, slot.key);
    if (raw == null) continue;
    switch (slot.data_type) {
      case "number":
        out[slot.key] = typeof raw === "number" ? raw : Number(raw);
        break;
      case "boolean":
        out[slot.key] = typeof raw === "boolean" ? raw : raw === "true" || raw === true;
        break;
      case "isodate":
        out[slot.key] = typeof raw === "string" ? raw : String(raw);
        break;
      case "link":
        out[slot.key] =
          typeof raw === "object" && raw !== null && "title" in raw && "url" in raw
            ? raw
            : { title: String(raw), url: "#" };
        break;
      case "json_rte":
        out[slot.key] = convertHtmlToJsonRte(String(raw));
        break;
      default:
        out[slot.key] = raw;
    }
  }
  return out;
}

/** Pick a random topic for demo when user leaves topic empty. */
const DEMO_TOPICS = [
  "Japanese tea ceremony",
  "Mars colonization",
  "Medieval castles",
  "Underwater photography",
  "Origami",
  "Nordic cuisine",
  "Victorian fashion",
  "Space telescopes",
];

export function getRandomDemoTopic(): string {
  return DEMO_TOPICS[Math.floor(Math.random() * DEMO_TOPICS.length)];
}
