# Financial inclusion data methodology

## Imported evidence

The first loaded observations come only from the public NISR/Access to Finance Rwanda *FinScope Rwanda Survey 2024* report, p. 27 Figure 5 and its accompanying text; urban/rural and gender segments come from the adjacent p. 27 figures and text. The survey targets adults aged 16 and older. It is a demand-side survey and includes formal and informal products. The report describes its access strand as mutually exclusive: banked, other formal (non-bank), informal only, and excluded.

Imported national values are: banked 22%, other formal/non-bank 70%, informal only 4%, excluded 4%; formal inclusion 92% and overall inclusion 96%. Formal and total inclusion are retained with explicit derived formulas (22 + 70, and 100 - 4) and quality flags; the source narrative independently reports 92% and 96%. The rounded access-strand categories sum to 100%. Published segment estimates include rural inclusion 96%, urban 97%, female 96%, male 97%, and formal inclusion female 90%, male 94%.

## Denominators, weights and uncertainty

The denominator is the relevant population of adults aged 16+ represented by the survey (or the corresponding gender/urban/rural adult population). Percentages are published rounded estimates. The report page used for this ingest does not supply a sample size per estimate or confidence interval. No standard errors, confidence intervals, or significance claims are generated. Microdata were not downloaded, so no design-based calculations were attempted.

## Comparability rules

- FinScope is a demand-side, survey-based measure that includes informal use. NBR's dashboard is a supply-side measure from regulated providers and reports active usage among adult individuals. These headline rates must not be compared as though they measured the same population or construct.
- Banked / other formal / informal-only / excluded are exclusive access-strand categories; product ownership/use percentages from other tables can overlap and must not be summed unless the source says they are exclusive.
- A 2024 survey period is not a weekly-updated current value. No trend line is created from unmatched periods or definitions.
- FinScope catalogue district variables do not constitute downloaded, authorized district estimates. This ingest has no district financial-inclusion values; do not fill districts with national rates.
- EICV7 poverty measures remain separate. Any future geographic juxtaposition is descriptive, not individual-level linkage, causal inference, or evidence that the same households were measured.
- No unique people are estimated by summing provider customers. No identity-level records are loaded.

## Quality and provenance

Each observation stores the source ID, report URL via its source row, page/figure reference, survey period, population, denominator, geography, method, transformation and quality flags. Source records store the original URL, retrieval timestamp, publisher, file type/size, SHA-256, terms and limitations. The validation/import command rejects unknown source IDs, duplicate observation IDs, percent values outside 0–100, missing dates/provenance and local source-file checksum drift.

## Citation format

> Source: National Institute of Statistics of Rwanda and Access to Finance Rwanda, *Rwanda FinScope Survey 2024*, p. 27, Figure 5 (2024 survey; adults aged 16+; demand-side access strand). Retrieved 2026-10-31. [Report](https://microdata.statistics.gov.rw/index.php/catalog/120/download/1085).

For the derived overall inclusion value, state: “96%, calculated as 100% minus the published 4% excluded category; the report narrative also states 96%.”
