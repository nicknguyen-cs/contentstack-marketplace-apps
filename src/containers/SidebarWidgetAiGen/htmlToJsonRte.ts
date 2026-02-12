import { htmlToJson } from "@contentstack/json-rte-serializer";

/**
 * Convert an HTML string to a Contentstack JSON RTE document.
 * Uses browser-native DOMParser + the official @contentstack/json-rte-serializer.
 */
export function convertHtmlToJsonRte(html: string): Record<string, unknown> {
  const trimmed = html.trim();
  if (!trimmed) {
    return {
      type: "doc",
      uid: "empty",
      children: [{ type: "p", uid: "empty-p", children: [{ text: "" }] }],
    };
  }
  const doc = new DOMParser().parseFromString(trimmed, "text/html");
  return (htmlToJson(doc.body) as Record<string, unknown>) ?? {
    type: "doc",
    uid: "empty",
    children: [{ type: "p", uid: "empty-p", children: [{ text: "" }] }],
  };
}
