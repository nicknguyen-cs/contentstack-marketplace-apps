/**
 * SidebarWidgetAiGen — AI-powered content generator for the current entry.
 *
 * Flow when user clicks "Generate with AI":
 *  1. Fetch content type schema and read current entry data.
 *  2. Build "slots" (one per generatable field: top-level, blocks, groups, global).
 *  3. Call OpenAI with slot keys/descriptions; get back a flat JSON of key → value.
 *  4. Apply: scalars via field.setData(value), blocks via field.setData(array of { [blockType]: { ...fields } }).
 */
import React, { useEffect, useState } from "react";
import ContentstackAppSDK from "@contentstack/app-sdk";
import { Button, Info, Icon } from "@contentstack/venus-components";
import "@contentstack/venus-components/build/main.css";
import { fetchContentTypeSchema } from "./services";
import {
  applyGeneratedToEntry,
  buildGeneratableSlots,
  buildSlotsForBlockType,
  countExistingBlocks,
  extractBlockTypesFromSchema,
  generateEntryContent,
  getRandomDemoTopic,
  normalizeGlobalFieldSchemas,
} from "./generator";
import type { AiGenConfig, SelectableBlockType } from "./types";
import "./SidebarWidgetAiGen.css";

type ProgressPhase = "schema" | "generating" | "applying";

const SidebarWidgetAiGen: React.FC = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sdk, setSdk] = useState<any>(null);
  const [config, setConfig] = useState<AiGenConfig | null>(null);
  const [contentTypeUid, setContentTypeUid] = useState<string>("");
  const [topic, setTopic] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "warning"; text: string } | null>(null);
  const [progressPhase, setProgressPhase] = useState<ProgressPhase | null>(null);
  const [progressDetail, setProgressDetail] = useState<string>("");
  const [availableBlockTypes, setAvailableBlockTypes] = useState<SelectableBlockType[]>([]);
  const [selectedBlockTypes, setSelectedBlockTypes] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sdkInstance = await ContentstackAppSDK.init();
        if (cancelled) return;
        setSdk(sdkInstance);
        const appConfig = await sdkInstance.getConfig();
        if (cancelled) return;
        const appConfigObj = appConfig as Record<string, unknown> | undefined;
        const configObj = appConfigObj?.configuration as Record<string, unknown> | undefined;
        const serverConfig = appConfigObj?.serverConfiguration as Record<string, unknown> | undefined;
        // Read canonical keys: prefer configuration, then top-level appConfig (host may return flattened config)
        const cfg: AiGenConfig = {
          apiKey: (configObj?.apiKey ?? configObj?.stackApiKey ?? appConfigObj?.apiKey ?? appConfigObj?.stackApiKey) as string | undefined,
          authorization: (configObj?.authorization ?? configObj?.managementToken ?? appConfigObj?.authorization ?? appConfigObj?.managementToken) as string | undefined,
          baseUrl: (configObj?.baseUrl ?? configObj?.apiUrl ?? appConfigObj?.baseUrl ?? appConfigObj?.apiUrl) as string | undefined,
          openaiApiKey:
            (serverConfig?.openaiApiKey ?? serverConfig?.openai_api_key ?? configObj?.openaiApiKey ?? configObj?.openai_api_key ?? appConfigObj?.openaiApiKey ?? appConfigObj?.openai_api_key) as string | undefined,
          openaiOrgId:
            (serverConfig?.openaiOrgId ?? serverConfig?.openai_org_id ?? configObj?.openaiOrgId ?? configObj?.openai_org_id ?? appConfigObj?.openaiOrgId ?? appConfigObj?.openai_org_id) as string | undefined,
        };
        setConfig(cfg);

        const sidebar = sdkInstance?.location?.SidebarWidget;
        const entry = sidebar?.entry;
        if (entry) {
          const data = (entry as { _data?: { content_type?: string; uid?: string; locale?: string } })._data ?? (await (entry as unknown as { getData?: () => Promise<{ content_type?: string; uid?: string; locale?: string }> }).getData?.());
          const ct = (entry as { content_type?: { uid?: string }; locale?: string }).content_type?.uid ?? data?.content_type;
          if (ct) {
            setContentTypeUid(ct);
          }
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
    };
  }, []);

  // Fetch schema when contentTypeUid and config are available to show block types
  useEffect(() => {
    if (!contentTypeUid || !config) return;
    let cancelled = false;
    (async () => {
      try {
        const ctResponse = await fetchContentTypeSchema(config, contentTypeUid);
        if (cancelled) return;
        const fetchedSchema = ctResponse?.content_type?.schema ?? [];
        const blockTypes = extractBlockTypesFromSchema(fetchedSchema);
        setAvailableBlockTypes(blockTypes);
      } catch {
        // Schema fetch failed, block selection won't be available
        setAvailableBlockTypes([]);
      }
    })();
    return () => { cancelled = true; };
  }, [contentTypeUid, config]);

  const handleGenerate = async () => {
    if (!sdk || !config?.openaiApiKey?.trim() || !contentTypeUid) {
      setMessage({
        type: "warning",
        text: !config?.openaiApiKey?.trim()
          ? "Configure OpenAI API key in App Configuration to use auto-generate."
          : "Entry context not available. Open an entry to generate content.",
      });
      return;
    }
    setIsGenerating(true);
    setMessage(null);
    setProgressPhase("schema");
    setProgressDetail("Fetching content type...");
    let simulateInterval: ReturnType<typeof setInterval> | null = null;
    try {
      const sidebar = sdk.location?.SidebarWidget;
      const entry = sidebar?.entry;
      if (!entry) {
        setMessage({ type: "warning", text: "Entry not available. Open an entry to generate content." });
        setIsGenerating(false);
        setProgressPhase(null);
        setProgressDetail("");
        return;
      }
      const entryData = (await (entry as { getDraftData?: () => Promise<Record<string, unknown>> }).getDraftData?.()) ?? (await (entry as { getData: () => Promise<Record<string, unknown>> }).getData?.());
      if (!entryData || typeof entryData !== "object") {
        setMessage({ type: "warning", text: "Could not read entry data." });
        setIsGenerating(false);
        setProgressPhase(null);
        setProgressDetail("");
        return;
      }

      const ctResponse = await fetchContentTypeSchema(config, contentTypeUid);
      const fetchedSchema = ctResponse?.content_type?.schema ?? [];
      const title = ctResponse?.content_type?.title ?? contentTypeUid;
      const globalFields = normalizeGlobalFieldSchemas(ctResponse?.global_fields);

      // —— Step 1: Build the full list of slots (one per field to generate) ——
      const existingSlots = buildGeneratableSlots(fetchedSchema, entryData as Record<string, unknown>, globalFields);
      const newBlockSlots: typeof existingSlots = [];
      if (selectedBlockTypes.size > 0) {
        const existingBlockCounts = countExistingBlocks(entryData as Record<string, unknown>, fetchedSchema);
        for (const blockTypeUid of selectedBlockTypes) {
          const [fieldUid, typeUid] = blockTypeUid.split(".");
          const nextIndex = existingBlockCounts[fieldUid] ?? 0;
          const slots = buildSlotsForBlockType(fetchedSchema, fieldUid, typeUid, nextIndex, globalFields);
          newBlockSlots.push(...slots);
          existingBlockCounts[fieldUid] = nextIndex + 1;
        }
      }
      const allSlots = [...existingSlots, ...newBlockSlots];

      if (allSlots.length === 0) {
        setMessage({
          type: "warning",
          text: "No generatable fields found. Add blocks in the editor or select block types above, then try again.",
        });
        setIsGenerating(false);
        setProgressPhase(null);
        setProgressDetail("");
        return;
      }

      // —— Step 2: Call OpenAI; get flat key → value for each slot ——
      setProgressPhase("generating");
      setProgressDetail(`Generating content for ${allSlots.length} fields...`);
      let cycleIndex = -1;
      simulateInterval = setInterval(() => {
        cycleIndex = (cycleIndex + 1) % allSlots.length;
        setProgressDetail(`Generating ${allSlots[cycleIndex].display_name}...`);
      }, 800);
      const effectiveTopic = topic.trim() || getRandomDemoTopic();
      const flatGenerated = await generateEntryContent(
        effectiveTopic,
        allSlots,
        title,
        config.openaiApiKey!,
        config.openaiOrgId
      );
      if (simulateInterval) {
        clearInterval(simulateInterval);
        simulateInterval = null;
      }

      // —— Step 3: Apply to entry (scalars: setData(value); blocks: setData(array of field-only wrappers)) ——
      setProgressPhase("applying");
      setProgressDetail("Applying to entry...");
      await applyGeneratedToEntry(
        entry,
        allSlots,
        flatGenerated,
        (fieldKey: string, index: number, total: number) => {
          setProgressDetail(`Applying ${fieldKey}... (${index + 1} of ${total})`);
        },
        entryData as Record<string, unknown>
      );
      setMessage({
        type: "success",
        text: "Content generated. Save the entry to persist.",
      });
    } catch (e) {
      setMessage({
        type: "warning",
        text: e instanceof Error ? e.message : "Failed to generate content.",
      });
    } finally {
      if (simulateInterval) clearInterval(simulateInterval);
      setIsGenerating(false);
      setProgressPhase(null);
      setProgressDetail("");
    }
  };

  if (!sdk) {
    return (
      <div className="sidebar-ai-gen">
        <p className="sidebar-ai-gen-loading">Loading...</p>
      </div>
    );  
  }

  const hasOpenAiKey = !!(config?.openaiApiKey?.trim());
  const canGenerate = hasOpenAiKey && !!contentTypeUid;

  return (
    <div className="sidebar-ai-gen">
      <h3 className="sidebar-ai-gen-title">Auto-generate entry</h3>
      <p className="sidebar-ai-gen-desc">
        Generate on-topic content for all fields using AI. Leave topic empty for a random demo topic.
      </p>
      {!hasOpenAiKey && (
        <Info
          content="Configure OpenAI API key in App Configuration to use auto-generate."
          type="warning"
          icon={<Icon icon="InfoCircleWhite" />}
          style={{ marginBottom: 12 }}
        />
      )}
      <div className="sidebar-ai-gen-topic-wrap">
        <label htmlFor="sidebar-ai-gen-topic" className="sidebar-ai-gen-topic-label">
          Topic
        </label>
        <input
          id="sidebar-ai-gen-topic"
          type="text"
          className="sidebar-ai-gen-topic-input"
          placeholder="e.g. Japanese tea ceremony"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={!canGenerate}
        />
      </div>
      {availableBlockTypes.length > 0 && (
        <div className="sidebar-ai-gen-blocks">
          <p className="sidebar-ai-gen-blocks-label">Generate new blocks:</p>
          <div className="sidebar-ai-gen-blocks-list">
            {availableBlockTypes.map((block) => (
              <label key={block.uid} className="sidebar-ai-gen-block-option">
                <input
                  type="checkbox"
                  checked={selectedBlockTypes.has(block.uid)}
                  onChange={(e) => {
                    const newSet = new Set(selectedBlockTypes);
                    if (e.target.checked) {
                      newSet.add(block.uid);
                    } else {
                      newSet.delete(block.uid);
                    }
                    setSelectedBlockTypes(newSet);
                  }}
                  disabled={!canGenerate || isGenerating}
                />
                <span className="sidebar-ai-gen-block-title">{block.title}</span>
                <span className="sidebar-ai-gen-block-count">({block.fieldCount} fields)</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="sidebar-ai-gen-actions">
        <Button
          onClick={handleGenerate}
          disabled={!canGenerate || isGenerating}
          isLoading={isGenerating}
          buttonType="primary"
        >
          Generate with AI
        </Button>
      </div>
      {isGenerating && (progressPhase ?? progressDetail) && (
        <div className="sidebar-ai-gen-progress">
          {progressPhase && (
            <span className="sidebar-ai-gen-progress-phase">
              {progressPhase === "schema" && "Fetching schema"}
              {progressPhase === "generating" && "Generating"}
              {progressPhase === "applying" && "Applying"}
            </span>
          )}
          {progressDetail && (
            <p className="sidebar-ai-gen-progress-detail">{progressDetail}</p>
          )}
        </div>
      )}
      {message && (
        <div className="sidebar-ai-gen-message">
          <Info
            content={message.text}
            type={message.type === "success" ? "success" : "warning"}
            dismissable
            icon={<Icon icon="InfoCircleWhite" />}
          />
        </div>
      )}
    </div>
  );
};

export default SidebarWidgetAiGen;
