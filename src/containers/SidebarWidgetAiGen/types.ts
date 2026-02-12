/** Config for AI-gen sidebar: CMA credentials + OpenAI API key (from app config). */
export interface AiGenConfig {
  apiKey?: string;
  authorization?: string;
  baseUrl?: string;
  openaiApiKey?: string;
  openaiOrgId?: string;
  [key: string]: unknown;
}

/** Single field summary for the LLM prompt (uid, display_name, data_type, optional choices). */
export interface FieldSummary {
  uid: string;
  display_name: string;
  data_type: string;
  choices?: Array<{ value: string } | { key: string; value: string }>;
}

/** Slot used for prompt and reassembly: path in entry, stable key, display name, type, choices. */
export interface GeneratableSlot {
  path: (string | number)[];
  key: string;
  display_name: string;
  data_type: string;
  choices?: Array<{ value: string } | { key: string; value: string }>;
}

/** CMA GET content_types/{uid} response: content_type with schema array. */
export interface ContentTypeSchemaResponse {
  content_type?: {
    uid: string;
    title?: string;
    schema: ContentTypeSchemaField[];
  };
  /** When include_global_field=true, may contain expanded global field schemas keyed by UID. */
  global_fields?: Record<string, { schema?: ContentTypeSchemaField[] }>;
}

/** Map of global field UID to schema (array or object with schema). Used when building slots. */
export type GlobalFieldSchemasMap =
  | Record<string, ContentTypeSchemaField[]>
  | Record<string, { schema?: ContentTypeSchemaField[] }>;

/** Single field in Contentstack content type schema (CMA response). */
export interface ContentTypeSchemaField {
  uid: string;
  display_name?: string;
  data_type: string;
  field_metadata?: Record<string, unknown>;
  enum?: {
    advanced?: boolean;
    choices?: Array<{ value: string } | { key: string; value: string }>;
  };
  schema?: ContentTypeSchemaField[];
  blocks?: Array<{ uid: string; title?: string; schema?: ContentTypeSchemaField[] }>;
  reference_to?: string | string[];
  [key: string]: unknown;
}

/** Selectable block type from schema for generation UI. */
export interface SelectableBlockType {
  /** Compound uid: "blockFieldUid.blockTypeUid" */
  uid: string;
  /** Block field UID (parent modular blocks field) */
  fieldUid: string;
  /** Block type UID within the field */
  typeUid: string;
  /** Display title for the block type */
  title: string;
  /** Number of generatable fields in this block type */
  fieldCount: number;
}
