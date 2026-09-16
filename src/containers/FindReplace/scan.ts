import {
  ContentTypeField,
  EntryData,
  FieldMatch,
  MatchSnippet,
  ScanOptions,
  TextFieldNode,
  TextFieldTree,
} from "./types";

/** Characters of context shown on each side of the first match in a snippet. */
const SNIPPET_CONTEXT = 48;

/**
 * Build the regex for a scan. The term is always escaped — plain-text matching
 * only, no user-supplied regex.
 */
export function buildMatcher(term: string, options: ScanOptions): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const source = options.wholeWord ? `\\b${escaped}\\b` : escaped;
  return new RegExp(source, options.caseSensitive ? "g" : "gi");
}

/**
 * Derive the tree of plain-text field locations from a content-type schema.
 *
 * Included: `data_type: "text"` without an enum (single-line, multi-line,
 * markdown). Recursed: groups, global fields (inlined via
 * include_global_field_schema), and modular blocks. Everything else — JSON
 * RTE, links, files, references, selects, numbers, the top-level `url` slug —
 * is excluded so a replace can never corrupt structured values.
 */
export function buildTextTree(schema: ContentTypeField[] | undefined, topLevel = true): TextFieldTree {
  const tree: TextFieldTree = {};
  for (const field of schema ?? []) {
    if (field.data_type === "text") {
      // Select/dropdown fields are data_type "text" with an enum — their
      // values must stay within the schema's choices.
      if (field.enum) continue;
      if (topLevel && field.uid === "url") continue;
      tree[field.uid] = { kind: "text" };
    } else if ((field.data_type === "group" || field.data_type === "global_field") && field.schema) {
      const children = buildTextTree(field.schema, false);
      if (Object.keys(children).length > 0) tree[field.uid] = { kind: "group", children };
    } else if (field.data_type === "blocks" && field.blocks) {
      const blocks: Record<string, TextFieldTree> = {};
      for (const block of field.blocks) {
        const children = buildTextTree(block.schema, false);
        if (Object.keys(children).length > 0) blocks[block.uid] = children;
      }
      if (Object.keys(blocks).length > 0) tree[field.uid] = { kind: "blocks", blocks };
    }
  }
  return tree;
}

interface WalkContext {
  regex: RegExp;
  replacement: string;
  matches: FieldMatch[];
}

interface WalkResult {
  value: unknown;
  changed: boolean;
}

/**
 * Walk an entry along the schema-derived text tree, collecting a FieldMatch
 * per matching string and returning the changed top-level fields with the
 * replacement applied. One walk produces both the preview and the write
 * payload, so they can never diverge.
 */
export function replaceInEntry(
  entry: EntryData,
  tree: TextFieldTree,
  regex: RegExp,
  replacement: string
): { changedFields: Record<string, unknown>; matches: FieldMatch[] } {
  const ctx: WalkContext = { regex, replacement, matches: [] };
  const changedFields: Record<string, unknown> = {};
  for (const [uid, node] of Object.entries(tree)) {
    if (!(uid in entry)) continue;
    const result = walk(entry[uid], node, uid, ctx);
    if (result.changed) changedFields[uid] = result.value;
  }
  return { changedFields, matches: ctx.matches };
}

function walk(value: unknown, node: TextFieldNode, path: string, ctx: WalkContext): WalkResult {
  if (node.kind === "text") {
    if (typeof value === "string") return replaceString(value, path, ctx);
    if (Array.isArray(value)) {
      // `multiple` text field — an array of strings.
      return walkArray(value, path, (item, itemPath) =>
        typeof item === "string" ? replaceString(item, itemPath, ctx) : { value: item, changed: false }
      );
    }
    return { value, changed: false };
  }

  if (node.kind === "group") {
    if (Array.isArray(value)) {
      return walkArray(value, path, (item, itemPath) => walkObject(item, node.children, itemPath, ctx));
    }
    return walkObject(value, node.children, path, ctx);
  }

  // Modular blocks: an array of { [blockUid]: { ...fields } } instances.
  if (Array.isArray(value)) {
    return walkArray(value, path, (item, itemPath) => {
      if (!isPlainObject(item)) return { value: item, changed: false };
      const blockUid = Object.keys(item).find((key) => key in node.blocks);
      if (!blockUid) return { value: item, changed: false };
      const inner = walkObject(item[blockUid], node.blocks[blockUid], `${itemPath}.${blockUid}`, ctx);
      return inner.changed ? { value: { ...item, [blockUid]: inner.value }, changed: true } : { value: item, changed: false };
    });
  }
  return { value, changed: false };
}

function walkArray(
  arr: unknown[],
  path: string,
  visit: (item: unknown, itemPath: string) => WalkResult
): WalkResult {
  let changed = false;
  const out = arr.map((item, i) => {
    const result = visit(item, `${path}[${i}]`);
    if (result.changed) changed = true;
    return result.value;
  });
  return { value: changed ? out : arr, changed };
}

function walkObject(
  value: unknown,
  children: TextFieldTree,
  path: string,
  ctx: WalkContext
): WalkResult {
  if (!isPlainObject(value)) return { value, changed: false };
  let changed = false;
  const out: Record<string, unknown> = { ...value };
  for (const [uid, node] of Object.entries(children)) {
    if (!(uid in value)) continue;
    const result = walk(value[uid], node, `${path}.${uid}`, ctx);
    if (result.changed) {
      out[uid] = result.value;
      changed = true;
    }
  }
  return { value: changed ? out : value, changed };
}

function replaceString(value: string, path: string, ctx: WalkContext): WalkResult {
  // matchAll clones the regex internally, so the shared global regex stays stateless.
  const found = [...value.matchAll(ctx.regex)];
  if (found.length === 0) return { value, changed: false };

  const first = found[0];
  const index = first.index ?? 0;
  const matchText = first[0];
  ctx.matches.push({
    path,
    count: found.length,
    before: makeSnippet(value, index, matchText, matchText),
    after: makeSnippet(value, index, matchText, ctx.replacement),
  });
  // Replacement via callback so "$" sequences in the replacement text stay literal.
  return { value: value.replace(ctx.regex, () => ctx.replacement), changed: true };
}

function makeSnippet(value: string, index: number, matchText: string, shown: string): MatchSnippet {
  const prefixStart = Math.max(0, index - SNIPPET_CONTEXT);
  const suffixEnd = Math.min(value.length, index + matchText.length + SNIPPET_CONTEXT);
  return {
    prefix: (prefixStart > 0 ? "…" : "") + value.slice(prefixStart, index),
    match: shown,
    suffix: value.slice(index + matchText.length, suffixEnd) + (suffixEnd < value.length ? "…" : ""),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
