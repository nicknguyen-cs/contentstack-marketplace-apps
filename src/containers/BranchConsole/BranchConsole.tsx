import React, { useCallback, useMemo, useState } from "react";
import styles from "./BranchConsole.module.css";
import { useBranchCmaApi } from "../../common/hooks/useBranchCmaApi";
import { useCurrentBranch } from "../../common/hooks/useCurrentBranch";
import { fetchSchemaSnapshot, friendlyApiError, mergeBranches } from "./api";
import { useBranches } from "./hooks/useBranches";
import { useBranchCompare } from "./hooks/useBranchCompare";
import { useMergeJobs } from "./hooks/useMergeJobs";
import BranchPicker from "./components/BranchPicker";
import CompareView from "./components/CompareView";
import MergeWizard, { MergeMode } from "./components/MergeWizard";
import MergeJobList from "./components/MergeJobList";
import RevertPanel from "./components/RevertPanel";
import { MergeParams, MergeStrategy, compareItemKey } from "./types";

type Tab = "merge" | "jobs" | "revert";

interface Banner {
  kind: "success" | "error";
  text: string;
}

/**
 * Branch Console — full-page app for branch operations the Contentstack web
 * UI doesn't offer: compare, merge, cherry-pick, and revert (schema only —
 * content types and global fields, which is the scope of the CMA merge API).
 */
const BranchConsole: React.FC = () => {
  const { callBranchApi: callCmaApi, callTokenApi, isApiReady, hasManagementToken, diagnostics } =
    useBranchCmaApi();
  const { branchUid, branchesEnabled } = useCurrentBranch();

  const [tab, setTab] = useState<Tab>("merge");
  const [banner, setBanner] = useState<Banner | null>(null);

  // Merge tab state
  const [compareBranch, setCompareBranch] = useState("");
  const [baseBranch, setBaseBranch] = useState("");
  const [mode, setMode] = useState<MergeMode>("all");
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set());
  const [merging, setMerging] = useState(false);

  const branchesState = useBranches();
  const compareState = useBranchCompare(baseBranch, compareBranch);
  const jobsState = useMergeJobs();

  const selectedItems = useMemo(
    () => compareState.items.filter((i) => selectedKeys.has(compareItemKey(i))),
    [compareState.items, selectedKeys]
  );

  const toggleItem = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (selectAll: boolean) => {
      setSelectedKeys(selectAll ? new Set(compareState.items.map(compareItemKey)) : new Set());
    },
    [compareState.items]
  );

  const swapDirection = useCallback(() => {
    setBaseBranch(compareBranch);
    setCompareBranch(baseBranch);
    setSelectedKeys(new Set());
  }, [baseBranch, compareBranch]);

  const runMerge = useCallback(
    async (params: MergeParams, successText: string) => {
      setMerging(true);
      setBanner(null);
      try {
        const { jobUid } = await mergeBranches(callCmaApi, params);
        setBanner({ kind: "success", text: successText });
        setSelectedKeys(new Set());
        setTab("jobs");
        jobsState.watchJob(jobUid);
        void branchesState.refresh(); // pick up the auto-created backup branch
      } catch (err: unknown) {
        setBanner({ kind: "error", text: friendlyApiError(err, "Merge failed to start") });
      } finally {
        setMerging(false);
      }
    },
    [callCmaApi, jobsState, branchesState]
  );

  const handleMerge = useCallback(
    (options: {
      strategy: MergeStrategy;
      itemStrategy: MergeStrategy;
      comment: string;
      createRevertBranch: boolean;
    }) => {
      const cherryPick = mode === "cherry_pick";
      const params: MergeParams = {
        base_branch: baseBranch,
        compare_branch: compareBranch,
        default_merge_strategy: cherryPick ? "ignore" : options.strategy,
        merge_comment:
          options.comment ||
          `Branch Console: merge ${compareBranch} into ${baseBranch}${cherryPick ? " (cherry-pick)" : ""}`,
        ...(options.createRevertBranch ? {} : { no_revert: true }),
        ...(cherryPick
          ? {
              item_merge_strategies: selectedItems.map((item) => ({
                uid: item.uid,
                type: item.type,
                merge_strategy: options.itemStrategy,
              })),
            }
          : {}),
      };
      void runMerge(
        params,
        `Merge of ${compareBranch} into ${baseBranch} started — watch its progress below.`
      );
    },
    [mode, baseBranch, compareBranch, selectedItems, runMerge]
  );

  const handleDownloadSnapshot = useCallback(async () => {
    if (!baseBranch) return;
    try {
      const snapshot = await fetchSchemaSnapshot(callTokenApi, baseBranch);
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `schema-snapshot-${baseBranch}-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setBanner({
        kind: "success",
        text: `Schema snapshot of ${baseBranch} downloaded (${snapshot.content_types.length} content types, ${snapshot.global_fields.length} global fields).`,
      });
    } catch (err: unknown) {
      setBanner({ kind: "error", text: friendlyApiError(err, "Failed to export schema snapshot") });
    }
  }, [baseBranch, callTokenApi]);

  const handleRevert = useCallback(
    (backup: string, target: string) => {
      const params: MergeParams = {
        base_branch: target,
        compare_branch: backup,
        default_merge_strategy: "overwrite_with_compare",
        merge_comment: `Branch Console: revert ${target} to backup ${backup}`,
      };
      void runMerge(params, `Revert of ${target} from ${backup} started — watch its progress below.`);
    },
    [runMerge]
  );

  if (!isApiReady) {
    return (
      <div className={styles.shell}>
        <div className={styles.empty}>
          <h3>Loading…</h3>
          <p>Waiting for the Contentstack App SDK.</p>
        </div>
      </div>
    );
  }

  if (!branchesEnabled) {
    return (
      <div className={styles.shell}>
        <div className={styles.empty}>
          <h3>Branches are not enabled</h3>
          <p>
            This stack does not have the Branches feature enabled (it is plan-gated). Once branches
            are enabled, the Branch Console lets you compare, merge, cherry-pick, and revert them
            from the UI.
          </p>
        </div>
      </div>
    );
  }

  if (!hasManagementToken) {
    return (
      <div className={styles.shell}>
        <div className={styles.empty}>
          <h3>Management token required</h3>
          <p>
            Contentstack&apos;s branch merge APIs are not reachable through the app permission
            system — they require a management token. Open this app&apos;s configuration (Stack
            Settings → Apps → this app → Configure), enter the Stack API Key and a Management
            Token for this stack, and save. The token is stored in the app configuration and is
            visible to users who can access this app — use a token scoped to this stack only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <div className={styles.header}>
        <div>
          <h2>Branch Console</h2>
          <p className={styles.headerSub}>
            Compare, merge, cherry-pick, and revert branches — no CLI needed. Currently viewing
            branch <span className={styles.mono}>{branchUid ?? "main"}</span>.
          </p>
        </div>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === "merge" ? styles.tabActive : ""}`}
          onClick={() => setTab("merge")}
        >
          Merge
        </button>
        <button
          className={`${styles.tab} ${tab === "jobs" ? styles.tabActive : ""}`}
          onClick={() => setTab("jobs")}
        >
          Jobs
        </button>
        <button
          className={`${styles.tab} ${tab === "revert" ? styles.tabActive : ""}`}
          onClick={() => setTab("revert")}
        >
          Revert
        </button>
        <button className={`${styles.tab} ${styles.tabDisabled}`} disabled>
          Entry Sync<span className={styles.chip}>Phase 2</span>
        </button>
      </div>

      {banner && (
        <div
          className={`${styles.banner} ${
            banner.kind === "success" ? styles.bannerSuccess : styles.bannerError
          }`}
        >
          <span>{banner.text}</span>
          <button className={styles.bannerClose} onClick={() => setBanner(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      {branchesState.error && (
        <div className={`${styles.banner} ${styles.bannerError}`}>
          <span>
            {branchesState.error}
            <span className={styles.mono} style={{ display: "block", marginTop: 4, fontSize: 11 }}>
              Requests target {diagnostics.baseUrl} · api_key {diagnostics.apiKeyMasked} · token{" "}
              {diagnostics.tokenMasked}
            </span>
          </span>
        </div>
      )}

      {tab === "merge" && (
        <>
          <div className={styles.card}>
            <h4 className={styles.cardTitle}>Branches</h4>
            <BranchPicker
              branches={branchesState.branches}
              compare={compareBranch}
              base={baseBranch}
              onCompareChange={(uid) => {
                setCompareBranch(uid);
                setSelectedKeys(new Set());
              }}
              onBaseChange={(uid) => {
                setBaseBranch(uid);
                setSelectedKeys(new Set());
              }}
              onSwap={swapDirection}
              disabled={branchesState.loading || merging}
            />
          </div>

          <MergeWizard
            baseBranch={baseBranch}
            compareBranch={compareBranch}
            totalChanges={compareState.items.length}
            selectedItems={selectedItems}
            mode={mode}
            onModeChange={setMode}
            merging={merging}
            onMerge={handleMerge}
            onDownloadSnapshot={handleDownloadSnapshot}
          >
            <CompareView
              items={compareState.items}
              loading={compareState.loading}
              error={compareState.error}
              baseBranch={baseBranch}
              compareBranch={compareBranch}
              cherryPick={mode === "cherry_pick"}
              selectedKeys={selectedKeys}
              onToggleItem={toggleItem}
              onToggleAll={toggleAll}
              onRefresh={() => void compareState.refresh()}
            />
          </MergeWizard>
        </>
      )}

      {tab === "jobs" && (
        <MergeJobList
          jobs={jobsState.jobs}
          loading={jobsState.loading}
          error={jobsState.error}
          polling={jobsState.polling}
          onRefresh={() => void jobsState.refresh()}
        />
      )}

      {tab === "revert" && (
        <RevertPanel
          branches={branchesState.branches}
          jobs={jobsState.jobs}
          reverting={merging}
          onRevert={handleRevert}
        />
      )}
    </div>
  );
};

export default BranchConsole;
