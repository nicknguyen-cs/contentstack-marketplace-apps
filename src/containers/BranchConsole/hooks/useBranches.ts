import { useCallback, useEffect, useRef, useState } from "react";
import { useBranchCmaApi } from "../../../common/hooks/useBranchCmaApi";
import { friendlyApiError, listBranches } from "../api";
import { Branch } from "../types";

export const useBranches = () => {
  const { callBranchApi: callCmaApi, isBranchApiReady } = useBranchCmaApi();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards against a slow earlier request overwriting a newer result.
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    if (!isBranchApiReady) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const result = await listBranches(callCmaApi);
      if (seq !== requestSeq.current) return;
      setBranches(result);
    } catch (err: unknown) {
      if (seq !== requestSeq.current) return;
      setError(friendlyApiError(err, "Failed to load branches"));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [callCmaApi, isBranchApiReady]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { branches, loading, error, refresh } as const;
};
