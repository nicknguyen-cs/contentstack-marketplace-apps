import { useEffect, useRef, useState } from "react";
import ContentstackAppSDK from "@contentstack/app-sdk";
import {
  FieldLabel,
  TextInput,
  Select,
  Checkbox,
  Button,
} from "@contentstack/venus-components";
import "@contentstack/venus-components/build/main.css";
import {
  validateStackApiKey,
  validateManagementToken,
  validateDeliveryToken,
  validateCustomUrl,
  validateRegion,
  validateAllFields,
} from "./configValidation";
import {
  RegionOption,
  FieldErrors,
  FieldValidity,
  TestConnectionResult,
} from "./types";
import "./appConfiguration.css";

interface InstallationRef {
  setInstallationData: (installationData: {
    configuration: Record<string, unknown>;
    serverConfiguration: Record<string, unknown>;
  }) => Promise<{ [key: string]: string }>;
  getInstallationData: () => Promise<{
    configuration?: Record<string, unknown>;
    serverConfiguration?: Record<string, unknown>;
  }>;
  setValidity: (isValid: boolean, options?: { message?: string }) => void;
}

// Region options with API URLs
const REGION_OPTIONS: RegionOption[] = [
  { label: "US (North America)", value: "us", apiUrl: "https://api.contentstack.io" },
  { label: "EU (Europe)", value: "eu", apiUrl: "https://eu-api.contentstack.com" },
  {
    label: "Azure (North America)",
    value: "azure-na",
    apiUrl: "https://azure-na-api.contentstack.com",
  },
];

const AppConfigurationExtension = () => {
  const [appSdk, setAppSdk] = useState<unknown>(null);

  const installationRef = useRef<InstallationRef | null>(null);

  const [stackApiKey, setStackApiKey] = useState("");
  const [managementToken, setManagementToken] = useState("");
  const [deliveryToken, setDeliveryToken] = useState("");
  const [region, setRegion] = useState("us");
  const [customApiUrl, setCustomApiUrl] = useState("");
  const [useCustomUrl, setUseCustomUrl] = useState(false);
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiOrgId, setOpenaiOrgId] = useState("");

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({
    stackApiKey: "",
    managementToken: "",
    deliveryToken: "",
    customApiUrl: "",
  });

  const [fieldValidity, setFieldValidity] = useState<FieldValidity>({
    stackApiKey: false,
    managementToken: false,
    deliveryToken: false,
    region: true,
    customApiUrl: true,
  });

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);

  const getBaseUrl = (): string => {
    if (useCustomUrl && customApiUrl) {
      return customApiUrl.trim();
    }
    const selectedRegion = REGION_OPTIONS.find((r) => r.value === region);
    return selectedRegion?.apiUrl || "https://api.contentstack.io";
  };

  useEffect(() => {
    async function getAppConfiguration() {
      if (installationRef.current) {
        try {
          const appConfiguration = await installationRef.current.getInstallationData();
          const config = appConfiguration.configuration ?? {};
          const serverConfig = appConfiguration.serverConfiguration ?? {};
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/6637642b-38c0-49ee-814d-f674bf9ffafd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'AppConfiguration.tsx:getInstallationData', message: 'Loaded installation data', data: { configKeys: Object.keys(config), serverConfigKeys: Object.keys(serverConfig) }, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'H3,H4' }) }).catch(() => { });
          // #endregion

          // Read canonical keys with one-time fallback for old installs (stackApiKey, managementToken, openai_api_key, etc.)
          const apiKey = ((config.apiKey ?? config.stackApiKey) as string || "").trim();
          const authorizationValue = ((config.authorization ?? config.managementToken ?? config.accessToken) as string || "").trim();
          const deliveryTokenValue = (config.deliveryToken as string || "").trim();
          const regionValue = (config.region as string) || "us";
          const customApiUrlValue = (config.customApiUrl as string || "").trim();
          const useCustomUrlValue = Boolean(config.useCustomUrl);
          const openaiKey = ((serverConfig.openaiApiKey ?? serverConfig.openai_api_key) ?? (config.openaiApiKey ?? config.openai_api_key) as string) ?? "";
          const openaiOrg = ((serverConfig.openaiOrgId ?? serverConfig.openai_org_id) ?? (config.openaiOrgId ?? config.openai_org_id) as string) ?? "";

          setStackApiKey(apiKey);
          setManagementToken(authorizationValue);
          setDeliveryToken(deliveryTokenValue);
          setRegion(regionValue);
          setCustomApiUrl(customApiUrlValue);
          setUseCustomUrl(useCustomUrlValue);
          setOpenaiApiKey(typeof openaiKey === "string" ? openaiKey.trim() : "");
          setOpenaiOrgId(typeof openaiOrg === "string" ? openaiOrg.trim() : "");

          setTimeout(() => {
            validateField("stackApiKey", apiKey);
            validateField("managementToken", authorizationValue);
            validateField("deliveryToken", deliveryTokenValue);
            validateField("region", regionValue);
          }, 0);
        } catch (error) {
          console.error("Failed to load configuration:", error);
        }
      }
    }

    ContentstackAppSDK.init()
      .then((sdk: { location?: { AppConfigWidget?: { installation?: InstallationRef } } }) => {
        installationRef.current = sdk?.location?.AppConfigWidget?.installation ?? null;
        setAppSdk(sdk);
      })
      .then(() => getAppConfiguration())
      .catch((e) => {
        console.log("Contentstack App SDK: Initialization Failed", e);
      });
  }, []);

  const validateField = (fieldName: string, value: string) => {
    let result = { valid: false, error: "" };

    switch (fieldName) {
      case "stackApiKey":
        result = validateStackApiKey(value);
        break;
      case "managementToken":
        result = validateManagementToken(value);
        break;
      case "deliveryToken":
        result = validateDeliveryToken(value);
        break;
      case "customApiUrl":
        result = validateCustomUrl(value, useCustomUrl);
        break;
      case "region":
        result = validateRegion(value);
        break;
    }

    setFieldErrors((prev) => ({
      ...prev,
      [fieldName]: result.error,
    }));

    setFieldValidity((prev) => ({
      ...prev,
      [fieldName]: result.valid,
    }));

    return result.valid;
  };

  useEffect(() => {
    if (installationRef.current) {
      const isValid = validateAllFields(
        stackApiKey,
        managementToken,
        deliveryToken,
        region,
        customApiUrl,
        useCustomUrl
      );

      if (isValid) {
        const baseUrl = getBaseUrl();

        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/6637642b-38c0-49ee-814d-f674bf9ffafd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'AppConfiguration.tsx:setInstallationData', message: 'Saving installation data', data: { configurationKeys: ['stackApiKey', 'managementToken', 'deliveryToken', 'region', 'customApiUrl', 'useCustomUrl', 'baseUrl', 'apiKey', 'authorization', 'accessToken'], serverConfigKeys: ['openai_api_key', 'openai_org_id'], hasOpenaiKey: !!openaiApiKey.trim(), hasOpenaiOrg: !!openaiOrgId.trim() }, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'H3,H4' }) }).catch(() => { });
        // #endregion

        installationRef.current.setInstallationData({
          configuration: {
            apiKey: stackApiKey.trim(),
            authorization: managementToken.trim(),
            baseUrl,
            deliveryToken: deliveryToken.trim(),
            region,
            customApiUrl: useCustomUrl ? customApiUrl.trim() : "",
            useCustomUrl,
            openaiApiKey: openaiApiKey.trim(),
            openaiOrgId: openaiOrgId.trim(),
          },
          serverConfiguration: {
            openaiApiKey: openaiApiKey.trim(),
            openaiOrgId: openaiOrgId.trim(),
          },
        });

        installationRef.current.setValidity(true);
      } else {
        installationRef.current.setValidity(false, {
          message: "Please fix validation errors before saving",
        });
      }
    }
  }, [stackApiKey, managementToken, deliveryToken, region, customApiUrl, useCustomUrl, openaiApiKey, openaiOrgId]);

  const handleFieldBlur = (fieldName: string, value: string) => {
    validateField(fieldName, value);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      let baseUrl = getBaseUrl().trim();
      if (!baseUrl || !baseUrl.startsWith("http")) {
        baseUrl = "https://api.contentstack.io";
      }
      const apiKey = stackApiKey.trim();
      // Use "Get a single stack" (stack-scoped); "Get all stacks" requires user authtoken, not management token
      const response = await fetch(`${baseUrl}/v3/content_types`, {
        headers: {
          api_key: apiKey,
          authorization: managementToken.trim(),
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = (await response.json()) as { stack?: { name?: string } };
        setTestResult({
          success: true,
          message: `Connected successfully! Stack: ${apiKey || "Unknown"} `,
          timestamp: new Date(),
        });
      } else {
        const errorText = await response.text();
        setTestResult({
          success: false,
          message: `Connection failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: `Connection error: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date(),
      });
    } finally {
      setIsTesting(false);
    }
  };

  const formatTimestamp = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;

    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  };

  const regionSelectOptions = REGION_OPTIONS.map((r) => ({
    label: r.label,
    value: r.value,
  }));

  if (!appSdk) {
    return (
      <div className="config-loading">
        <p>Loading configuration...</p>
      </div>
    );
  }

  return (
    <div className="app-config">
      <div className="app-config-header">
        <h1 className="app-config-title">App Configuration</h1>
        <p className="app-config-subtitle">Configure your Contentstack credentials and OpenAI API key for the Auto-generate entry sidebar.</p>
      </div>

      <div className="config-card">
        <div className="config-card-header">
          <span className="config-card-icon">📦</span>
          <h2 className="config-card-title">Stack Configuration</h2>
        </div>

        <div className="config-form-group">
          <FieldLabel htmlFor="stackApiKey">Stack API Key *</FieldLabel>
          <TextInput
            id="stackApiKey"
            name="stackApiKey"
            type="text"
            value={stackApiKey}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStackApiKey(e.target.value)}
            onBlur={() => handleFieldBlur("stackApiKey", stackApiKey)}
            placeholder="blt..."
          />
          <span className="config-help-text">Your stack API key (starts with &apos;blt&apos;)</span>
          {fieldErrors.stackApiKey && (
            <span className="config-error-text">{fieldErrors.stackApiKey}</span>
          )}
        </div>

        <div className="config-form-group">
          <FieldLabel htmlFor="managementToken">Management Token *</FieldLabel>
          <TextInput
            id="managementToken"
            name="managementToken"
            type="password"
            value={managementToken}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setManagementToken(e.target.value)}
            onBlur={() => handleFieldBlur("managementToken", managementToken)}
            placeholder="cs..."
          />
          <span className="config-help-text">Management token for write access (starts with &apos;cs&apos;)</span>
          {fieldErrors.managementToken && (
            <span className="config-error-text">{fieldErrors.managementToken}</span>
          )}
        </div>

        <div className="config-form-group">
          <FieldLabel htmlFor="deliveryToken">Delivery Token *</FieldLabel>
          <TextInput
            id="deliveryToken"
            name="deliveryToken"
            type="password"
            value={deliveryToken}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeliveryToken(e.target.value)}
            onBlur={() => handleFieldBlur("deliveryToken", deliveryToken)}
            placeholder="cs..."
          />
          <span className="config-help-text">Delivery token for read access (starts with &apos;cs&apos;)</span>
          {fieldErrors.deliveryToken && (
            <span className="config-error-text">{fieldErrors.deliveryToken}</span>
          )}
        </div>
      </div>

      <div className="config-card">
        <div className="config-card-header">
          <span className="config-card-icon">🌍</span>
          <h2 className="config-card-title">Region & API Configuration</h2>
        </div>

        <div className="config-form-group">
          <FieldLabel htmlFor="region">Region *</FieldLabel>
          <Select
            id="region"
            options={regionSelectOptions}
            value={regionSelectOptions.find((opt) => opt.value === region)}
            onChange={(selected: { value?: string } | null) => {
              const value = selected?.value ?? "us";
              setRegion(value);
              validateField("region", value);
            }}
            placeholder="Select Region"
          />
          <span className="config-help-text">Select your Contentstack region</span>
        </div>

        <div className="custom-url-toggle">
          <Checkbox
            checked={useCustomUrl}
            label="Use custom API URL"
            onClick={() => {
              const newValue = !useCustomUrl;
              setUseCustomUrl(newValue);
              if (!newValue) {
                setFieldErrors((prev) => ({ ...prev, customApiUrl: "" }));
                setFieldValidity((prev) => ({ ...prev, customApiUrl: true }));
              } else {
                validateField("customApiUrl", customApiUrl);
              }
            }}
          />
        </div>

        {useCustomUrl && (
          <div className="config-form-group custom-url-field">
            <FieldLabel htmlFor="customApiUrl">Custom API URL</FieldLabel>
            <TextInput
              id="customApiUrl"
              name="customApiUrl"
              type="text"
              value={customApiUrl}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomApiUrl(e.target.value)}
              onBlur={() => handleFieldBlur("customApiUrl", customApiUrl)}
              placeholder="https://custom-api.example.com"
            />
            <span className="config-help-text">Override the default API endpoint</span>
            {fieldErrors.customApiUrl && (
              <span className="config-error-text">{fieldErrors.customApiUrl}</span>
            )}
          </div>
        )}
      </div>

      <div className="config-card">
        <div className="config-card-header">
          <span className="config-card-icon">🤖</span>
          <h2 className="config-card-title">OpenAI (Auto-generate entry)</h2>
        </div>
        <div className="config-form-group">
          <FieldLabel htmlFor="openaiApiKey">OpenAI API Key</FieldLabel>
          <TextInput
            id="openaiApiKey"
            name="openaiApiKey"
            type="password"
            value={openaiApiKey}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOpenaiApiKey(e.target.value)}
            placeholder="sk-..."
          />
          <span className="config-help-text">
            Required for the Auto-generate entry sidebar. Stored in server configuration. For production, consider a backend proxy.
          </span>
        </div>
        <div className="config-form-group">
          <FieldLabel htmlFor="openaiOrgId">OpenAI Organization ID (optional)</FieldLabel>
          <TextInput
            id="openaiOrgId"
            name="openaiOrgId"
            type="text"
            value={openaiOrgId}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOpenaiOrgId(e.target.value)}
            placeholder="org-..."
          />
          <span className="config-help-text">
            Only needed for org-scoped keys or to bill a specific organization. Leave blank for default.
          </span>
        </div>
      </div>

      <div className="config-card">
        <div className="validation-status-card">
          <div className="validation-status-header">
            <span>✓</span>
            <span>Validation Status</span>
          </div>
          <ul className="validation-status-list">
            <li className="validation-status-item">
              <span className={`validation-icon ${fieldValidity.stackApiKey ? "valid" : "invalid"}`}>
                {fieldValidity.stackApiKey ? "✓" : "✗"}
              </span>
              <span>
                Stack API Key: {fieldValidity.stackApiKey ? "Valid" : "Invalid"}
                {fieldErrors.stackApiKey && ` (${fieldErrors.stackApiKey})`}
              </span>
            </li>
            <li className="validation-status-item">
              <span className={`validation-icon ${fieldValidity.managementToken ? "valid" : "invalid"}`}>
                {fieldValidity.managementToken ? "✓" : "✗"}
              </span>
              <span>
                Management Token: {fieldValidity.managementToken ? "Valid" : "Invalid"}
                {fieldErrors.managementToken && ` (${fieldErrors.managementToken})`}
              </span>
            </li>
            <li className="validation-status-item">
              <span className={`validation-icon ${fieldValidity.deliveryToken ? "valid" : "invalid"}`}>
                {fieldValidity.deliveryToken ? "✓" : "✗"}
              </span>
              <span>
                Delivery Token: {fieldValidity.deliveryToken ? "Valid" : "Invalid"}
                {fieldErrors.deliveryToken && ` (${fieldErrors.deliveryToken})`}
              </span>
            </li>
            <li className="validation-status-item">
              <span className={`validation-icon ${fieldValidity.region ? "valid" : "invalid"}`}>
                {fieldValidity.region ? "✓" : "✗"}
              </span>
              <span>Region: {fieldValidity.region ? "Valid" : "Invalid"}</span>
            </li>
            {useCustomUrl && (
              <li className="validation-status-item">
                <span className={`validation-icon ${fieldValidity.customApiUrl ? "valid" : "invalid"}`}>
                  {fieldValidity.customApiUrl ? "✓" : "✗"}
                </span>
                <span>
                  Custom API URL: {fieldValidity.customApiUrl ? "Valid" : "Invalid"}
                  {fieldErrors.customApiUrl && ` (${fieldErrors.customApiUrl})`}
                </span>
              </li>
            )}
          </ul>
        </div>

        <div className="test-connection-section">
          <div className="test-connection-button-wrapper">
            <Button
              onClick={handleTestConnection}
              buttonType="secondary"
              isLoading={isTesting}
              disabled={
                isTesting ||
                !fieldValidity.stackApiKey ||
                !fieldValidity.managementToken ||
                !fieldValidity.deliveryToken ||
                !fieldValidity.region ||
                (useCustomUrl && !fieldValidity.customApiUrl)
              }
            >
              {isTesting ? "Testing Connection..." : "Test Connection"}
            </Button>
          </div>

          {testResult && (
            <div className={`test-result-banner ${testResult.success ? "success" : "error"}`}>
              <span className="test-result-icon">
                {testResult.success ? "✓" : "✗"}
              </span>
              <div className="test-result-content">
                <p className="test-result-message">{testResult.message}</p>
                {testResult.timestamp && (
                  <p className="test-result-timestamp">
                    Last tested: {formatTimestamp(testResult.timestamp)}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AppConfigurationExtension;
