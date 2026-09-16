/**
 * ParentUrlField — a Contentstack Custom Field that builds an entry's URL from
 * a referenced parent, an optional taxonomy term, and the title:
 *
 *     /{parent-url}/{taxonomy-term}/{title-slug}
 *
 * Everything is resolved in the entry's current locale: the parent entry is
 * fetched in that locale (falling back to master), and because taxonomy values
 * are non-localizable, the term itself is fetched in-locale to get its localized
 * name. The URL is rebuilt from these sources on every change, so it is
 * idempotent — renaming, re-tagging, or re-parenting just swaps one segment.
 *
 * Setup on the content type: a URL field, a reference field to the parent, an
 * optional taxonomy field, the title field, and this custom field. The field
 * UIDs below can be overridden per instance via the field's "config" JSON:
 *
 *     {
 *       "referenceFieldUid": "parent",
 *       "urlFieldUid": "url",
 *       "parentSlugFieldUid": "url",
 *       "taxonomyFieldUid": "taxonomies",
 *       "taxonomyUid": "",
 *       "titleFieldUid": "title"
 *     }
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ContentstackAppSDK from "@contentstack/app-sdk";
import { client } from "@contentstack/management";
import { Button } from "@contentstack/venus-components";
import "@contentstack/venus-components/build/main.css";

const DEFAULTS = {
  referenceFieldUid: "parent",
  urlFieldUid: "url",
  parentSlugFieldUid: "url",
  taxonomyFieldUid: "taxonomies",
  taxonomyUid: "",
  titleFieldUid: "title",
};

type FieldConfig = Partial<typeof DEFAULTS>;
type ReferenceItem = { uid: string; _content_type_uid: string };
type TaxonomyItem = { taxonomy_uid?: string; term_uid?: string };
type TermRef = { taxonomy_uid: string; term_uid: string };
type EntryData = Record<string, unknown>;

type UrlBreakdown = {
  locale: string;
  parentUrl: string | null;
  parentLocaleUsed: string;
  taxonomyTerm: string;
  titleSlug: string;
  currentUrl: string;
  composedUrl: string;
};

const EMPTY_BREAKDOWN: UrlBreakdown = {
  locale: "",
  parentUrl: null,
  parentLocaleUsed: "",
  taxonomyTerm: "",
  titleSlug: "",
  currentUrl: "",
  composedUrl: "",
};

function segmentsOf(path: string): string[] {
  return (path ?? "").split("/").filter(Boolean);
}

function slugify(text: string): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritical marks (NFD)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function composeUrl(parentUrl: string, taxonomyTerm: string, titleSlug: string): string {
  const segments = [...segmentsOf(parentUrl), taxonomyTerm, titleSlug].filter(Boolean);
  return "/" + segments.join("/");
}

function firstReference(value: unknown): ReferenceItem | null {
  if (!Array.isArray(value)) return null;
  const item = value[0] as Partial<ReferenceItem> | undefined;
  if (item?.uid && item?._content_type_uid) {
    return { uid: item.uid, _content_type_uid: item._content_type_uid };
  }
  return null;
}

function firstTerm(value: unknown, taxonomyUid: string): TermRef | null {
  if (!Array.isArray(value)) return null;
  const items = value as TaxonomyItem[];
  const match = taxonomyUid
    ? items.find((t) => t?.taxonomy_uid === taxonomyUid && t?.term_uid)
    : items.find((t) => t?.taxonomy_uid && t?.term_uid);
  return match?.taxonomy_uid && match?.term_uid
    ? { taxonomy_uid: match.taxonomy_uid, term_uid: match.term_uid }
    : null;
}

const ParentUrlField: React.FC = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customFieldRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stackRef = useRef<any>(null);
  const configRef = useRef<typeof DEFAULTS>(DEFAULTS);

  // The last value we wrote, so the onChange it triggers doesn't write again.
  const lastWrittenRef = useRef<string | null>(null);

  const [autoSync, setAutoSync] = useState(true);
  const autoSyncRef = useRef(autoSync);
  autoSyncRef.current = autoSync;

  const [breakdown, setBreakdown] = useState<UrlBreakdown>(EMPTY_BREAKDOWN);
  const [status, setStatus] = useState<string>("Initializing…");
  const [error, setError] = useState<string>("");

  const needsApply = useMemo(
    () => breakdown.composedUrl !== "" && breakdown.composedUrl !== breakdown.currentUrl,
    [breakdown.composedUrl, breakdown.currentUrl]
  );

  const writeUrlField = useCallback((composedUrl: string, currentUrl: string) => {
    const customField = customFieldRef.current;
    if (!customField || !composedUrl) return;
    if (composedUrl === lastWrittenRef.current) return;

    if (composedUrl === currentUrl) {
      setStatus(
        `Composed URL already matches the URL field — the parent URL is empty ` +
          `or not stored in "${configRef.current.parentSlugFieldUid}".`
      );
      return;
    }

    try {
      customField.entry.getField(configRef.current.urlFieldUid).setData(composedUrl);
      lastWrittenRef.current = composedUrl;
      setStatus(`URL set to ${composedUrl}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus(`Could not write to the "${configRef.current.urlFieldUid}" field — does it exist?`);
    }
  }, []);

  const fetchParentUrl = useCallback(async (reference: ReferenceItem, locale: string): Promise<string> => {
    const parentEntry = await stackRef.current
      .contentType(reference._content_type_uid)
      .entry(reference.uid)
      .fetch(locale ? { locale } : {});

    return (parentEntry?.[configRef.current.parentSlugFieldUid] as string) ?? "";
  }, []);

  const resolveTaxonomyTerm = useCallback(async (entryData: EntryData, locale: string): Promise<string> => {
    const { taxonomyFieldUid, taxonomyUid } = configRef.current;
    const term = firstTerm(entryData[taxonomyFieldUid], taxonomyUid);
    if (!term) return "";

    try {
      const localizedTerm = await stackRef.current
        .taxonomy(term.taxonomy_uid)
        .terms(term.term_uid)
        .fetch(locale ? { locale } : {});
      const name = (localizedTerm?.name as string) ?? "";
      return slugify(name) || slugify(term.term_uid);
    } catch (e) {
      console.warn("[ParentUrlField] could not fetch localized term, using term_uid:", e);
      return slugify(term.term_uid);
    }
  }, []);

  const recompute = useCallback(
    async (entryData: EntryData) => {
      setError("");
      const { referenceFieldUid, urlFieldUid, parentSlugFieldUid, titleFieldUid } = configRef.current;

      const locale =
        (customFieldRef.current?.entry?.locale as string) || ((entryData.locale as string) ?? "");
      const currentUrl = (entryData[urlFieldUid] as string) ?? "";
      const titleSlug = slugify((entryData[titleFieldUid] as string) ?? "");
      const taxonomyTerm = await resolveTaxonomyTerm(entryData, locale);

      const reference = firstReference(entryData[referenceFieldUid]);
      if (!reference) {
        const composedUrl = taxonomyTerm || titleSlug ? composeUrl("", taxonomyTerm, titleSlug) : "";
        setBreakdown({
          locale,
          parentUrl: null,
          parentLocaleUsed: "",
          taxonomyTerm,
          titleSlug,
          currentUrl,
          composedUrl,
        });
        setStatus(`No "${referenceFieldUid}" reference set — nothing to prefix.`);
        return;
      }

      try {
        let parentUrl = await fetchParentUrl(reference, locale);
        let parentLocaleUsed = locale || "master";
        if (!parentUrl && locale) {
          parentUrl = await fetchParentUrl(reference, "");
          if (parentUrl) parentLocaleUsed = "master (fallback)";
        }

        const composedUrl = composeUrl(parentUrl, taxonomyTerm, titleSlug);
        setBreakdown({ locale, parentUrl, parentLocaleUsed, taxonomyTerm, titleSlug, currentUrl, composedUrl });
        setStatus(
          parentUrl
            ? `Parent URL (${parentLocaleUsed}): ${parentUrl}`
            : `Parent entry has no "${parentSlugFieldUid}" value to prefix.`
        );

        if (autoSyncRef.current) writeUrlField(composedUrl, currentUrl);
      } catch (e) {
        const composedUrl = taxonomyTerm || titleSlug ? composeUrl("", taxonomyTerm, titleSlug) : "";
        setBreakdown({
          locale,
          parentUrl: null,
          parentLocaleUsed: "",
          taxonomyTerm,
          titleSlug,
          currentUrl,
          composedUrl,
        });
        setError(e instanceof Error ? e.message : String(e));
        setStatus(`Could not load the parent entry (${reference._content_type_uid}/${reference.uid}).`);
      }
    },
    [fetchParentUrl, resolveTaxonomyTerm, writeUrlField]
  );

  useEffect(() => {
    let cancelled = false;

    ContentstackAppSDK.init().then((sdk) => {
      if (cancelled) return;

      const customField = sdk.location?.CustomField;
      if (!customField) {
        setStatus("This location is not a Custom Field.");
        return;
      }
      customFieldRef.current = customField;
      customField.frame.enableAutoResizing();

      configRef.current = { ...DEFAULTS, ...((customField.fieldConfig ?? {}) as FieldConfig) };

      stackRef.current = client({
        adapter: sdk.createAdapter(),
        host: sdk.endpoints.CMA,
      }).stack({ api_key: sdk.ids.apiKey });

      recompute(customField.entry.getData() as EntryData);
      customField.entry.onChange((data: EntryData) => {
        if (!cancelled) recompute(data);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [recompute]);

  const label = { color: "#647696" };
  const value = { margin: 0 };

  return (
    <div style={{ fontFamily: "Inter, sans-serif", fontSize: 14 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={autoSync}
          onChange={(e) => {
            setAutoSync(e.target.checked);
            if (e.target.checked) writeUrlField(breakdown.composedUrl, breakdown.currentUrl);
          }}
        />
        Auto-build the URL from parent, taxonomy, and title (uncheck to edit it manually)
      </label>

      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}>
        <dt style={label}>Locale</dt>
        <dd style={value}>{breakdown.locale || "—"}</dd>

        <dt style={label}>Parent URL</dt>
        <dd style={value}>
          {breakdown.parentUrl !== null ? breakdown.parentUrl || "(empty)" : "—"}
          {breakdown.parentLocaleUsed && breakdown.parentUrl ? (
            <span style={label}> ({breakdown.parentLocaleUsed})</span>
          ) : null}
        </dd>

        <dt style={label}>Taxonomy term</dt>
        <dd style={value}>{breakdown.taxonomyTerm || "—"}</dd>

        <dt style={label}>Title slug</dt>
        <dd style={value}>{breakdown.titleSlug || "—"}</dd>

        <dt style={label}>Current URL</dt>
        <dd style={value}>{breakdown.currentUrl || "(empty)"}</dd>

        <dt style={label}>Composed URL</dt>
        <dd style={{ margin: 0, fontWeight: 600 }}>{breakdown.composedUrl || "—"}</dd>
      </dl>

      {!autoSync && (
        <div style={{ marginTop: 12 }}>
          <Button
            buttonType="primary"
            disabled={!needsApply}
            onClick={() => writeUrlField(breakdown.composedUrl, breakdown.currentUrl)}
          >
            Apply to URL field
          </Button>
        </div>
      )}

      <p style={{ marginTop: 12, ...label }}>{status}</p>
      {error && <p style={{ marginTop: 4, color: "#c0392b" }}>Error: {error}</p>}
    </div>
  );
};

export default ParentUrlField;
