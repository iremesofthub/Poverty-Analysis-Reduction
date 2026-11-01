import aggregates from "@/data/dashboard-eicv7-aggregates.json";
import uncertaintyDocument from "@/data/dashboard-eicv7-uncertainty.json";
import { DISTRICTS } from "@/data/nisr";
import { reader as uncertaintyReader } from "@/lib/districtUncertainty";

// The join is created once from the derived artifact. `dashboard-eicv7-aggregates.json`
// holds the published-looking rounded values the dashboard shows;
// `dashboard-eicv7-uncertainty.json` holds the design-based intervals, contrasts and
// reliability grades produced by `engine/ireme/survey.py`.
const uncertainty = uncertaintyReader(uncertaintyDocument);
const { withUncertainty, withNationalUncertainty } = uncertainty;

// NISR EICV7 Poverty Profile, Annex B: EICV5 rates modelled onto the EICV7
// methodology. The old, directly observed EICV5 rates in nisr.js are not
// comparable with 2023/24 and must not be used for change charts.
const MODELLED_2016_17 = {
  Bugesera: 40.8, Burera: 25.5, Gakenke: 36.7, Gasabo: 18.1,
  Gatsibo: 38.0, Gicumbi: 24.6, Gisagara: 59.5, Huye: 39.4,
  Kamonyi: 53.0, Karongi: 53.0, Kayonza: 51.0, Kicukiro: 8.2,
  Kirehe: 26.0, Muhanga: 33.2, Musanze: 42.3, Ngoma: 34.0,
  Ngororero: 44.4, Nyabihu: 39.6, Nyagatare: 48.6, Nyamagabe: 67.6,
  Nyamasheke: 53.6, Nyanza: 46.9, Nyarugenge: 11.6, Nyaruguru: 52.6,
  Rubavu: 49.2, Ruhango: 26.2, Rulindo: 35.2, Rusizi: 59.0,
  Rutsiro: 59.9, Rwamagana: 29.6,
};

// Annex B publishes the percentage-point decrease separately. A few entries
// differ by 0.1 from subtracting its displayed one-decimal rates because NISR
// calculated the decrease before rounding the rates for the table.
const PUBLISHED_DECREASE = {
  Bugesera: 17.1, Burera: 3.5, Gakenke: 12.2, Gasabo: 7.0,
  Gatsibo: 19.6, Gicumbi: 11.3, Gisagara: 13.9, Huye: 15.3,
  Kamonyi: 13.3, Karongi: 14.8, Kayonza: 14.5, Kicukiro: 1.3,
  Kirehe: 11.7, Muhanga: 18.3, Musanze: 21.3, Ngoma: 3.1,
  Ngororero: 14.2, Nyabihu: 19.4, Nyagatare: 12.3, Nyamagabe: 16.2,
  Nyamasheke: 10.8, Nyanza: 3.6, Nyarugenge: 4.8, Nyaruguru: 12.9,
  Rubavu: 10.4, Ruhango: 11.2, Rulindo: 13.6, Rusizi: 14.9,
  Rutsiro: 19.1, Rwamagana: 5.7,
};

export const DASHBOARD_SOURCES = {
  poverty: "https://www.statistics.gov.rw/sites/default/files/documents/2025-07/EICV7_Main%20Indicator%20Report.pdf",
  change: "https://www.statistics.gov.rw/sites/default/files/documents/2025-04/EICV7_Poverty%20Profile.pdf",
  financial: "https://microdata.statistics.gov.rw/index.php/catalog/120/download/1085",
};

// Published national FinScope 2024 Access Strand. The four categories are
// mutually exclusive and sum to 100; mobile-money usage overlaps them.
export const FINANCIAL_ACCESS_NATIONAL = [
  { key: "banked", label: "Bank services", value: 22, color: "#635BFF" },
  { key: "otherFormal", label: "Other formal", value: 70, color: "#14B8A6" },
  { key: "informalOnly", label: "Informal only", value: 4, color: "#F5A623" },
  { key: "excluded", label: "Excluded", value: 4, color: "#E3E8EE" },
];

export const NATIONAL_EICV7 = withNationalUncertainty(aggregates.national);

const byName = new Map(aggregates.districts.map((row) => [row.name, row]));

// `withUncertainty` attaches the design-based interval for a district only when
// the derived point still matches the value shown below. If the two artifacts
// ever come from different runs the interval is dropped and the UI says
// "Not calculated" rather than inventing precision.
export const DASHBOARD_DISTRICTS = DISTRICTS.map(({ name, province }) => {
  const evidence = byName.get(name);
  const previous = MODELLED_2016_17[name];
  const publishedDecrease = PUBLISHED_DECREASE[name];
  if (!evidence || previous === undefined || publishedDecrease === undefined) {
    throw new Error(`Missing dashboard evidence for ${name}`);
  }
  return withUncertainty({ ...evidence, province, previousModelled: previous, publishedDecrease });
});

export const EICV7_METHOD = aggregates.method;

// Design-based uncertainty metadata (UPG-01): how these intervals were built and
// what is still awaiting independent scientific review.
export const EICV7_UNCERTAINTY = {
  provenance: uncertaintyDocument.provenance,
  method: uncertaintyDocument.method,
  status: uncertaintyDocument.status,
  reliabilityBands: uncertaintyDocument.reliabilityBands,
};

export { uncertainty };
