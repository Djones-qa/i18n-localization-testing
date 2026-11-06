import type { Catalog } from "./i18n";

export interface Issue {
  type:
    | "missing_key"
    | "extra_key"
    | "placeholder_mismatch"
    | "missing_plural_category"
    | "unexpected_plural_category"
    | "untranslated"
    | "empty"
    | "length_overflow"
    | "bad_encoding";
  key: string;
  locale: string;
  detail?: string;
}

const forms = (v: string | Record<string, string>): string[] => (typeof v === "string" ? [v] : Object.values(v));
export const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const phSet = (v: string | Record<string, string>) => [...new Set(forms(v).flatMap(placeholders))].sort();

export interface LintOptions {
  /** locales allowed to keep identical-to-source strings (brand names, loanwords) */
  allowIdentical?: string[];
  /** maximum translated/source length ratio before flagging likely UI overflow */
  maxExpansion?: number;
}

/** Compare one locale catalog against the source-language catalog. */
export function lintCatalog(source: Catalog, target: Catalog, locale: string, o: LintOptions = {}): Issue[] {
  const issues: Issue[] = [];
  const allowIdentical = new Set(o.allowIdentical ?? []);
  const maxExpansion = o.maxExpansion ?? 2.5;
  const need = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;

  for (const key of Object.keys(source)) {
    const t = target[key];
    if (t === undefined) {
      issues.push({ type: "missing_key", key, locale });
      continue;
    }
    const s = source[key];

    if (forms(t).some((f) => f.trim() === "")) issues.push({ type: "empty", key, locale });
    if (forms(t).some((f) => f.includes("\uFFFD") || /Ã.|â€/.test(f))) {
      issues.push({ type: "bad_encoding", key, locale, detail: "replacement char or mojibake" });
    }

    // placeholders must match exactly, translators may not rename or drop them
    const ps = phSet(s);
    const pt = phSet(t);
    if (ps.join() !== pt.join()) {
      issues.push({ type: "placeholder_mismatch", key, locale, detail: `source {${ps}} vs target {${pt}}` });
    }

    // plural completeness is per target language, not per source language
    if (typeof t === "object") {
      for (const c of need) if (!(c in t)) issues.push({ type: "missing_plural_category", key, locale, detail: c });
      for (const c of Object.keys(t)) if (!need.includes(c as any)) issues.push({ type: "unexpected_plural_category", key, locale, detail: c });
    } else if (typeof s === "object" && need.length > 1) {
      issues.push({ type: "missing_plural_category", key, locale, detail: "string given for pluralised key" });
    }

    if (typeof s === "string" && typeof t === "string") {
      if (!allowIdentical.has(key) && t === s) issues.push({ type: "untranslated", key, locale });
      if (s.length >= 8 && t.length / s.length > maxExpansion) {
        issues.push({ type: "length_overflow", key, locale, detail: `${(t.length / s.length).toFixed(1)}x` });
      }
    }
  }
  for (const key of Object.keys(target)) if (!(key in source)) issues.push({ type: "extra_key", key, locale });
  return issues;
}

/** Find user-visible literals in source code that bypass the translation layer (naive but useful). */
export function findHardcodedStrings(code: string): string[] {
  const hits: string[] = [];
  // text between tags: >Some words<
  for (const m of code.matchAll(/>\s*([A-Z][A-Za-z]+(?:\s+[A-Za-z']+)+[.!?]?)\s*</g)) hits.push(m[1]);
  // attribute strings: title="Some words", placeholder='...', alt="..."
  for (const m of code.matchAll(/\b(?:title|placeholder|alt|aria-label)=["']([^"'{]*[A-Za-z]{3,}[^"']*)["']/g)) hits.push(m[1]);
  return hits;
}
