export interface StackLocale {
  code: string;
  name: string;
  fallback_locale?: string | null;
}

/** One row from GET /entries/{uid}/locales — which locales the entry exists in. */
export interface EntryLocaleStatus {
  code: string;
  /** True when the entry has its own localized copy in this locale. */
  localized?: boolean;
  root?: boolean;
}

export interface CopyResult {
  target: string;
  source: string;
}
