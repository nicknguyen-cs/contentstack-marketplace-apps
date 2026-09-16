import { useCallback, useEffect, useRef, useState } from "react";
import { useBranchCmaApi } from "../../../common/hooks/useBranchCmaApi";
import { friendlyApiError, listMergeJobs } from "../api";
import { MergeJob, isJobInProgress } from "../types";

const POLL_INTERVAL_MS = 5000;
// Hard stop so a job stuck in a non-terminal status can't poll forever.
const MAX_POLLS = 120;

/**
 * Lists merge jobs and polls while any job is still running (or while a job
 * we just started hasn't shown up in the queue yet).
 */
export const useMergeJobs = () => {
  const { callBranchApi: callCmaApi, isBranchApiReady } = useBranchCmaApi();
  const [jobs, setJobs] = useState<MergeJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watchedJobUid, setWatchedJobUid] = useState<string | null>(null);
  const pollCount = useRef(0);
  // Guards against a slow earlier request overwriting a newer result.
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    if (!isBranchApiReady) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const result = await listMergeJobs(callCmaApi);
      if (seq !== requestSeq.current) return;
      setJobs(result);
    } catch (err: unknown) {
      if (seq !== requestSeq.current) return;
      setError(friendlyApiError(err, "Failed to load merge jobs"));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [callCmaApi, isBranchApiReady]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A freshly-started merge may not be in the queue yet — keep watching its
  // uid until it appears and reaches a terminal status.
  const watchedJob = watchedJobUid ? jobs.find((j) => j.uid === watchedJobUid) : undefined;
  const waitingOnWatched = !!watchedJobUid && (!watchedJob || isJobInProgress(watchedJob));
  const polling = jobs.some(isJobInProgress) || waitingOnWatched;

  useEffect(() => {
    if (!polling) {
      pollCount.current = 0;
      setWatchedJobUid((uid) => (uid ? null : uid));
      return;
    }
    const id = window.setInterval(() => {
      pollCount.current += 1;
      if (pollCount.current > MAX_POLLS) {
        window.clearInterval(id);
        setWatchedJobUid(null);
        return;
      }
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [polling, refresh]);

  const watchJob = useCallback(
    (jobUid: string | null) => {
      pollCount.current = 0;
      setWatchedJobUid(jobUid);
      void refresh();
    },
    [refresh]
  );

  return { jobs, loading, error, refresh, polling, watchJob } as const;
};
