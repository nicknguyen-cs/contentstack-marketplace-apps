import { useMemo } from "react";
import { BranchDetail } from "@contentstack/app-sdk/dist/src/types/stack.types";
import { useAppSdk } from "./useAppSdk";

/**
 * useCurrentBranch
 *
 * Returns the current Contentstack branch the app is loaded on.
 *
 * Reads synchronously from the data passed in at SDK init (no API call).
 * Returns `null` when the SDK is not ready or branches are not enabled on
 * the stack.
 *
 * @returns Object with the current branch uid, the full branch detail, and
 * whether branches are enabled on the stack.
 *
 * @example
 * const { branchUid, branch, branchesEnabled } = useCurrentBranch();
 * // branchUid === "main"
 */
export const useCurrentBranch = () => {
  const appSdk = useAppSdk();

  return useMemo(() => {
    const branchesEnabled = !!appSdk?.stack?.getData()?.settings?.branches;
    const branch: BranchDetail | null =
      appSdk?.stack?.getCurrentBranch?.() ?? null;

    return {
      branchUid: branch?.uid ?? null,
      branch,
      branchesEnabled,
    } as const;
  }, [appSdk]);
};
