import React, { useEffect, useState } from "react";
import ContentstackAppSDK from "@contentstack/app-sdk";
import { Button, Info, Icon } from "@contentstack/venus-components";
import "@contentstack/venus-components/build/main.css";
import {
  uploadDraftToAsset,
  findDraftAsset,
  getDraftAssetFileContent,
  applyDraftToEntryViaSdk,
} from "./services";
import { DraftConfig, DraftAssetMeta } from "./types";
import "./EntrySidebar.css";

function formatDraftSavedAt(isoString: string | undefined): string {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

const EntryDraftSidebar: React.FC = () => {
  const [sdk, setSdk] = useState<any>(null);
  const [config, setConfig] = useState<DraftConfig | null>(null);
  const [draftMeta, setDraftMeta] = useState<DraftAssetMeta | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "warning"; text: string } | null>(null);
  const [contentTypeUid, setContentTypeUid] = useState<string>("");
  const [entryUid, setEntryUid] = useState<string>("");
  const [locale, setLocale] = useState<string>("en-us");

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
        const configObj = (appConfig as Record<string, unknown> | undefined)?.configuration as Record<string, unknown> | undefined;
        // Read canonical keys with one-time fallback for old installs (stackApiKey, managementToken)
         const cfg: DraftConfig = {
          apiKey: (configObj?.apiKey ?? configObj?.stackApiKey ?? appConfigObj?.apiKey ?? appConfigObj?.stackApiKey) as string | undefined,
          authorization: (configObj?.authorization ?? configObj?.managementToken ?? appConfigObj?.authorization ?? appConfigObj?.managementToken) as string | undefined,
          baseUrl: (configObj?.baseUrl ?? configObj?.apiUrl ?? appConfigObj?.baseUrl ?? appConfigObj?.apiUrl) as string | undefined,
          };
        setConfig(cfg);

        const sidebar = sdkInstance?.location?.SidebarWidget;
        const entry = sidebar?.entry;
        if (entry) {
          const data = entry._data ?? (await entry.getData?.());
          const ct = entry.content_type?.uid ?? data?.content_type;
          const uid = entry._data.uid ?? data?.uid;
          const loc = entry.locale ?? data?.locale ?? "en-us";
          if (ct && uid) {
            setContentTypeUid(ct);
            setEntryUid(uid);
            setLocale(loc || "en-us");
            if (cfg.apiKey && cfg.authorization) {
              const meta = await findDraftAsset(cfg, ct, uid, loc || "en-us");
              if (!cancelled) setDraftMeta(meta ?? null);
            }
          }
        }
      } catch (e) {
        if (!cancelled) setMessage({ type: "warning", text: "Failed to initialize: " + (e instanceof Error ? e.message : "Unknown error") });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSaveAsDraft = async () => {
    if (!sdk || !config || !contentTypeUid || !entryUid) {
      setMessage({ type: "warning", text: "Entry context not available." });
      return;
    }
    const entry = sdk?.location?.SidebarWidget?.entry;
    if (!entry) {
      setMessage({ type: "warning", text: "Entry not found." });
      return;
    }
    setIsSaving(true);
    setMessage(null);
    try {
      const entryData = await entry.getDraftData?.() ?? entry.getData();
      await uploadDraftToAsset(config, contentTypeUid, entryUid, locale, entryData as Record<string, unknown>);
      const meta = await findDraftAsset(config, contentTypeUid, entryUid, locale);
      setDraftMeta(meta ?? null);
      setMessage({ type: "success", text: "Draft saved to Assets. No entry version created." });
    } catch (e) {
      setMessage({ type: "warning", text: e instanceof Error ? e.message : "Failed to save draft." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadDraft = async () => {
    if (!sdk || !config || !contentTypeUid || !entryUid) {
      setMessage({ type: "warning", text: "Entry context not available." });
      return;
    }
    setIsLoading(true);
    setMessage(null);
    try {
      const asset = await findDraftAsset(config, contentTypeUid, entryUid, locale);
      if (!asset) {
        setMessage({ type: "warning", text: "No draft found for this entry and locale." });
        setIsLoading(false);
        return;
      }
      const draftData = await getDraftAssetFileContent(config, asset.uid);
      console.log("draftData", draftData);
      await applyDraftToEntryViaSdk(sdk, draftData);
      setMessage({ type: "success", text: "Draft loaded into the form. Save the entry to persist changes." });
    } catch (e) {
      setMessage({ type: "warning", text: e instanceof Error ? e.message : "Failed to load draft." });
    } finally {
      setIsLoading(false);
    }
  };

  if (!sdk) {
    return (
      <div className="entry-draft-sidebar">
        <p className="entry-draft-sidebar-loading">Loading...</p>
      </div>
    );
  }

  const hasCreds = !!(config?.apiKey && config?.authorization);

  return (
    <div className="entry-draft-sidebar">
      <h3 className="entry-draft-sidebar-title">Entry Draft (no version)</h3>
      <p className="entry-draft-sidebar-desc">
        Save current state (including unsaved changes) to an asset. Load it back into the form; save the entry to persist.
      </p>
      {!hasCreds && (
        <Info
          content="Configure the app with Stack API Key and Management Token (App Configuration) to use draft save/load."
          type="warning"
          icon={<Icon icon="InfoCircleWhite" />}
          style={{ marginBottom: 12 }}
        />
      )}
      <div className="entry-draft-sidebar-status-wrap">
        {draftMeta ? (
          <div className="entry-draft-sidebar-status">
            <div className="entry-draft-sidebar-status-head">
              <Icon icon="CheckedGreen" size="small" />
              <span className="entry-draft-sidebar-status-label">Draft saved</span>
            </div>
            <p className="entry-draft-sidebar-status-time">
              Last saved: {formatDraftSavedAt(draftMeta.updated_at)}
            </p>
          </div>
        ) : (
          <p className="entry-draft-sidebar-empty">No draft saved yet</p>
        )}
      </div>
      <div className="entry-draft-sidebar-actions">
        <Button
          onClick={handleSaveAsDraft}
          disabled={!hasCreds || isSaving || isLoading}
          isLoading={isSaving}
          buttonType="secondary"
        >
          Save as draft
        </Button>
        <Button
          onClick={handleLoadDraft}
          disabled={!hasCreds || isSaving || isLoading || !draftMeta}
          isLoading={isLoading}
          buttonType="primary"
        >
          Load draft
        </Button>
      </div>
      {message && (
        <Info
          content={message.text}
          type={message.type === "success" ? "success" : "warning"}
          dismissable
          icon={<Icon icon="InfoCircleWhite" />}
          style={{ marginTop: 12 }}
        />
      )}
    </div>
  );
};

export default EntryDraftSidebar;
