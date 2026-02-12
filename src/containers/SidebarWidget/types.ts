export interface DraftConfig {
  apiKey?: string;
  authorization?: string;
  baseUrl?: string;
  [key: string]: unknown;
}
export interface DraftAssetMeta {
  uid: string;
  title?: string;
  filename?: string;
  url?: string;
  updated_at?: string;
  created_at?: string;
  [key: string]: unknown;
}
