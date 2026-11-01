# Financial inclusion data ingest: implementation report

## Delivered in this pass

- Retrieved three official public PDFs into `source-data/financial-inclusion/raw/`: FinScope 2024 report, NBR National Financial Inclusion Roadmap 2026–2030 and NBR Annual Report 2024–2025. SHA-256, type, byte size, original URL, retrieval time, terms and limitations are recorded in `source-data/financial-inclusion/registry.json`.
- Extracted and normalized 12 aggregate FinScope observations from published p. 27 figures/text, retaining period, adult population/denominator, segment, table reference, method, derivation and quality flags. No individual data, district estimates or fabricated NBR provider values were loaded.
- Added additive Supabase tables for source registry and observations with RLS and public read-only policies. Applied the migration and loaded data into the configured project using an idempotent upsert.
- Database verification returned 5 source records, 12 observations and 12 FinScope observations. Import validation reports `VALIDATION_PASSED`; individual records loaded: 0.
- The focused Python evidence suite ran successfully: 4 tests passed.
- Added source inventory, methodology and rerun instructions in `docs/financial-inclusion-data-sources.md` and `docs/financial-inclusion-methodology.md`.
- Integrated the Analyst Dashboard financial inclusion pie chart with the persisted Supabase observations. It renders only the complete national FinScope access strand, labels the adult population and period, links the source and page reference, and reports an unavailable state if data cannot be read.
- Redesigned the existing Data Sources page as “Data & Methodology” with a live source register, actual observation counts, file provenance, download/import status, plain-language survey vs provider methodology and a separate EICV7 note.

## Not completed / external limits

- NBR provider files (banks, MFIs, insurance, pensions and NDFSPs) are listed on the official page, but direct public file URLs were not exposed by the readable response in this run. The public files must be downloaded before those values can be ingested.
- NBR describes its interactive dashboard as weekly and provider-reported, but no public documented API/export was confirmed. The application is not connected to it and contains no live NBR dashboard values.
- FinScope microdata remains access-controlled; only the public report was used. District estimates, weights-based uncertainty and small-cell checks are therefore not available from this ingest.
- Downloaded roadmap and annual report PDFs are registered for future definition/table audit. No historical NBR supply-side observation was loaded from them in this pass.
- Remaining UI limitation: no district finance estimates or NBR provider aggregates are available to chart. The dashboard finance pie remains national-only.

## Verification performed

| Check | Result |
|---|---|
| Official report/PDF downloads | Retrieved; PDF signatures and recorded sizes verified |
| SHA-256 registry validation | Passed for all three local PDFs |
| Normalized observation schema and provenance validation | Passed; 12 records |
| Percent bounds and duplicate IDs | Passed |
| Supabase schema application | Succeeded |
| Supabase idempotent source/observation load | Succeeded |
| Supabase read-back | 5 sources / 12 total observations / 12 FinScope observations |
| Supabase public Data API read | Passed; source record and all 12 observations returned with the publishable key under read-only RLS |
| Focused source evidence tests | Passed; 4 tests |
| Frontend data mapping tests | Passed; 2 tests |
| `npm test` | Passed; 112 tests |
| `npm run lint` | Passed |
| `npm run build` | Passed; Vite reported its existing large JavaScript chunk advisory |

## Commands

```powershell
python scripts/financial_inclusion_data.py
python scripts/financial_inclusion_data.py --load --verify-db
npm run dev
```
