export interface RegionOption {
  label: string;
  value: string;
  apiUrl: string;
}

export interface FieldErrors {
  stackApiKey: string;
  managementToken: string;
  deliveryToken: string;
  customApiUrl: string;
}

export interface FieldValidity {
  stackApiKey: boolean;
  managementToken: boolean;
  deliveryToken: boolean;
  region: boolean;
  customApiUrl: boolean;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  timestamp: Date;
}
