import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findHardcodedStrings, lintCatalog, placeholders } from "../src/checks";
import { I18n, isRtl, pseudoLocalize, type Catalog } from "../src/i18n";

const dir = join(__dirname, "..", "locales");
const catalogs: Record<string, Catalog> = Object.fromEntries(
  readdirSync(dir).map((f) => [f.replace(".json", ""), JSON.parse(readFileSync(join(dir, f), "utf8"))]),
);
const norm = (s: string) => s.replace(/[\s\u00a0\u202f]/g, " ");
const mk = (locale: string) => new I18n(catalogs, locale);

describe("shipped catalogs pass the linter", () => {
  const targets = Object.keys(catalogs).filter((l) => l !== "en");
  it.each(targets)("%s has no issues against en", (loc) => {
    const issues = lintCatalog(catalogs.en, catalogs[loc], loc, { allowIdentical: ["app.brand", "checkout.total"] }); // "Total: x" is correct Spanish
    expect(issues).toEqual([]);
  });
});

describe("linter detects broken translations", () => {
  const src: Catalog = {
    greeting: "Hello, {name}!",
    "action.save": "Save changes",
    "cart.items": { one: "{count} item", other: "{count} items" },
    "only.in.source": "Only here",
  };
  const bad = (target: Catalog, loc = "de") => lintCatalog(src, target, loc).map((i) => `${i.type}:${i.key}`);

  it("flags missing and extra keys", () => {
    const r = bad({ greeting: "Hallo, {name}!", "action.save": "Speichern", "cart.items": { one: "{count} a", other: "{count} b" }, stray: "x" });
    expect(r).toContain("missing_key:only.in.source");
    expect(r).toContain("extra_key:stray");
  });

  it("flags renamed, dropped or added placeholders", () => {
    expect(bad({ greeting: "Hallo, {nombre}!" })).toContain("placeholder_mismatch:greeting");
    expect(bad({ greeting: "Hallo!" })).toContain("placeholder_mismatch:greeting");
    expect(bad({ greeting: "Hallo {name} {extra}" })).toContain("placeholder_mismatch:greeting");
  });

  it("flags missing plural categories for the target language", () => {
    const r = lintCatalog(src, { "cart.items": { one: "{count} a", other: "{count} b" } }, "ru").filter(
      (i) => i.type === "missing_plural_category",
    );
    expect(r.map((i) => i.detail).sort()).toEqual(["few", "many"]);
  });

  it("flags plural categories the language does not use", () => {
    const r = bad({ "cart.items": { one: "{count} a", few: "{count} b", other: "{count} c" } }, "de");
    expect(r).toContain("unexpected_plural_category:cart.items");
  });

  it("flags a plain string where the language needs plural forms", () => {
    expect(bad({ "cart.items": "{count} Artikel" })).toContain("missing_plural_category:cart.items");
  });

  it("flags untranslated, empty and mojibake strings", () => {
    const r = bad({ greeting: "Hello, {name}!", "action.save": "  ", "cart.items": { one: "{count} Ã¼", other: "{count} b" } });
    expect(r).toContain("untranslated:greeting");
    expect(r).toContain("empty:action.save");
    expect(r).toContain("bad_encoding:cart.items");
  });

  it("flags translations likely to overflow the UI", () => {
    const r = lintCatalog(src, { "action.save": "x".repeat(40) }, "de").map((i) => i.type);
    expect(r).toContain("length_overflow");
  });
});

describe("plural rules per language", () => {
  it.each([
    ["en", 1, "1 item in your cart"],
    ["en", 0, "0 items in your cart"],
    ["de", 1, "1 Artikel in Ihrem Warenkorb"],
    ["ja", 5, "カートに5個の商品があります"],
    ["ru", 1, "1 товар в корзине"],
    ["ru", 2, "2 товара в корзине"],
    ["ru", 5, "5 товаров в корзине"],
    ["ru", 21, "21 товар в корзине"],
    ["ru", 22, "22 товара в корзине"],
    ["ru", 11, "11 товаров в корзине"],
    ["ru", 111, "111 товаров в корзине"],
    ["ru", 100, "100 товаров в корзине"],
  ])("%s with count %i", (loc, n, expected) => {
    expect(mk(loc).t("cart.items", { count: n })).toBe(expected);
  });

  it("selects every Arabic category", () => {
    const ar = mk("ar");
    expect(ar.t("cart.items", { count: 0 })).toContain("لا توجد");
    expect(ar.t("cart.items", { count: 1 })).toContain("واحد");
    expect(ar.t("cart.items", { count: 2 })).toContain("منتجان");
    expect(ar.t("cart.items", { count: 3 })).toBe("3 منتجات في سلتك");
    expect(ar.t("cart.items", { count: 11 })).toBe("11 منتجًا في سلتك");
    expect(ar.t("cart.items", { count: 100 })).toBe("100 منتج في سلتك");
  });
});

describe("interpolation and fallback", () => {
  it("interpolates and preserves unknown placeholders visibly", () => {
    expect(mk("es").t("greeting", { name: "Ana" })).toBe("¡Hola, Ana!");
    expect(mk("en").t("greeting")).toBe("Hello, {name}!");
  });

  it("does not corrupt values containing regex or brace characters", () => {
    expect(mk("en").t("greeting", { name: "$&{name}" })).toBe("Hello, $&{name}!");
  });

  it("falls back from region to language to English", () => {
    const i = new I18n(catalogs, "de-AT");
    expect(i.chain()).toEqual(["de-AT", "de", "en"]);
    expect(i.t("action.save")).toBe("Änderungen speichern");
    const partial = new I18n({ en: catalogs.en, fr: {} }, "fr");
    expect(partial.t("action.save")).toBe("Save changes");
  });

  it("returns the key for strings missing everywhere", () => {
    expect(mk("en").t("no.such.key")).toBe("no.such.key");
  });
});

describe("number, currency and date formatting", () => {
  const d = new Date(Date.UTC(2026, 2, 5));
  it("formats numbers with locale separators", () => {
    expect(norm(mk("en").number(1234567.5))).toBe("1,234,567.5");
    expect(norm(mk("de").number(1234567.5))).toBe("1.234.567,5");
    expect(norm(mk("ru").number(1234567.5))).toBe("1 234 567,5");
  });
  it("formats currency with locale symbol placement", () => {
    expect(norm(mk("en").currency(1234.5, "USD"))).toBe("$1,234.50");
    expect(norm(mk("de").currency(1234.5, "EUR"))).toBe("1.234,50 €");
    expect(mk("ja").currency(1235, "JPY")).toContain("1,235");
  });
  it("formats dates in the locale's order and language", () => {
    expect(mk("en").date(d)).toBe("March 5, 2026");
    expect(mk("de").date(d)).toBe("5. März 2026");
    expect(mk("es").date(d)).toBe("5 de marzo de 2026");
    expect(mk("ja").date(d)).toBe("2026年3月5日");
  });
  it("resolves region variants (en-GB date order)", () => {
    expect(mk("en-GB").date(d, { dateStyle: "short" })).toBe("05/03/2026");
    expect(mk("en-US").date(d, { dateStyle: "short" })).toBe("3/5/26");
  });
});

describe("direction and pseudo-localization", () => {
  it("detects RTL languages", () => {
    for (const l of ["ar", "he", "fa", "ar-EG"]) expect(isRtl(l)).toBe(true);
    for (const l of ["en", "de", "ja", "ru"]) expect(isRtl(l)).toBe(false);
    expect(mk("ar").dir()).toBe("rtl");
    expect(mk("en").dir()).toBe("ltr");
  });

  it("pseudo-localizes while leaving placeholders intact", () => {
    const p = pseudoLocalize("Hello, {name}! You have {count} items");
    expect(p.startsWith("[") && p.endsWith("]")).toBe(true);
    expect(placeholders(p)).toEqual(["count", "name"]);
    expect(p).toContain("Hélló");
    expect(p.length).toBeGreaterThan("Hello, {name}! You have {count} items".length * 1.3);
  });

  it("any un-pseudo-localized string in a rendered UI stands out", () => {
    const pseudo: Catalog = Object.fromEntries(
      Object.entries(catalogs.en).map(([k, v]) => [k, typeof v === "string" ? pseudoLocalize(v) : v]),
    );
    const rendered = [new I18n({ en: pseudo }, "en").t("app.title"), "Hardcoded label"];
    const leaks = rendered.filter((s) => !s.startsWith("["));
    expect(leaks).toEqual(["Hardcoded label"]);
  });
});

describe("hard-coded string detection", () => {
  it("finds literals that bypass translation", () => {
    const code = `<button title="Delete this order">{t("action.delete")}</button><p>Your order has shipped.</p>`;
    expect(findHardcodedStrings(code)).toEqual(["Your order has shipped.", "Delete this order"]);
  });
  it("ignores translated and dynamic content", () => {
    expect(findHardcodedStrings(`<p>{t("greeting")}</p><img alt={t("logo.alt")} />`)).toEqual([]);
  });
});
