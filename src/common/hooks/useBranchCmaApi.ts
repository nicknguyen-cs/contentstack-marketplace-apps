import { useCallback, useMemo } from "react";
import { useAppSdk } from "./useAppSdk";
import { useAppConfig } from "./useAppConfig";
import { useAppSdkApi } from "./useApi";

/**
 * Branch endpoints (list, compare, merge, queue) are NOT reachable through the
 * App SDK proxy — the app-permission/OAuth system has no merge scope, so
 * appSdk.api always gets 403 for them. The CMA accepts a management token for
 * compare/merge/queue, so branch calls go direct with the token saved in the
 * app configuration; everything else still uses the proxy.
 */
const BRANCH_ENDPOINT_PREFIX = "/v3/stacks/branch";

export const useBranchCmaApi = () => {
  const appSdk = useAppSdk();
  const appConfig = useAppConfig();
  const { callCmaApi } = useAppSdkApi();

  const managementToken = useMemo(() => {
    const token = appConfig?.authorization ?? appConfig?.managementToken ?? appConfig?.accessToken;
    return typeof token === "string" && token.trim() ? token.trim() : null;
  }, [appConfig]);

  // The SDK's endpoints/ids are authoritative for the stack and region the app
  // is actually loaded in — the typed config values are only a fallback, so a
  // wrong region dropdown or mistyped API key can't break branch calls.
  const baseUrl = appSdk?.endpoints?.CMA || appConfig?.baseUrl?.trim() || "";
  const apiKey = appSdk?.ids?.apiKey || appConfig?.apiKey?.trim() || "";

  /**
   * Direct CMA call authenticated with the configured management token.
   * Used for all branch endpoints and for reads that need a `branch` header
   * (e.g. schema snapshots), which the proxy may not forward.
   */
  const callTokenApi = useCallback(
    async (endpoint: string, options?: RequestInit): Promise<Response> => {
      if (!appSdk) {
        throw new Error("Contentstack App SDK is not ready");
      }
      if (!managementToken) {
        throw new Error(
          "Branch API not ready: no management token in the app configuration (or it is still loading)."
        );
      }

      const method = options?.method ?? "GET";
      const response = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          api_key: apiKey,
          authorization: managementToken,
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(
          `Contentstack CMA API Error: ${response.status} ${response.statusText} (${method} ${baseUrl}${endpoint.split("?")[0]})${errorBody ? ` — ${errorBody}` : ""}`
        );
      }

      return response;
    },
    [appSdk, baseUrl, apiKey, managementToken]
  );

  const callBranchApi = useCallback(
    async (endpoint: string, options?: RequestInit): Promise<Response> => {
      if (!endpoint.startsWith(BRANCH_ENDPOINT_PREFIX)) {
        // Never fall back to the proxy for branch endpoints — it has no branch
        // scopes and would return a misleading 403.
        return callCmaApi(endpoint, options);
      }
      return callTokenApi(endpoint, options);
    },
    [callCmaApi, callTokenApi]
  );

  const mask = (value: string) =>
    value.length > 10 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value ? "•••" : "(empty)";

  return {
    callBranchApi,
    callTokenApi,
    hasManagementToken: !!managementToken,
    isApiReady: !!appSdk,
    /** True only once the SDK is up AND the management token has loaded from config. */
    isBranchApiReady: !!appSdk && !!managementToken,
    diagnostics: {
      baseUrl: baseUrl || "(unresolved)",
      apiKeyMasked: mask(apiKey),
      tokenMasked: managementToken ? mask(managementToken) : "(not set)",
    },
  } as const;
};
