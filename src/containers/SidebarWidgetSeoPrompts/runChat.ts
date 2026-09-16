/**
 * runChat — minimal OpenAI Chat Completions call that returns the assistant's
 * plain-text answer. Mirrors the request conventions used by SidebarWidgetAiGen's
 * generator (same endpoint, model, auth/org headers, error shape), but returns
 * free-form text instead of forcing JSON.
 */
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
// gpt-4o-mini matches the AiGen widget and makes the Before/After gap more visible
// than a top-tier model (which often answers the un-optimized prompt well already).
const MODEL = "gpt-4o-mini";

export async function runChat(
  prompt: string,
  openaiApiKey: string,
  openaiOrgId?: string
): Promise<string> {
  if (!openaiApiKey.trim()) {
    throw new Error("OpenAI API key is not configured.");
  }

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
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${errBody}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("OpenAI returned an empty response.");
  }
  return content;
}
