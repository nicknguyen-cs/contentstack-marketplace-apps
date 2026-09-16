/**
 * STEP 2 of 2 — Update each child's URL.
 *
 * Takes the child list from STEP 1 (script_1.js) and rewrites each child's
 * MASTER-locale URL so the new parent URL sits at the front of the slug. Each
 * child URL is rebuilt the SAME way the DynamicUrl custom field does
 * (see DynamicUrl.tsx):  /{parentUrl}/{taxonomyTerm}/{titleSlug}
 *   - parentUrl     : the parent entry's `url` (from STEP 1)
 *   - taxonomyTerm  : the child's first taxonomy term's name, slugified
 *   - titleSlug     : the child's `title`, slugified
 * Keeping the composition identical means the field and this script never
 * disagree (no flip-flopping).
 *
 * Inputs (map these from STEP 1's output):
 *   input.references       - [{ content_type_uid, entry_uid }] from STEP 1
 *   input.parent_url       - the parent's new URL from STEP 1
 *   input.api_key          - stack API key
 *   input.management_token - management token
 *
 * Runs on Node 18+ (global `fetch`). No external dependencies.
 */

// ---------------------------------------------------------------------------
// Config — set these values directly.
// ---------------------------------------------------------------------------

// Region base URLs:
//   NA   -> https://api.contentstack.io
//   EU   -> https://eu-api.contentstack.com
//   AU   -> https://au-api.contentstack.com
//   GCP  -> https://gcp-na-api.contentstack.com
const BASE_URL = "https://api.contentstack.io";

const API_KEY = input.api_key;
const MANAGEMENT_TOKEN = input.management_token;

// Optional: only needed if you work with branches. Leave "" if not.
const BRANCH = "main";

// From STEP 1 (script_1.js). `references` may arrive as an array or a JSON
// string depending on how Automate maps it — both are handled below.
const REFERENCES_INPUT = input.references;
const PARENT_URL = input.parent_url ?? input.entry?.url ?? "";

// Field UIDs — must match the DynamicUrl field config on the child content type.
const FIELDS = {
  urlFieldUid: "url", // the child's URL field to rewrite
  taxonomyFieldUid: "taxonomies", // where the child's taxonomy terms live
  taxonomyUid: "", // optional: restrict to one taxonomy when several are present
  titleFieldUid: "title", // the field whose slug is the final URL segment
};

// How many child updates to run at once (CMA is rate-limited; keep this small).
const CONCURRENCY = 5;

// ---------------------------------------------------------------------------
// URL composition — kept identical to composeUrl/slugify in DynamicUrl.tsx.
// ---------------------------------------------------------------------------

/** Split a path into its non-empty segments: "/a/b/" -> ["a", "b"]. */
function segmentsOf(path) {
  return (path ?? "").split("/").filter(Boolean);
}

/**
 * Turn a term name / title into a URL-safe segment: strip diacritics,
 * lowercase, and collapse anything non-alphanumeric to a single hyphen.
 * "Électronique & Photo" -> "electronique-photo".
 */
function slugify(input) {
  return (input ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Build the child URL from its parts:  /{parent}/{taxonomyTerm}/{titleSlug}.
 * Any empty part is dropped. Rebuilt from sources, so it is idempotent.
 */
function composeUrl(parentUrl, taxonomyTerm, titleSlug) {
  const allSegments = [...segmentsOf(parentUrl), taxonomyTerm, titleSlug].filter(Boolean);
  return "/" + allSegments.join("/");
}

// ---------------------------------------------------------------------------
// CMA helpers
// ---------------------------------------------------------------------------

function cmaHeaders() {
  const headers = {
    api_key: API_KEY,
    authorization: MANAGEMENT_TOKEN,
    "Content-Type": "application/json",
  };
  if (BRANCH) headers.branch = BRANCH;
  return headers;
}

/**
 * A thin fetch wrapper that JSON-parses the response and retries transient
 * network failures + 429s with exponential backoff (CMA is ~10 req/s).
 */
async function cma(method, path, body) {
  const url = `${BASE_URL}${path}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: cmaHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      // Transient network failure ("fetch failed") — back off and retry. The
      // real reason (ENOTFOUND / ECONNREFUSED / TLS / etc.) is on err.cause.
      const cause = err?.cause?.code || err?.cause?.message || err?.cause || "(no cause)";
      const waitMs = 2 ** attempt * 500;
      console.warn(`Network error on ${method} ${path}: ${err?.message} | cause: ${cause} — retrying in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (response.status === 429) {
      const waitMs = 2 ** attempt * 500;
      console.warn(`Rate limited on ${method} ${path} — retrying in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${method} ${path} failed: ${response.status} ${response.statusText} — ${text}`);
    }

    return response.json();
  }
  throw new Error(`${method} ${path} failed: exhausted retries (network or rate limit)`);
}

/** Fetch a single entry (master locale). Returns the full entry object. */
async function getEntry(contentTypeUid, entryUid) {
  const data = await cma(
    "GET",
    `/v3/content_types/${encodeURIComponent(contentTypeUid)}/entries/${encodeURIComponent(entryUid)}`
  );
  return data.entry;
}

/** Fetch a taxonomy term (master locale) and return its name, or "". */
async function getTermName(taxonomyUid, termUid) {
  const data = await cma(
    "GET",
    `/v3/taxonomies/${encodeURIComponent(taxonomyUid)}/terms/${encodeURIComponent(termUid)}`
  );
  return data.term?.name ?? "";
}

/**
 * Resolve the taxonomy URL segment for a child entry (master locale): read its
 * first {taxonomy_uid, term_uid}, fetch the term's name, and slugify it. Falls
 * back to the slugified term_uid, or "" when the child has no taxonomy.
 */
async function resolveTaxonomyTerm(childEntry) {
  const items = childEntry[FIELDS.taxonomyFieldUid];
  if (!Array.isArray(items)) return "";

  const match = FIELDS.taxonomyUid
    ? items.find((t) => t?.taxonomy_uid === FIELDS.taxonomyUid && t?.term_uid)
    : items.find((t) => t?.term_uid && t?.taxonomy_uid);
  if (!match?.taxonomy_uid || !match?.term_uid) return "";

  try {
    const name = await getTermName(match.taxonomy_uid, match.term_uid);
    return slugify(name) || slugify(match.term_uid);
  } catch (err) {
    console.warn(`  could not fetch term "${match.term_uid}", using term_uid: ${err.message}`);
    return slugify(match.term_uid);
  }
}

/**
 * Recompute one child's master-locale URL from the parent URL and write it back
 * (fetch-modify-PUT) only if it changed. Returns a small result object.
 */
async function updateChildUrl(contentTypeUid, entryUid, parentUrl) {
  const child = await getEntry(contentTypeUid, entryUid);

  const taxonomyTerm = await resolveTaxonomyTerm(child);
  const titleSlug = slugify(child[FIELDS.titleFieldUid]);
  const newUrl = composeUrl(parentUrl, taxonomyTerm, titleSlug);
  const currentUrl = child[FIELDS.urlFieldUid] ?? "";

  if (newUrl === currentUrl) {
    return { entryUid, contentTypeUid, changed: false, url: currentUrl };
  }

  // Fetch-modify-PUT: send the whole entry back with only `url` changed so no
  // other fields are wiped.
  await cma(
    "PUT",
    `/v3/content_types/${encodeURIComponent(contentTypeUid)}/entries/${encodeURIComponent(entryUid)}`,
    { entry: { ...child, [FIELDS.urlFieldUid]: newUrl } }
  );

  return { entryUid, contentTypeUid, changed: true, from: currentUrl, to: newUrl };
}

/** Run an async mapper over items with a fixed concurrency cap. */
async function mapWithConcurrency(items, limit, mapper) {
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Normalize STEP 1's `references` input (array, JSON string, or nested). */
function parseReferences(value) {
  let refs = value;
  if (typeof refs === "string") {
    try {
      refs = JSON.parse(refs);
    } catch {
      return [];
    }
  }
  // Allow either a bare array or the whole STEP 1 output object.
  if (refs && !Array.isArray(refs) && Array.isArray(refs.references)) {
    refs = refs.references;
  }
  return Array.isArray(refs) ? refs : [];
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
  try {
    const references = parseReferences(REFERENCES_INPUT);
    console.log(`Updating ${references.length} child(ren) under parent URL: ${PARENT_URL || "(empty)"}`);

    const results = await mapWithConcurrency(references, CONCURRENCY, async (ref) => {
      try {
        const result = await updateChildUrl(ref.content_type_uid, ref.entry_uid, PARENT_URL);
        if (result.changed) {
          console.log(`  ✓ ${ref.entry_uid}: ${result.from} -> ${result.to}`);
        } else {
          console.log(`  · ${ref.entry_uid}: unchanged (${result.url})`);
        }
        return result;
      } catch (err) {
        console.error(`  ✗ ${ref.entry_uid}: ${err.message}`);
        return { entryUid: ref.entry_uid, contentTypeUid: ref.content_type_uid, error: err.message };
      }
    });

    const changed = results.filter((r) => r?.changed).length;
    const failed = results.filter((r) => r?.error).length;
    console.log(`Done. ${changed} updated, ${failed} failed, ${results.length - changed - failed} unchanged.`);
    return { ok: failed === 0, results };
  } catch (err) {
    console.error("Update step failed:", err?.message, err?.cause ?? "");
    return { ok: false, error: err?.message };
  }
}

// Return the result so Automate passes it to the next step.
return await main();
