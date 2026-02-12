
import type { AiGenConfig, ContentTypeSchemaResponse } from "./types";

const DEFAULT_BASE_URL = "https://api.contentstack.io";

function getBaseUrl(config: AiGenConfig | null | undefined): string {
  if (!config) return DEFAULT_BASE_URL;
  const url = config.baseUrl;
  if (url && typeof url === "string") return url.replace(/\/$/, "");
  return DEFAULT_BASE_URL;
}

/**
 * Fetch content type schema from CMA (GET /v3/content_types/{uid}).
 * Returns schema array and content type title for the generator prompt.
 */
export async function fetchContentTypeSchema(
  config: AiGenConfig,
  contentTypeUid: string
): Promise<ContentTypeSchemaResponse> {
  const baseUrl = getBaseUrl(config);
  const apiKey = config.apiKey;
  const authorization = config.authorization;
  if (!apiKey || !authorization) {
    throw new Error("API credentials not configured. Configure the app with Stack API Key and Management Token.");
  }
  const url = `${baseUrl}/v3/content_types/${encodeURIComponent(contentTypeUid)}?include_global_field_schema=true&include_global_field=true`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      api_key: apiKey,
      authorization: authorization,
    },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to fetch content type: ${res.status} ${errText}`);
  }
  const data = (await res.json()) as ContentTypeSchemaResponse;
  return data;
}

