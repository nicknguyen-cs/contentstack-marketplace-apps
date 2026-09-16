/**
 * Minimal typing over the App SDK's stack API (appSdk.stack), which is typed
 * `any` upstream. Pure api/scan functions take this instead of hooks. Calls run
 * through the host window as the logged-in user — no app scopes or tokens.
 */
export interface StackEntryQueryHandle {
  language(code: string): StackEntryQueryHandle;
  limit(n: number): StackEntryQueryHandle;
  skip(n: number): StackEntryQueryHandle;
  find(): Promise<unknown>;
}

export interface StackEntryHandle {
  language(code: string): StackEntryHandle;
  update(payload: Record<string, unknown>, locale?: string): Promise<unknown>;
}

export interface StackEntryModule {
  (uid: string): StackEntryHandle;
  Query(): StackEntryQueryHandle;
}

export interface StackHandle {
  getContentTypes(query?: Record<string, unknown>, params?: Record<string, unknown>): Promise<unknown>;
  getLocales(query?: Record<string, unknown>): Promise<unknown>;
  ContentType(uid: string): { Entry: StackEntryModule };
}

/** Subset of a content-type schema field relevant to text scanning. */
export interface ContentTypeField {
  uid: string;
  display_name?: string;
  data_type: string;
  multiple?: boolean;
  enum?: { advanced?: boolean; choices?: unknown[] };
  schema?: ContentTypeField[];
  blocks?: { uid: string; title?: string; schema?: ContentTypeField[] }[];
  field_metadata?: Record<string, unknown>;
}

export interface ContentTypeSummary {
  uid: string;
  title: string;
  schema?: ContentTypeField[];
}

export interface LocaleSummary {
  code: string;
  name: string;
}

export type EntryData = Record<string, unknown> & { uid?: string; title?: string; locale?: string };

/**
 * Schema-derived matcher tree: which parts of an entry hold plain text that is
 * safe to rewrite. Built once per content type from its schema so the walk
 * never touches select values, URLs, links, assets, references, or RTE trees.
 */
export type TextFieldNode =
  | { kind: "text" }
  | { kind: "group"; children: Record<string, TextFieldNode> }
  | { kind: "blocks"; blocks: Record<string, Record<string, TextFieldNode>> };

export type TextFieldTree = Record<string, TextFieldNode>;

export interface ScanOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}

/** A snippet of a field value around the first match, split for highlighting. */
export interface MatchSnippet {
  prefix: string;
  match: string;
  suffix: string;
}

export interface FieldMatch {
  /** Human-readable field path, e.g. "seo.description" or "sections[2].hero.heading". */
  path: string;
  count: number;
  before: MatchSnippet;
  after: MatchSnippet;
}

export interface EntryMatch {
  entryUid: string;
  entryTitle: string;
  contentTypeUid: string;
  contentTypeTitle: string;
  locale: string;
  matches: FieldMatch[];
  /** Top-level fields with replacements already applied — exactly what gets PUT on replace. */
  changedFields: Record<string, unknown>;
}

export type StopReason = "cap" | "cancelled" | null;

export interface ScanProgress {
  entriesScanned: number;
  contentTypeIndex: number;
  contentTypeCount: number;
  currentContentType: string | null;
  currentLocale: string | null;
}

export interface ReplaceResult {
  entryUid: string;
  entryTitle: string;
  contentTypeUid: string;
  contentTypeTitle: string;
  locale: string;
  matchCount: number;
  ok: boolean;
  error?: string;
}

export interface SearchFormState {
  term: string;
  replacement: string;
  selectedCtUids: string[];
  /** Locale codes to scan — each is scanned and replaced independently. */
  locales: string[];
  caseSensitive: boolean;
  wholeWord: boolean;
}
