/**
 * SidebarWidgetSeoPrompts — Entry Sidebar Widget that demos SEO/AEO/GEO value.
 *
 * On "Run demo" it:
 *   1. Runs a generation agent over the entry's base content → a publish-ready
 *      answer layer (answer-first copy, meta, key facts, buyer FAQ, schema.org).
 *   2. Takes the agent's buyer questions and asks an answer engine each one twice
 *      — against the un-optimized page snippet vs the generated layer — under a
 *      strict "answer only from the source, else say Not stated" rule.
 *
 * The modal shows the fail→win scoreboard and the generated artifact. Requires an
 * OpenAI API key in App Configuration. (Real model, simulated post-publish retrieval.)
 */
import React, { useEffect, useState } from "react";
import ContentstackAppSDK from "@contentstack/app-sdk";
import { Button, Info, Icon, cbModal } from "@contentstack/venus-components";
import "@contentstack/venus-components/build/main.css";
import {
  entryTitle,
  entryToText,
  entryToSnippet,
  buildAnswerPrompt,
  isNotStated,
} from "./promptBuilder";
import { runChat } from "./runChat";
import { generateGeoPackage, packageToSource } from "./agent";
import ComparisonModal, { type QuestionResult } from "./ComparisonModal";
import "./SidebarWidgetSeoPrompts.css";

interface OpenAiConfig {
  openaiApiKey?: string;
  openaiOrgId?: string;
}

const MAX_QUESTIONS = 4;

/**
 * Resolve the parent CMS origin the widget is embedded in.
 * `ancestorOrigins` is Chromium/WebKit-only; fall back to the referrer, then
 * to our own origin. We read our OWN frame's metadata here — not the parent's
 * DOM — so the same-origin policy doesn't block it.
 */
function getParentOrigin(): string {
  const fromAncestors = window.location.ancestorOrigins?.[0];
  console.log(window.location.ancestorOrigins);
  if (fromAncestors) return fromAncestors;
  if (document.referrer) {
    try {
      return new URL(document.referrer).origin;
    } catch {
      /* ignore */
    }
  }
  return window.location.origin;
}

/**
 * Friendly "cloud + region — host" label. Region comes from the SDK (reliable);
 * the host string disambiguates the cloud, which the region alone cannot
 * (AWS/GCP/Azure all share "NA"/"EU").
 */
function describeOriginServer(region?: string): string {
  let host = "";
  try {
    host = new URL(getParentOrigin()).hostname;
  } catch {
    host = getParentOrigin();
  }
  const cloud = /azure|(^|[.-])az-/.test(host)
    ? "Azure"
    : /gcp/.test(host)
      ? "GCP"
      : "AWS";
  return `${cloud} ${region ?? "NA"} — ${host}`;
}

const SidebarWidgetSeoPrompts: React.FC = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sdk, setSdk] = useState<any>(null);
  const [config, setConfig] = useState<OpenAiConfig | null>(null);
  const [originServer, setOriginServer] = useState<string>("");
  const [entryData, setEntryData] = useState<Record<string, unknown> | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [message, setMessage] = useState<{ type: "success" | "warning"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const sdkInstance = await ContentstackAppSDK.init();
        if (cancelled) return;
        setSdk(sdkInstance);
        setOriginServer(describeOriginServer(sdkInstance.region));

        const appConfig = await sdkInstance.getConfig();
        if (cancelled) return;
        const appConfigObj = appConfig as Record<string, unknown> | undefined;
        const configObj = appConfigObj?.configuration as Record<string, unknown> | undefined;
        const serverConfig = appConfigObj?.serverConfiguration as Record<string, unknown> | undefined;
        setConfig({
          openaiApiKey: (serverConfig?.openaiApiKey ??
            serverConfig?.openai_api_key ??
            configObj?.openaiApiKey ??
            configObj?.openai_api_key ??
            appConfigObj?.openaiApiKey ??
            appConfigObj?.openai_api_key) as string | undefined,
          openaiOrgId: (serverConfig?.openaiOrgId ??
            serverConfig?.openai_org_id ??
            configObj?.openaiOrgId ??
            configObj?.openai_org_id ??
            appConfigObj?.openaiOrgId ??
            appConfigObj?.openai_org_id) as string | undefined,
        });

        const sidebar = sdkInstance?.location?.SidebarWidget;
        const entry = sidebar?.entry;
        if (!entry) {
          setMessage({ type: "warning", text: "Open an entry to run the demo." });
          return;
        }

        const readData = async (): Promise<Record<string, unknown> | undefined> => {
          const draft = await entry.getDraftData?.();
          if (draft && typeof draft === "object") return draft as Record<string, unknown>;
          const data = await entry.getData?.();
          return data && typeof data === "object" ? (data as Record<string, unknown>) : undefined;
        };

        const initial = await readData();
        if (cancelled) return;
        if (initial) setEntryData(initial);

        if (typeof entry.onChange === "function") {
          unsubscribe = entry.onChange(async () => {
            const next = await readData();
            if (next) setEntryData(next);
          });
        }
      } catch (e) {
        if (!cancelled) {
          setMessage({
            type: "warning",
            text: "Failed to initialize: " + (e instanceof Error ? e.message : "Unknown error"),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const hasOpenAiKey = !!config?.openaiApiKey?.trim();
  const hasContent = !!entryData && entryToText(entryData).trim().length > 0;
  const canRun = hasOpenAiKey && hasContent;

  const handleRun = async () => {
    if (!entryData || !hasContent) {
      setMessage({ type: "warning", text: "This entry has no content to optimize yet." });
      return;
    }
    if (!hasOpenAiKey) {
      setMessage({
        type: "warning",
        text: "Configure an OpenAI API key in App Configuration to run the demo.",
      });
      return;
    }
    const apiKey = config!.openaiApiKey!;
    const orgId = config?.openaiOrgId;

    setIsRunning(true);
    setMessage(null);
    try {
      const title = entryTitle(entryData);
      const contentText = entryToText(entryData);
      const snippet = entryToSnippet(entryData);

      setProgress("Generating the SEO/AEO/GEO layer…");
      const pkg = await generateGeoPackage(contentText, title, apiKey, orgId);
      if (pkg.faq.length === 0) {
        setMessage({
          type: "warning",
          text: "The agent couldn't derive buyer questions from this entry. Try a richer entry.",
        });
        setIsRunning(false);
        setProgress("");
        return;
      }

      const afterSource = packageToSource(pkg);
      const questions = pkg.faq.slice(0, MAX_QUESTIONS).map((f) => f.q);

      setProgress(`Testing ${questions.length} customer questions against both versions…`);
      const results: QuestionResult[] = await Promise.all(
        questions.map(async (q) => {
          const [beforeAnswer, afterAnswer] = await Promise.all([
            runChat(buildAnswerPrompt(q, snippet), apiKey, orgId),
            runChat(buildAnswerPrompt(q, afterSource), apiKey, orgId),
          ]);
          return {
            q,
            beforeAnswer,
            afterAnswer,
            beforeAnswered: !isNotStated(beforeAnswer),
            afterAnswered: !isNotStated(afterAnswer),
          };
        })
      );

      cbModal({
        component: (props: Record<string, unknown>) => (
          <ComparisonModal
            {...props}
            title={title}
            snippet={snippet}
            results={results}
            pkg={pkg}
          />
        ),
        modalProps: { size: "max", customClass: "seo-cmp-modal" },
      });
    } catch (e) {
      setMessage({
        type: "warning",
        text: e instanceof Error ? e.message : "Failed to run the demo.",
      });
    } finally {
      setIsRunning(false);
      setProgress("");
    }
  };

  if (!sdk) {
    return (
      <div className="seo-prompts">
        <p className="seo-prompts-loading">Loading...</p>
      </div>
    );
  }

  return (
    <div className="seo-prompts">
      <h3 className="seo-prompts-title">Answer-engine readiness</h3>
      <p className="seo-prompts-desc">
        Generates an SEO/AEO/GEO layer from this entry, then shows how many real customer questions
        an AI answer engine could answer — before vs after — with the generated schema, FAQ, and
        answer-first copy.
      </p>

      {!hasOpenAiKey && (
        <Info
          content="Configure an OpenAI API key in App Configuration to run the demo."
          type="warning"
          icon={<Icon icon="InfoCircleWhite" />}
          style={{ marginBottom: 12 }}
        />
      )}

      {message && (
        <Info
          content={message.text}
          type={message.type}
          dismissable
          icon={<Icon icon="InfoCircleWhite" />}
          style={{ marginBottom: 12 }}
        />
      )}

      <div className="seo-prompts-actions">
        <Button buttonType="primary" onClick={handleRun} disabled={!canRun || isRunning} isLoading={isRunning}>
          {isRunning ? "Running…" : "Run demo"}
        </Button>
      </div>

      {isRunning && progress && <p className="seo-prompts-progress">{progress}</p>}

      {originServer && (
        <p className="seo-prompts-origin">
          Origin server: <strong>{originServer}</strong>
        </p>
      )}
    </div>
  );
};

export default SidebarWidgetSeoPrompts;
