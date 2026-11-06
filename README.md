# i18n-localization-testing

A TypeScript + Vitest toolkit for testing internationalization and localization: a translation-catalog linter, plural-rule checks, locale formatting, fallback chains, pseudo-localization and RTL detection. It uses Node's built-in `Intl`, so there are no runtime dependencies.

![CI](https://github.com/Djones-qa/i18n-localization-testing/actions/workflows/ci.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)

## Why

Localization bugs ship quietly: a translator drops `{count}`, Russian gets two plural forms instead of four, a German label overflows its button, a hard-coded English string slips into a Japanese UI. This repo makes each of those a failing test.

## What is covered (38 tests)

| Area | Checks |
| --- | --- |
| Catalog linting | missing and extra keys, placeholder renamed / dropped / added, empty values, mojibake and replacement characters, untranslated strings, length overflow |
| Plural rules | required categories per language from CLDR (`Intl.PluralRules`), unexpected categories, string-instead-of-plural; behaviour for en, de, ja, ru (1, 2, 5, 11, 21, 22, 100, 111) and all six Arabic categories |
| Interpolation | placeholders substituted, unknown ones left visible, values with `$&` or braces not corrupted |
| Fallback | region to language to default (`de-AT` to `de` to `en`), missing keys return the key |
| Formatting | numbers, currency, long and short dates across en, de, ru, es, ja, en-GB, en-US |
| Direction | RTL detection (ar, he, fa) and `dir()` |
| Pseudo-localization | accents and expansion that never touch placeholders, leak detection for strings that bypass translation |
| Hard-coded strings | finds visible text and attribute literals outside `t()` |

Shipped catalogs: `en` (source), `es`, `de`, `ja`, `ru`, `ar`. All pass the linter, and the tests also feed it deliberately broken catalogs to prove it catches each defect.

## Quick start

```bash
npm install
npm run typecheck
npm test
```

Requires Node 20+ with full ICU (the default in official builds).

## Project structure

```
src/
  i18n.ts      translation engine, Intl formatters, RTL, pseudo-localization
  checks.ts    catalog linter and hard-coded string finder
locales/       en, es, de, ja, ru, ar catalogs
tests/
  i18n.spec.ts all tests
.github/workflows/ci.yml
```

## Using the linter on your own catalogs

```ts
import { lintCatalog } from "./src/checks";
const issues = lintCatalog(en, fr, "fr", { allowIdentical: ["app.brand"] });
if (issues.length) throw new Error(JSON.stringify(issues, null, 2));
```

## Author

**Darrius Jones**, QA Automation Engineer

- GitHub: [Djones-qa](https://github.com/Djones-qa)
- LinkedIn: [Darrius Jones](https://www.linkedin.com/in/darrius-jones-28226b350/)

## License

Released under the [MIT License](LICENSE).

## Topics

`i18n` `l10n` `localization` `internationalization` `intl` `pluralization` `rtl` `qa-automation` `vitest` `typescript`
