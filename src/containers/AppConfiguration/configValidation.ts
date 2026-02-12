const BLT_PREFIX = "blt";
const CS_PREFIX = "cs";
const VALID_REGIONS = ["us", "eu", "azure-na"];

export function validateStackApiKey(value: string): { valid: boolean; error: string } {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return { valid: false, error: "Stack API Key is required" };
  }
  if (!trimmed.startsWith(BLT_PREFIX)) {
    return { valid: false, error: "Stack API Key should start with 'blt'" };
  }
  return { valid: true, error: "" };
}

export function validateManagementToken(value: string): { valid: boolean; error: string } {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return { valid: false, error: "Management Token is required" };
  }
  if (!trimmed.startsWith(CS_PREFIX)) {
    return { valid: false, error: "Management Token should start with 'cs'" };
  }
  return { valid: true, error: "" };
}

export function validateDeliveryToken(value: string): { valid: boolean; error: string } {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return { valid: false, error: "Delivery Token is required" };
  }
  if (!trimmed.startsWith(CS_PREFIX)) {
    return { valid: false, error: "Delivery Token should start with 'cs'" };
  }
  return { valid: true, error: "" };
}

export function validateCustomUrl(value: string, useCustomUrl: boolean): { valid: boolean; error: string } {
  if (!useCustomUrl) {
    return { valid: true, error: "" };
  }
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return { valid: false, error: "Custom API URL is required when enabled" };
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { valid: false, error: "URL must use http or https" };
    }
    return { valid: true, error: "" };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

export function validateRegion(value: string): { valid: boolean; error: string } {
  if (VALID_REGIONS.includes(value ?? "")) {
    return { valid: true, error: "" };
  }
  return { valid: false, error: "Invalid region" };
}

export function validateAllFields(
  stackApiKey: string,
  managementToken: string,
  deliveryToken: string,
  region: string,
  customApiUrl: string,
  useCustomUrl: boolean
): boolean {
  const stack = validateStackApiKey(stackApiKey);
  const mgmt = validateManagementToken(managementToken);
  const delivery = validateDeliveryToken(deliveryToken);
  const regionResult = validateRegion(region);
  const customUrl = validateCustomUrl(customApiUrl, useCustomUrl);
  return stack.valid && mgmt.valid && delivery.valid && regionResult.valid && customUrl.valid;
}
