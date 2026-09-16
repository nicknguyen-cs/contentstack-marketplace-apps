import { useCallback, useEffect, useRef, useState } from "react";
import { useBranchCmaApi } from "../../../common/hooks/useBranchCmaApi";
import { compareBranches, friendlyApiError } from "../api";
import { CompareItem } from "../types";

/**
 * Compares two branches and aggregates all diff pages.
 * Re-runs automatically whenever the base/compare pair changes.
 */
export const useBranchCompare = (baseBranch: string, compareBranch: string) => {
  const { callBranchApi: callCmaApi, isBranchApiReady } = useBranchCmaApi();
  const [items, setItems] = useState<CompareItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards against a slow earlier request overwriting a newer result.
  const requestSeq = useRef(0);

  const canCompare =
    isBranchApiReady && !!baseBranch && !!compareBranch && baseBranch !== compareBranch;

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    if (!canCompare) {
      setItems([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await compareBranches(callCmaApi, baseBranch, compareBranch);
      if (seq !== requestSeq.current) return;
      setItems(result);
    } catch (err: unknown) {
      if (seq !== requestSeq.current) return;
      setItems([]);
      setError(friendlyApiError(err, "Failed to compare branches"));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [callCmaApi, canCompare, baseBranch, compareBranch]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, loading, error, refresh, canCompare } as const;
};
