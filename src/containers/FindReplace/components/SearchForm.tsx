import React from "react";
import styles from "../FindReplace.module.css";
import { ContentTypeSummary, LocaleSummary, SearchFormState } from "../types";

interface SearchFormProps {
  contentTypes: ContentTypeSummary[];
  locales: LocaleSummary[];
  masterLocale: string | null;
  form: SearchFormState;
  onChange: (patch: Partial<SearchFormState>) => void;
  onScan: () => void;
  scanning: boolean;
}

const SearchForm: React.FC<SearchFormProps> = ({
  contentTypes,
  locales,
  masterLocale,
  form,
  onChange,
  onScan,
  scanning,
}) => {
  const selected = new Set(form.selectedCtUids);
  const selectedLocales = new Set(form.locales);
  const canScan =
    form.term.length > 0 && form.selectedCtUids.length > 0 && form.locales.length > 0 && !scanning;

  const toggleContentType = (uid: string) => {
    const next = new Set(selected);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    onChange({ selectedCtUids: [...next] });
  };

  const toggleLocale = (code: string) => {
    const next = new Set(selectedLocales);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    // Keep the stack's locale order so scan progress and results read predictably.
    onChange({ locales: locales.map((l) => l.code).filter((c) => next.has(c)) });
  };

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Search</h3>
      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="fr-term">
            Find
          </label>
          <input
            id="fr-term"
            className={styles.input}
            value={form.term}
            onChange={(e) => onChange({ term: e.target.value })}
            placeholder="Text to find"
            disabled={scanning}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="fr-replacement">
            Replace with
          </label>
          <input
            id="fr-replacement"
            className={styles.input}
            value={form.replacement}
            onChange={(e) => onChange({ replacement: e.target.value })}
            placeholder="Replacement text (empty deletes the term)"
            disabled={scanning}
          />
        </div>
      </div>

      <div className={styles.ctHeaderRow}>
        <span className={styles.fieldLabel}>
          Locales ({form.locales.length} of {locales.length} selected)
        </span>
        <span className={styles.ctHeaderActions}>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => onChange({ locales: locales.map((l) => l.code) })}
            disabled={scanning}
          >
            All
          </button>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => onChange({ locales: masterLocale ? [masterLocale] : [] })}
            disabled={scanning}
          >
            {masterLocale ? "Master only" : "None"}
          </button>
        </span>
      </div>
      <div className={styles.ctList}>
        {locales.map((locale) => (
          <label key={locale.code} className={styles.checkboxOption}>
            <input
              type="checkbox"
              checked={selectedLocales.has(locale.code)}
              onChange={() => toggleLocale(locale.code)}
              disabled={scanning}
            />
            {locale.name} <span className={styles.mono}>({locale.code})</span>
            {locale.code === masterLocale && <span className={styles.chip}>master</span>}
          </label>
        ))}
        {locales.length === 0 && <span className={styles.muted}>No locales found.</span>}
      </div>
      {form.locales.some((c) => c !== masterLocale) && (
        <p className={styles.muted}>
          In non-master locales only entries that are actually localized there are scanned. Entries falling back
          to the master locale are skipped so the replace never localizes them by accident.
        </p>
      )}

      <div className={styles.optionsRow}>
        <label className={styles.checkboxOption}>
          <input
            type="checkbox"
            checked={form.caseSensitive}
            onChange={(e) => onChange({ caseSensitive: e.target.checked })}
            disabled={scanning}
          />
          Case sensitive
        </label>
        <label className={styles.checkboxOption}>
          <input
            type="checkbox"
            checked={form.wholeWord}
            onChange={(e) => onChange({ wholeWord: e.target.checked })}
            disabled={scanning}
          />
          Whole word only
        </label>
      </div>

      <div className={styles.ctHeaderRow}>
        <span className={styles.fieldLabel}>
          Content types ({form.selectedCtUids.length} of {contentTypes.length} selected)
        </span>
        <span className={styles.ctHeaderActions}>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => onChange({ selectedCtUids: contentTypes.map((ct) => ct.uid) })}
            disabled={scanning}
          >
            All
          </button>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => onChange({ selectedCtUids: [] })}
            disabled={scanning}
          >
            None
          </button>
        </span>
      </div>
      <div className={styles.ctList}>
        {contentTypes.map((ct) => (
          <label key={ct.uid} className={styles.checkboxOption}>
            <input
              type="checkbox"
              checked={selected.has(ct.uid)}
              onChange={() => toggleContentType(ct.uid)}
              disabled={scanning}
            />
            {ct.title} <span className={styles.mono}>({ct.uid})</span>
          </label>
        ))}
        {contentTypes.length === 0 && <span className={styles.muted}>No content types found.</span>}
      </div>

      <div className={styles.formActions}>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onScan} disabled={!canScan}>
          {scanning ? "Scanning…" : "Preview matches"}
        </button>
        <span className={styles.muted}>Scans plain text fields only. Nothing is changed until you confirm.</span>
      </div>
    </div>
  );
};

export default SearchForm;
