/**
 * agent — the SEO/AEO/GEO generation agent. Given an entry's base content, it
 * produces a publish-ready answer-engine layer (the demo's "artifact"):
 * answer-first copy, meta title/description, key facts, buyer-intent FAQ, and
 * schema.org JSON-LD. It uses ONLY facts present in the content — no invention.
 */
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

export interface FaqItem {
  q: string;
  a: string;
}

export interface GeoPackage {
  answerFirst: string;
  metaTitle: string;
  metaDescription: string;
  keyFacts: string[];
  faq: FaqItem[];
  /** schema.org JSON-LD, built deterministically from the fields above. */
  jsonLd: string;
}

const SYSTEM_PROMPT =
  "You are an SEO/AEO/GEO optimization agent for a CMS. Given a web page's raw content, produce an " +
  "answer-engine-optimized layer. Use ONLY information present in the content — never invent facts. " +
  "Return ONLY JSON (no prose, no code fences) in exactly this shape: " +
  '{"answerFirst":"...","metaTitle":"...","metaDescription":"...","keyFacts":["Label: value"],' +
  '"faq":[{"q":"...","a":"..."}]}. ' +
  "Rules: answerFirst = a 1-2 sentence answer-first summary that leads with what the page is and the " +
  "single most important fact a visitor wants. metaTitle <= 60 characters. metaDescription <= 155 characters. " +
  "keyFacts = 4 to 8 concise 'Label: value' facts drawn from the content. " +
  "faq = 4 to 5 questions a real prospective customer or visitor would actually ask about this page, " +
  "each answered in 1-2 sentences grounded strictly in the content.";

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function asFaq(v: unknown): FaqItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      const o = (item ?? {}) as Record<string, unknown>;
      return { q: asString(o.q), a: asString(o.a) };
    })
    .filter((f) => f.q && f.a);
}

function buildJsonLd(title: string, description: string, faq: FaqItem[]): string {
  const graph: unknown[] = [{ "@type": "Article", headline: title, description }];
  if (faq.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2);
}

export async function generateGeoPackage(
  contentText: string,
  title: string,
  openaiApiKey: string,
  openaiOrgId?: string
): Promise<GeoPackage> {
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
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Page title: ${title}\n\nPage content:\n${contentText}` },
      ],
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${errBody}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("The agent returned an empty response.");
  }

  const match = content.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match ? match[0] : content) as Record<string, unknown>;

  const answerFirst = asString(parsed.answerFirst);
  const metaTitle = asString(parsed.metaTitle);
  const metaDescription = asString(parsed.metaDescription);
  const keyFacts = asStringArray(parsed.keyFacts);
  const faq = asFaq(parsed.faq);

  return {
    answerFirst,
    metaTitle,
    metaDescription,
    keyFacts,
    faq,
    jsonLd: buildJsonLd(metaTitle || title, metaDescription || answerFirst, faq),
  };
}

/** Render the optimized package as the answer engine's "After" retrieved source. */
export function packageToSource(pkg: GeoPackage): string {
  const lines: string[] = ["ANSWER:", pkg.answerFirst, ""];
  if (pkg.keyFacts.length) {
    lines.push("KEY FACTS:", ...pkg.keyFacts.map((k) => `- ${k}`), "");
  }
  if (pkg.faq.length) {
    lines.push("FAQ:");
    for (const f of pkg.faq) {
      lines.push(`Q: ${f.q}`, `A: ${f.a}`, "");
    }
  }
  return lines.join("\n").trim();
}
