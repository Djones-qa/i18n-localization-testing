export type Catalog = Record<string, string | Record<string, string>>;

/**
 * Catalog values are either a string or a plural object keyed by CLDR category
 * (zero | one | two | few | many | other). Placeholders use {name}; inside plural
 * forms {count} is the number.
 */
export class I18n {
  constructor(
    private catalogs: Record<string, Catalog>,
    private locale: string,
    private fallbacks: string[] = ["en"],
  ) {}

  setLocale(locale: string) {
    this.locale = locale;
  }

  /** Locale chain: exact (de-AT) -> language (de) -> fallbacks. */
  chain(): string[] {
    const lang = this.locale.split("-")[0];
    return [...new Set([this.locale, lang, ...this.fallbacks])];
  }

  private lookup(key: string): { value: string | Record<string, string>; locale: string } | undefined {
    for (const loc of this.chain()) {
      const v = this.catalogs[loc]?.[key];
      if (v !== undefined) return { value: v, locale: loc };
    }
    return undefined;
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    const hit = this.lookup(key);
    if (!hit) return key; // visible, greppable failure instead of a blank
    let template: string;
    if (typeof hit.value === "string") {
      template = hit.value;
    } else {
      const n = Number(params.count);
      const cat = new Intl.PluralRules(hit.locale).select(n);
      template = hit.value[cat] ?? hit.value.other ?? key;
    }
    return template.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
  }

  number(n: number, opts?: Intl.NumberFormatOptions) {
    return new Intl.NumberFormat(this.locale, opts).format(n);
  }
  currency(n: number, currency: string) {
    return new Intl.NumberFormat(this.locale, { style: "currency", currency }).format(n);
  }
  date(d: Date, opts: Intl.DateTimeFormatOptions = { dateStyle: "long" }) {
    return new Intl.DateTimeFormat(this.locale, { timeZone: "UTC", ...opts }).format(d);
  }
  dir(): "ltr" | "rtl" {
    return isRtl(this.locale) ? "rtl" : "ltr";
  }
}

const RTL = new Set(["ar", "he", "fa", "ur"]);
export const isRtl = (locale: string) => RTL.has(locale.split("-")[0]);

/** Pseudo-localization: accents + expansion + brackets, makes untranslated or truncated UI obvious. */
export function pseudoLocalize(s: string, expansion = 0.3): string {
  const map: Record<string, string> = {
    a: "á", e: "é", i: "í", o: "ó", u: "ú", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú", c: "ç", n: "ñ",
  };
  let out = "";
  let inBrace = false;
  for (const ch of s) {
    if (ch === "{") inBrace = true;
    out += inBrace ? ch : (map[ch] ?? ch); // never touch placeholders
    if (ch === "}") inBrace = false;
  }
  const pad = "~".repeat(Math.ceil(s.length * expansion));
  return `[${out}${pad}]`;
}
