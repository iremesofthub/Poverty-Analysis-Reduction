// Public aggregate snapshot read from the BNR Financial Inclusion Dashboard.
// Retrieval: 2026-10-31. Dashboard filters: all genders, all ages, all
// regulated institution types, active status, all locations; dashboard date:
// 2026-10-19. This is not a live feed and must not be combined with FinScope.
export const BNR_INCLUSION_SNAPSHOT = {
  dashboardDate: "2026-10-19",
  retrievedAt: "2026-10-31",
  financiallyIncludedPct: 96.4,
  totalCustomers: 8608809,
  gender: [
    { name: "Female", value: 4126790, color: "#D4B95A" },
    { name: "Male", value: 4482019, color: "#753918" },
  ],
  institutionInclusion: [
    { name: "E-money issuers", value: 74.0, color: "#753918" },
    { name: "Banks", value: 33.7, color: "#AB892C" },
    { name: "SACCOs", value: 23.5, color: "#D4B95A" },
    { name: "Microfinance", value: 10.0, color: "#5B6B7F" },
    { name: "Insurance", value: 8.5, color: "#8C6C4B" },
  ],
  topDistrictCustomers: [
    { name: "Gasabo", value: 2594320 },
    { name: "Nyarugenge", value: 1580803 },
    { name: "Unknown location", value: 446528 },
    { name: "Kicukiro", value: 212666 },
    { name: "Musanze", value: 211200 },
    { name: "Rubavu", value: 211091 },
    { name: "Nyagatare", value: 185921 },
    { name: "Nyanza", value: 182509 },
    { name: "Nyamagabe", value: 176800 },
    { name: "Gisagara", value: 158826 },
  ],
  sourceUrl: "https://fininclusion.bnr.rw/inclusion",
};
