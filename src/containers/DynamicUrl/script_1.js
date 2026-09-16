/**
 * STEP 1 of 2 — Find the children of a changed parent entry.
 *
 * When a parent (e.g. "landing_page") entry's URL changes, this step looks up
 * every entry that references it (its children) and returns that list, plus the
 * parent's new URL, for STEP 2 (script.js) to update.
 *
 * Inputs (from the trigger payload):
 *   input.entry            - the parent entry object (has `url` + `uid`)
 *   input.contenttype_uid  - the parent's content type UID (e.g. "article")
 *   input.api_key          - stack API key
 *   input.management_token - management token
 *
 * Returns:
 *   { parent_url, parent_uid, references: [{ content_type_uid, entry_uid, title }] }
 * Map `references` and `parent_url` into STEP 2's inputs.
 *
 * Runs on Node 18+ (global `fetch`). No external dependencies.
 */

// Region base URLs: NA https://api.contentstack.io | EU https://eu-api.contentstack.com
//                   AU https://au-api.contentstack.com | GCP https://gcp-na-api.contentstack.com
const BASE_URL = "https://api.contentstack.io";
const BRANCH = "main"; // leave "" if you don't use branches

async function main() {
  try {
    const parentUrl = input.entry?.url ?? "";
    const parentUid = input.entry?.uid;
    const contentTypeUid = input.contenttype_uid;
    if (!parentUid || !contentTypeUid) {
      throw new Error("Missing parent entry uid or content type uid (check input.entry / input.contenttype_uid).");
    }

    // Entries that reference the parent = its children.
    const response = await fetch(
      `${BASE_URL}/v3/content_types/${encodeURIComponent(contentTypeUid)}/entries/${encodeURIComponent(parentUid)}/references`,
      {
        method: "GET",
        headers: {
          api_key: input.api_key,
          authorization: input.management_token,
          "Content-Type": "application/json",
          ...(BRANCH ? { branch: BRANCH } : {}),
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`References request failed: ${response.status} ${response.statusText} — ${text}`);
    }

    const data = await response.json();
    const references = (data.references || []).map((ref) => ({
      content_type_uid: ref.content_type_uid,
      entry_uid: ref.entry_uid,
      title: ref.title,
    }));

    console.log(`Parent ${parentUid} URL: ${parentUrl || "(empty)"} — found ${references.length} child reference(s).`);
    return { ok: true, parent_url: parentUrl, parent_uid: parentUid, references };
  } catch (err) {
    console.error("Reference lookup failed:", err?.message, err?.cause ?? "");
    return { ok: false, error: err?.message, references: [] };
  }
}

// Return the result so Automate passes it to the next step.
return await main();
