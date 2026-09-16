/**
 * promptBuilder — entry → text utilities for the answer-engine demo.
 *
 *  - flattenEntry / entryToText: the entry's content as readable "Label: value" text.
 *  - entryToSnippet: a degraded, truncated, label-less prose snippet — how an
 *    answer engine sees an UN-optimized page (the "Before" source).
 *  - buildAnswerPrompt: a strict, grounded answer-engine prompt used to test a
 *    single question against a given source. "Not stated" when the source lacks it.
 *
 * Everything is deterministic and content-only — the optimized "After" layer is
 * produced separately by the generation agent (agent.ts).
 */

export interface FlatField {
  /** Human-readable label, e.g. "Hero › Title". */
  label: string;
  /** Single-line, human-readable value. */
  value: string;
}

/** Contentstack system/meta keys that are not entry content. */
const SYSTEM_KEYS = new Set<string>([
  "uid",
  "_version",
  "_metadata",
  "ACL",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
  "_in_progress",
  "locale",
  "publish_details",
  "_workflow",
  "content_type",
  "content_type_uid",
  "title_disabled",
  "url_disabled",
  "_owner",
  "_branch",
  "_restore_status",
  "stackHeaders",
  "tags",
]);

function humanize(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Recursively pull plain text out of a Contentstack JSON RTE document. */
function extractRteText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractRteText).join("");
  if (isPlainObject(node)) {
    let s = "";
    if (typeof node.text === "string") s += node.text;
    if (Array.isArray(node.children)) s += node.children.map(extractRteText).join(" ");
    return s;
  }
  return "";
}

function looksLikeRte(v: Record<string, unknown>): boolean {
  return v.type === "doc" || (Array.isArray(v.children) && "type" in v);
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
}

/** Flatten one value into label/value lines, recursing through groups and blocks. */
function flatten(value: unknown, label: string, out: FlatField[]): void {
  if (value == null || value === "") return;

  if (typeof value === "string") {
    if (value.trim()) out.push({ label, value: value.trim() });
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    out.push({ label, value: String(value) });
    return;
  }
  if (Array.isArray(value)) {
    const allPrimitive = value.every(
      (x) => typeof x === "string" || typeof x === "number" || typeof x === "boolean"
    );
    if (allPrimitive) {
      if (value.length) out.push({ label, value: value.join(", ") });
      return;
    }
    value.forEach((item, i) => flatten(item, `${label} ${i + 1}`, out));
    return;
  }
  if (isPlainObject(value)) {
    if (looksLikeRte(value)) {
      const text = extractRteText(value).trim();
      if (text) out.push({ label, value: text });
      return;
    }
    // Link field: { title, href } / { title, url }
    if ("href" in value || "url" in value) {
      const href = (value.href ?? value.url) as string;
      const title = (value.title ?? value.text ?? href) as string;
      if (href) out.push({ label, value: `${title} (${href})` });
      return;
    }
    // File / asset field
    if ("filename" in value && ("url" in value || "uid" in value)) {
      out.push({ label, value: String(value.filename) });
      return;
    }
    // Group / modular block instance — recurse, skipping meta keys.
    for (const [k, v] of Object.entries(value)) {
      if (SYSTEM_KEYS.has(k) || k.startsWith("$")) continue;
      flatten(v, `${label} › ${humanize(k)}`, out);
    }
  }
}

/** Flatten a whole entry into ordered, human-readable content fields. */
export function flattenEntry(entryData: Record<string, unknown>): FlatField[] {
  const out: FlatField[] = [];
  for (const [k, v] of Object.entries(entryData)) {
    if (SYSTEM_KEYS.has(k) || k.startsWith("$")) continue;
    flatten(v, humanize(k), out);
  }
  return out;
}

function getEntryTitle(entryData: Record<string, unknown>, fields: FlatField[]): string {
  const title = entryData.title ?? entryData.name;
  if (typeof title === "string" && title.trim()) return title.trim();
  return fields[0]?.value ?? "this entry";
}

/** Public: the entry's display title. */
export function entryTitle(entryData: Record<string, unknown>): string {
  return getEntryTitle(entryData, flattenEntry(entryData));
}

/**
 * Detects SEO/AEO/GEO-oriented fields (by label) so the demo works from the
 * entry's BASE content — the agent regenerates the optimized layer itself.
 */
function isSeoField(label: string): boolean {
  const l = label.toLowerCase();
  return (
    /\bseo\b/.test(l) ||
    /\baeo\b/.test(l) ||
    /\bgeo\b/.test(l) ||
    /\bog\b/.test(l) ||
    /open\s*graph/.test(l) ||
    /canonical/.test(l) ||
    /keywords?/.test(l) ||
    /schema/.test(l) ||
    /structured\s*data/.test(l) ||
    /json\s*-?\s*ld/.test(l) ||
    /rich\s*(snippet|result)/.test(l) ||
    /\bfaq/.test(l) ||
    /\bmeta(\s|_|-|$|title|desc|keyword|tag)/.test(l)
  );
}

/** Non-SEO content fields — the page's base body content. */
function bodyFields(entryData: Record<string, unknown>): FlatField[] {
  const all = flattenEntry(entryData);
  const body = all.filter((f) => !isSeoField(f.label));
  return body.length ? body : all;
}

/** Full base content as readable "Label: value" text — the agent's input. */
export function entryToText(entryData: Record<string, unknown>): string {
  return bodyFields(entryData)
    .map((f) => `${f.label}: ${f.value}`)
    .join("\n");
}

const SNIPPET_MAX = 420;

/**
 * The "Before" source: how an answer engine sees an UN-optimized page — a short,
 * label-less run of body prose, truncated the way a search snippet is.
 */
export function entryToSnippet(entryData: Record<string, unknown>): string {
  const prose = bodyFields(entryData)
    .map((f) => f.value)
    .join(". ")
    .replace(/\s+/g, " ")
    .trim();
  return truncate(prose, SNIPPET_MAX);
}

/** Sentinel the answer engine must return when the source can't answer. */
export const NOT_STATED = "Not stated in the source.";

const ANSWER_INSTRUCTION =
  "You are an AI answer engine (like ChatGPT Search or Perplexity) responding to a user. " +
  "Answer the user's question using ONLY facts explicitly stated in the SOURCE below. " +
  "Do not infer, guess, or use any outside knowledge. " +
  `If the exact answer is not explicitly present in the source, reply with exactly: "${NOT_STATED}" ` +
  "Otherwise answer in 1-2 sentences and quote the supporting text.";

/** Strict, grounded answer-engine prompt for one question against one source. */
export function buildAnswerPrompt(question: string, source: string): string {
  return `${ANSWER_INSTRUCTION}\n\nUSER QUESTION:\n${question}\n\nSOURCE:\n${source}`;
}

/** True when an answer is the "can't answer" sentinel (used to score Before/After). */
export function isNotStated(answer: string): boolean {
  return answer.trim().toLowerCase().startsWith("not stated");
}
