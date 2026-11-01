# English / Kinyarwanda translation review

Date: 2026-10-31

## Completed

- Added an always-available language selector to the authenticated desktop sidebar and mobile shell.
- The selector supports only English (`en`) and Kinyarwanda (`rw`), updates mounted panels immediately, and persists the choice in browser storage.
- Translated the shared navigation, settings, member, government, agent, USSD, login-help, and guided-tour copy.
- Added `src/i18n/tourRw.js` for all guided-tour step titles and descriptions. This keeps the long tour copy separate from the main catalogue and prevents empty-string fallbacks.
- Added browser coverage for switching English → Kinyarwanda → English.
- Added translated programme and government sub-navigation labels; Playwright specifically checks both panels.
- Translated the visible National Goals and Analyst Dashboard headings, labels, target states, and introductory copy shown in the supplied screenshots.

## Findings and limitations for review

1. Kinyarwanda wording is an engineering translation and needs a native-speaker review before public release. Names of government programmes, financial products, districts, and source documents are intentionally preserved rather than translated.
2. Values returned by external data sources, user-entered names, programme names, and report excerpts are not translated by the interface; they remain source text.
3. Playwright route review found that the programme and government sub-navigation was using the member translation namespace, leaving labels such as “Agents”, “Jobs & Recruitment”, and “Delivery problems” in English. This is fixed with dedicated `programme.tabs` and `gov.tabs` keys.
4. Some feature copy is still authored directly inside panel components instead of using `t(...)`. The remaining confirmed areas are detailed Agent Dashboard status/KPI copy, job application form labels, map sector detail copy, and analyst chart/table methodology notes. They remain English when the language changes and should be migrated panel by panel in a follow-up pass.
5. The translation selector is in the shared shell, so it is available on every authenticated route. Public authentication pages retain their existing English copy and are not part of the dashboard shell.
6. Long guided-tour copy is now present in Kinyarwanda, but terminology and tone should be checked by NISR/Kinyarwanda reviewers.

## Verification

- `npm test`: 113 passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Playwright `e2e/07-language.spec.js`: passed; verified the shared shell changes language in Chromium and returns to English.
- Playwright route crawl: checked all authenticated routes in demo mode; found and fixed the programme/government sub-navigation fallback.
- Playwright `e2e/07-language.spec.js`: passed after the National Goals, Analyst Dashboard, programme, and government fixes.

## Files changed in the final translation pass

- `src/components/layout/LanguageSwitcher.jsx`
- `src/components/layout/Sidebar.jsx`
- `src/components/layout/DashboardShell.jsx`
- `src/i18n/rw.json`
- `src/i18n/tourRw.js`
- `src/i18n/index.js`
- `src/i18n/i18n.test.mjs`
- `src/ussd/core.test.mjs`
- `e2e/07-language.spec.js`
