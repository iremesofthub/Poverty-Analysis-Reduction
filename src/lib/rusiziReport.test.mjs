import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { assembleReport, narrativeText, REPORT_VERSION, SECTION_TITLES } from './reportTemplate.js'
import { directionProblems, factsFrom } from './reportChecks.js'
import { verificationSection } from './reportVerification.js'
import { reportToMarkdown } from '../components/investigation/reportExport.js'

// The engine's real verification output for Rusizi: internal values as printed in the supplied report, checked against the cached NISR documents.
const verification = JSON.parse(readFileSync(new URL('./fixtures/rusizi-verification.json', import.meta.url), 'utf8'))
const result = {
  findings: { district: 'Rusizi', findings: [{ id: 'poverty', value: 44.2, national: 27.4, sample: 486 }, { id: 'grid_connection', value: 66.0, national: 50.8 }, { id: 'health_insurance', value: 78.1, national: 85.3 }, { id: 'vup_among_poor', value: 16.4, national: 15.9 }] },
  data_used: { used: [{ dataset: 'EICV7 2023/24 cross-section', file: 'T2 Finance and Poverty - EICV7.zip', status: 'Used' }, { dataset: 'FinScope Rwanda 2024', file: 'T2 Finance and Poverty - FinScope.dta', status: 'Completed' }] },
  source_register: [{ id: 'eicv7-main', publisher: 'NISR', title: 'EICV7 Main Indicators Report 2023/24', url: 'https://statistics.gov.rw/main.pdf', data_period: '2023/24' }],
  verification,
}

// What the AI writer produced in the supplied report, including the electricity error.
const parts = {
  title: 'Rusizi District Poverty and Service Report', subtitle: 'EICV7 2023/24', objective: 'What is the level of poverty in Rusizi?',
  main_points: ['44.2% of people in Rusizi are living in poverty.'], key_numbers: [{ label: 'Poverty rate', value: '44.2%', context: 'Rwanda 27.4%' }],
  background: 'Rusizi has high poverty.', questions: ['How does Rusizi compare?'], scope: ['Rusizi, 2023/24.'],
  sections: [
    { heading: 'Access to electricity and health insurance', body: '66.0% of Rusizi households have a grid connection, while 78.1% of people have health insurance. Both figures are below the national averages of 50.8% and 85.3% respectively.', chart: 'depth' },
    { heading: 'How sure', body: 'The poverty estimate is based on 486 respondents and includes a 95% confidence interval of 37.43 to 50.9 percent.', chart: null },
  ],
  how_sure: 'The standard error is small.', interpretation: 'About 44 of every 100 people are poor.', comparison: 'Grid connection (66%) is higher than the national level (50.8%), while health-insurance coverage (78.1%) is lower than the national level (85.3%).',
  risks: ['Small samples.'], conclusion: 'Poverty is high.',
  options: [{ title: 'Research responses for: household size', rationale: 'Household size and dependants explain 4.3 percentage points of the poverty gap.', evidence_level: 'Strong association', check_first: 'Collect data.' }], next_steps: ['Check.'],
}

test('the electricity error in the Rusizi report is corrected in the finished report and the correction is shown', () => {
  const report = assembleReport(parts, result, '2026-10-29T10:00:00Z')
  const body = report.results.sections[0].body
  assert.doesNotMatch(body, /Both figures are below/)
  assert.match(body, /Grid electricity connection is 66\.0%, above the national figure of 50\.8%/)
  assert.match(body, /Health insurance coverage is 78\.1%, below the national figure of 85\.3%/)
  assert.equal(report.validation.direction_problems, 0)
  const fixed = report.verification.corrections.find((item) => item.kind === 'direction')
  assert.ok(fixed, 'the correction is recorded')
  assert.match(fixed.original, /Both figures are below/)
  assert.match(report.executive_summary.evidence_check, /corrected during review/)
})

test('the finished report states a direction that matches the data in every sentence', () => {
  const report = assembleReport(parts, result)
  assert.deepEqual(directionProblems(narrativeText(report), factsFrom(result)), [])
})

test('the confidence interval reads with one decimal place and causal wording is softened', () => {
  const report = assembleReport(parts, result)
  assert.match(report.results.sections[1].body, /37\.4 to 50\.9 percent/)
  assert.match(report.conclusion.options[0].rationale, /line up with 4\.3 percentage points/)
})

test('the report has the eight parts in order, with external evidence verification fifth', () => {
  assert.equal(SECTION_TITLES.length, 8)
  assert.equal(SECTION_TITLES[4], 'External evidence verification')
  assert.equal(assembleReport(parts, result).version, REPORT_VERSION)
})

test('the verification table cites the document, table, page, version and retrieval time, and never invents them', () => {
  const section = verificationSection(result)
  const poverty = section.rows.find((row) => row.indicator === 'Poverty rate (district)')
  assert.equal(poverty.label, 'Verified match')
  assert.match(poverty.official, /44\.16%/)
  assert.match(poverty.source, /Table A9\.23, PDF page 109 \(printed page 107\)/)
  assert.match(poverty.source, /retrieved 20\d\d-\d\d-\d\d/)
  assert.ok(poverty.url.startsWith('https://statistics.gov.rw/'))
  const vup = section.rows.find((row) => /VUP/.test(row.indicator))
  assert.equal(vup.label, 'Not externally verified')
  assert.match(vup.source, /No source/)
  assert.equal(vup.url, null)
})

test('grid electricity is reported as a methodology mismatch with both published tables named, not as an error', () => {
  const section = verificationSection(result)
  const grid = section.rows.find((row) => row.indicator === 'Households with grid electricity (district)')
  assert.equal(grid.label, 'Methodology mismatch')
  assert.match(grid.note, /main source of lighting/)
  assert.match(section.lists.mismatches, /grid electricity/i)
  assert.equal(section.unresolved, 0)
})

test('the section says what was confirmed, what could not be compared and what is unverified', () => {
  const section = verificationSection(result)
  assert.match(section.lists.verified, /Poverty rate \(district\)/)
  assert.match(section.lists.unverified, /VUP/)
  assert.match(section.headline, /7 of 10 checked figures match/)
})

test('a report from before verification existed claims nothing was checked', () => {
  const report = assembleReport(parts, { ...result, verification: undefined })
  assert.equal(report.verification.available, false)
  assert.match(report.verification.headline, /No figure in this report was checked/)
  assert.doesNotMatch(report.executive_summary.evidence_check, /match NISR/)
})

test('a failed verification run reads as not run, never as verified', () => {
  const section = verificationSection({ verification: { status: 'Unavailable', reason: 'KeyError: x' } })
  assert.equal(section.available, false)
  assert.match(section.reason, /KeyError/)
})

test('an unresolved discrepancy is carried into the summary so it can be flagged before export', () => {
  const broken = JSON.parse(JSON.stringify(verification))
  broken.registry[0].verification_status = 'discrepancy_requires_review'
  broken.summary = { ...broken.summary, unresolved: 1, unresolved_items: [broken.registry[0].indicator_id] }
  const report = assembleReport(parts, { ...result, verification: broken })
  assert.equal(report.verification.unresolved, 1)
  assert.match(report.executive_summary.evidence_check, /1 issue must be resolved before this report is relied on/)
})

test('data sources separate what the figures come from from what was merely available', () => {
  const report = assembleReport(parts, result)
  const used = report.methodology.data_sources.filter((item) => item.role === 'used')
  const available = report.methodology.data_sources.filter((item) => item.role === 'available')
  assert.ok(used.some((item) => /EICV7/.test(item.text)))
  assert.ok(available.every((item) => /not used for the figures in this report/.test(item.text)))
  assert.ok(available.some((item) => /FinScope/.test(item.text)))
})

test('the Markdown export contains the verification table, the correction and the sources', () => {
  const markdown = reportToMarkdown(assembleReport(parts, result, '2026-10-29T10:00:00Z'), { note: 'n', footer: 'f' })
  assert.match(markdown, /## 5\. External evidence verification/)
  assert.match(markdown, /\| Indicator \| Internal result \| Official published result \| Source \| Verification \|/)
  assert.match(markdown, /### Corrected during review/)
  assert.match(markdown, /Table A9\.23/)
  assert.match(markdown, /\[EICV7 Main Indicators Report 2023\/24\]\(https:\/\/statistics\.gov\.rw/)
  assert.match(markdown, /## 8\. Appendices and references/)
})

test('the evidence quality figures in the report come from the recorded checks, not from the summary', () => {
  const section = verificationSection(result)
  assert.equal(section.quality.available, true)
  assert.equal(section.quality.totals.registry, 10)
  // The counts printed as evidence quality are the same recount that produced the table rows above them.
  const group = (status) => verification.registry.filter((item) => item.verification_status === status).length
  for (const [status, count] of Object.entries(section.quality.counts)) {
    assert.equal(count, group(status), `${status} is a recount of the registry`)
  }
  assert.deepEqual(section.counts, section.quality.counts, "the section never publishes the number the summary claims about itself")
  assert.equal(section.quality.countsMatchSummary, true)
  assert.equal(section.quality.estimates.modelled, verification.registry.filter((item) => item.estimate_type === 'modelled').length)
  assert.equal(section.quality.approvals.recorded, false, 'a green count is never presented as a human decision')
})

test('a summary that disagrees with its own registry is reported as a disagreement, not smoothed over', () => {
  const lying = JSON.parse(JSON.stringify(verification))
  lying.summary = { ...lying.summary, counts: { ...lying.summary.counts, verified_match: 10 } }
  const section = verificationSection({ verification: lying })
  assert.equal(section.quality.counts.verified_match, 7, 'the recount is what the reader sees')
  assert.equal(section.quality.declaredCounts.verified_match, 10, 'the claim is kept so the disagreement is checkable')
  assert.equal(section.quality.countsMatchSummary, false)
})

test('the exported document carries the same evidence-quality facts the screen shows', () => {
  const report = assembleReport(parts, result, '2026-10-29T10:00:00Z')
  const markdown = reportToMarkdown(report, { note: 'n', footer: 'f' })
  assert.match(markdown, /### Evidence quality/)
  assert.match(markdown, /Recounted from the 10 checks recorded by the engine/)
  assert.match(markdown, /- Verified match: 7/)
  assert.match(markdown, /Human scientific review: No human reviewer approval is recorded/)
  assert.match(markdown, /Official documents read: 3 of 3/)
  assert.match(markdown, /A passing count is not a release decision/)
  // Nothing in the exported text may read as though a person signed the work off.
  assert.doesNotMatch(markdown, /(certified|peer-reviewed|scientifically approved)/i)
})
