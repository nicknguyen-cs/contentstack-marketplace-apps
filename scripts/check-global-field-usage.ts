import * as https from "https";

interface Config {
  apiKey: string;
  authorization: string;
  contentTypeUids: string[];
  globalFieldUid: string;
  baseUrl?: string;
}

interface EntryResult {
  title: string;
  uid: string;
  usages: string[];
}

interface ContentTypeResult {
  contentTypeUid: string;
  entriesScanned: number;
  entriesWithUsage: number;
  entries: EntryResult[];
}

interface GlobalFieldReference {
  fieldUid: string;
  path: string;
}

interface SchemaField {
  uid: string;
  data_type: string;
  reference_to?: string;
  schema?: SchemaField[];
  blocks?: Array<{ uid: string; schema: SchemaField[] }>;
}

interface ContentTypeSchema {
  content_type: {
    uid: string;
    schema: SchemaField[];
  };
}

// Configuration - Update these values for your use case
const config: Config = {
  apiKey: process.env.CS_API_KEY || "blt63d4ae319e4ee4e7",
  authorization: process.env.CS_MANAGEMENT_TOKEN || "cs76c3e8d29a105e555b1f80b1",
  contentTypeUids: process.env.CS_CONTENT_TYPE_UIDS?.split(",") || ["tester"],
  globalFieldUid: process.env.CS_GLOBAL_FIELD_UID || "header_block",
  baseUrl: process.env.CS_BASE_URL || "https://api.contentstack.io",
};

function validateConfig(config: Config): void {
  const missing: string[] = [];

  if (!config.apiKey) missing.push("apiKey (CS_API_KEY)");
  if (!config.authorization) missing.push("authToken (CS_MANAGEMENT_TOKEN)");
  if (!config.contentTypeUids.length)
    missing.push("contentTypeUids (CS_CONTENT_TYPE_UIDS)");
  if (!config.globalFieldUid) missing.push("globalFieldUid (CS_GLOBAL_FIELD_UID)");

  if (missing.length > 0) {
    console.error("Missing required configuration:");
    missing.forEach((field) => console.error(`  - ${field}`));
    console.error("\nSet environment variables or update the config object in the script.");
    console.error("\nExample usage:");
    console.error(
      '  CS_API_KEY="your-api-key" CS_MANAGEMENT_TOKEN="your-token" CS_CONTENT_TYPE_UIDS="page,blog_post" CS_GLOBAL_FIELD_UID="button_group" npx tsx scripts/check-global-field-usage.ts'
    );
    process.exit(1);
  }
}

function makeRequest<T>(url: string, headers: Record<string, string>): Promise<T> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers,
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(
              new Error(
                `API Error ${res.statusCode}: ${parsed.error_message || JSON.stringify(parsed)}`
              )
            );
          } else {
            resolve(parsed as T);
          }
        } catch {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

interface EntriesResponse {
  entries: Record<string, unknown>[];
  count?: number;
}

async function fetchContentTypeSchema(
  contentTypeUid: string,
  config: Config
): Promise<ContentTypeSchema> {
  const headers = {
    api_key: config.apiKey,
    authorization: config.authorization,
    "Content-Type": "application/json",
  };

  const url = `${config.baseUrl}/v3/content_types/${contentTypeUid}`;

  try {
    return await makeRequest<ContentTypeSchema>(url, headers);
  } catch (error) {
    throw new Error(
      `Failed to fetch schema for ${contentTypeUid}: ${error instanceof Error ? error.message : error}`
    );
  }
}

interface ModularBlock {
  uid: string;
  title?: string;
  schema?: SchemaField[];
  reference_to?: string;
}

function findGlobalFieldReferences(
  schema: SchemaField[],
  globalFieldUid: string,
  currentPath: string = ""
): GlobalFieldReference[] {
  const references: GlobalFieldReference[] = [];

  for (const field of schema) {
    const fieldPath = currentPath ? `${currentPath}.${field.uid}` : field.uid;

    // Check if this field is a global field reference
    if (field.data_type === "global_field" && field.reference_to === globalFieldUid) {
      references.push({ fieldUid: field.uid, path: fieldPath });
    }

    // Check nested schema (for group fields)
    if (field.schema) {
      references.push(...findGlobalFieldReferences(field.schema, globalFieldUid, fieldPath));
    }

    // Check modular blocks
    if (field.data_type === "blocks" && field.blocks) {
      for (const block of field.blocks as ModularBlock[]) {
        const blockPath = `${fieldPath}[].${block.uid}`;

        // Modular blocks can directly reference global fields via reference_to
        if (block.reference_to === globalFieldUid) {
          references.push({ fieldUid: block.uid, path: blockPath });
        }

        // Or they can have their own schema with nested fields
        if (block.schema) {
          references.push(...findGlobalFieldReferences(block.schema, globalFieldUid, blockPath));
        }
      }
    }
  }

  return references;
}

async function fetchAllEntries(
  contentTypeUid: string,
  config: Config
): Promise<Record<string, unknown>[]> {
  const allEntries: Record<string, unknown>[] = [];
  let skip = 0;
  const limit = 100;
  let hasMore = true;

  const headers = {
    api_key: config.apiKey,
    authorization: config.authorization,
    "Content-Type": "application/json",
  };

  while (hasMore) {
    const url = `${config.baseUrl}/v3/content_types/${contentTypeUid}/entries?skip=${skip}&limit=${limit}`;

    try {
      const response = await makeRequest<EntriesResponse>(url, headers);
      const entries = response.entries || [];
      allEntries.push(...entries);

      if (entries.length < limit) {
        hasMore = false;
      } else {
        skip += limit;
      }
    } catch (error) {
      throw new Error(
        `Failed to fetch entries for ${contentTypeUid}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  return allEntries;
}

function findGlobalFieldUsages(
  obj: unknown,
  globalFieldReferences: GlobalFieldReference[],
  currentPath: string = ""
): string[] {
  const usages: string[] = [];

  if (obj === null || obj === undefined) {
    return usages;
  }

  // Extract field UIDs we're looking for
  const targetFieldUids = new Set(globalFieldReferences.map((ref) => ref.fieldUid));

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const path = currentPath ? `${currentPath}[${index}]` : `[${index}]`;
      usages.push(...findGlobalFieldUsages(item, globalFieldReferences, path));
    });
  } else if (typeof obj === "object") {
    const record = obj as Record<string, unknown>;

    // Recursively check all properties
    for (const [key, value] of Object.entries(record)) {
      // Skip internal/metadata fields
      if (key.startsWith("_") || key === "ACL" || key === "publish_details") {
        continue;
      }

      const path = currentPath ? `${currentPath}.${key}` : key;

      // Check if this key matches one of our global field UIDs
      // and the value is a non-null object (global fields are always objects)
      if (targetFieldUids.has(key) && value !== null && typeof value === "object") {
        usages.push(path);
      }

      // Continue recursive search
      usages.push(...findGlobalFieldUsages(value, globalFieldReferences, path));
    }
  }

  return usages;
}

async function scanContentType(
  contentTypeUid: string,
  config: Config
): Promise<ContentTypeResult> {
  console.log(`\nFetching schema for content type: ${contentTypeUid}`);

  // Step 1: Fetch the schema
  const schemaResponse = await fetchContentTypeSchema(contentTypeUid, config);
  const schema = schemaResponse.content_type.schema;

  // Step 2: Find field UIDs that reference the target global field
  const globalFieldReferences = findGlobalFieldReferences(schema, config.globalFieldUid);

  if (globalFieldReferences.length > 0) {
    for (const ref of globalFieldReferences) {
      console.log(`  Found global field reference: "${ref.fieldUid}" -> "${config.globalFieldUid}"`);
    }
  } else {
    console.log(`  No references to global field "${config.globalFieldUid}" found in schema`);
    return {
      contentTypeUid,
      entriesScanned: 0,
      entriesWithUsage: 0,
      entries: [],
    };
  }

  // Step 3: Fetch and scan entries
  console.log(`\nScanning entries...`);
  const entries = await fetchAllEntries(contentTypeUid, config);
  const results: EntryResult[] = [];
  let entriesWithUsage = 0;

  for (const entry of entries) {
    const title = (entry.title as string) || (entry.uid as string) || "Untitled";
    const uid = entry.uid as string;
    const usages = findGlobalFieldUsages(entry, globalFieldReferences);

    if (usages.length > 0) {
      entriesWithUsage++;
      console.log(`  Entry "${title}" (${uid}) - USES global field at:`);
      usages.forEach((path) => console.log(`    - ${path}`));
    } else {
      console.log(`  Entry "${title}" (${uid}) - No usage found`);
    }

    results.push({ title, uid, usages });
  }

  return {
    contentTypeUid,
    entriesScanned: entries.length,
    entriesWithUsage,
    entries: results,
  };
}

async function main(): Promise<void> {
  console.log("Global Field Usage Scanner");
  console.log("==========================\n");

  validateConfig(config);

  console.log(`Searching for global field: "${config.globalFieldUid}"`);
  console.log(`Content types to scan: ${config.contentTypeUids.join(", ")}`);

  const results: ContentTypeResult[] = [];

  for (const contentTypeUid of config.contentTypeUids) {
    try {
      const result = await scanContentType(contentTypeUid, config);
      results.push(result);
    } catch (error) {
      console.error(
        `\nError scanning ${contentTypeUid}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(50));
  console.log("Summary:");
  console.log("=".repeat(50));

  let totalScanned = 0;
  let totalWithUsage = 0;

  for (const result of results) {
    console.log(
      `  Content Type: ${result.contentTypeUid} - ${result.entriesScanned} entries, ${result.entriesWithUsage} using global field "${config.globalFieldUid}"`
    );
    totalScanned += result.entriesScanned;
    totalWithUsage += result.entriesWithUsage;
  }

  console.log("-".repeat(50));
  console.log(
    `  Total: ${totalScanned} entries scanned, ${totalWithUsage} using global field "${config.globalFieldUid}"`
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
