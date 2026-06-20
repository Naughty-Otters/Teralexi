var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// toolSet/scholar-courts.ts
var scholar_courts_exports = {};
__export(scholar_courts_exports, {
  SCHOLAR_FEDERAL_COURTS: () => SCHOLAR_FEDERAL_COURTS,
  SCHOLAR_SEARCH_CATEGORIES: () => SCHOLAR_SEARCH_CATEGORIES,
  SCHOLAR_US_STATE_COURTS: () => SCHOLAR_US_STATE_COURTS,
  buildGoogleScholarSearchUrl: () => buildGoogleScholarSearchUrl,
  describeScholarSearchScope: () => describeScholarSearchScope,
  listScholarSearchOptions: () => listScholarSearchOptions,
  resolveScholarAsSdt: () => resolveScholarAsSdt,
  resolveScholarState: () => resolveScholarState
});
module.exports = __toCommonJS(scholar_courts_exports);
var SCHOLAR_SEARCH_CATEGORIES = [
  "article",
  "case_law",
  "case_law_federal",
  "case_law_state"
];
var SCHOLAR_FEDERAL_COURTS = [
  { key: "supreme_court", label: "US Supreme Court", asSdt: "4,180" },
  { key: "tax_court", label: "US Tax Court", asSdt: "4,192" },
  { key: "court_of_claims", label: "US Court of Federal Claims", asSdt: "4,181" },
  { key: "dc_circuit", label: "US Court of Appeals, D.C. Circuit", asSdt: "4,174" },
  { key: "first_circuit", label: "US Court of Appeals, First Circuit", asSdt: "4,175" },
  { key: "second_circuit", label: "US Court of Appeals, Second Circuit", asSdt: "4,176" },
  { key: "third_circuit", label: "US Court of Appeals, Third Circuit", asSdt: "4,177" },
  { key: "fourth_circuit", label: "US Court of Appeals, Fourth Circuit", asSdt: "4,178" },
  { key: "fifth_circuit", label: "US Court of Appeals, Fifth Circuit", asSdt: "4,179" },
  { key: "sixth_circuit", label: "US Court of Appeals, Sixth Circuit", asSdt: "4,182" },
  { key: "seventh_circuit", label: "US Court of Appeals, Seventh Circuit", asSdt: "4,183" },
  { key: "eighth_circuit", label: "US Court of Appeals, Eighth Circuit", asSdt: "4,184" },
  { key: "ninth_circuit", label: "US Court of Appeals, Ninth Circuit", asSdt: "4,185" },
  { key: "tenth_circuit", label: "US Court of Appeals, Tenth Circuit", asSdt: "4,186" },
  { key: "eleventh_circuit", label: "US Court of Appeals, Eleventh Circuit", asSdt: "4,187" },
  { key: "federal_circuit", label: "US Court of Appeals, Federal Circuit", asSdt: "4,188" }
];
var SCHOLAR_US_STATE_COURTS = [
  { state: "Alabama", code: "AL", asSdt: "4,1" },
  { state: "Alaska", code: "AK", asSdt: "4,2" },
  { state: "Arizona", code: "AZ", asSdt: "4,3" },
  { state: "Arkansas", code: "AR", asSdt: "4,4" },
  { state: "California", code: "CA", asSdt: "4,5" },
  { state: "Colorado", code: "CO", asSdt: "4,6" },
  { state: "Connecticut", code: "CT", asSdt: "4,7" },
  { state: "Delaware", code: "DE", asSdt: "4,8" },
  { state: "District of Columbia", code: "DC", asSdt: "4,9" },
  { state: "Florida", code: "FL", asSdt: "4,10" },
  { state: "Georgia", code: "GA", asSdt: "4,11" },
  { state: "Hawaii", code: "HI", asSdt: "4,12" },
  { state: "Idaho", code: "ID", asSdt: "4,13" },
  { state: "Illinois", code: "IL", asSdt: "4,14" },
  { state: "Indiana", code: "IN", asSdt: "4,15" },
  { state: "Iowa", code: "IA", asSdt: "4,16" },
  { state: "Kansas", code: "KS", asSdt: "4,17" },
  { state: "Kentucky", code: "KY", asSdt: "4,18" },
  { state: "Louisiana", code: "LA", asSdt: "4,19" },
  { state: "Maine", code: "ME", asSdt: "4,20" },
  { state: "Maryland", code: "MD", asSdt: "4,21" },
  { state: "Massachusetts", code: "MA", asSdt: "4,22" },
  { state: "Michigan", code: "MI", asSdt: "4,23" },
  { state: "Minnesota", code: "MN", asSdt: "4,24" },
  { state: "Mississippi", code: "MS", asSdt: "4,25" },
  { state: "Missouri", code: "MO", asSdt: "4,26" },
  { state: "Montana", code: "MT", asSdt: "4,27" },
  { state: "Nebraska", code: "NE", asSdt: "4,28" },
  { state: "Nevada", code: "NV", asSdt: "4,29" },
  { state: "New Hampshire", code: "NH", asSdt: "4,30" },
  { state: "New Jersey", code: "NJ", asSdt: "4,31" },
  { state: "New Mexico", code: "NM", asSdt: "4,32" },
  { state: "New York", code: "NY", asSdt: "4,33" },
  { state: "North Carolina", code: "NC", asSdt: "4,34" },
  { state: "North Dakota", code: "ND", asSdt: "4,35" },
  { state: "Ohio", code: "OH", asSdt: "4,36" },
  { state: "Oklahoma", code: "OK", asSdt: "4,37" },
  { state: "Oregon", code: "OR", asSdt: "4,38" },
  { state: "Pennsylvania", code: "PA", asSdt: "4,39" },
  { state: "Rhode Island", code: "RI", asSdt: "4,40" },
  { state: "South Carolina", code: "SC", asSdt: "4,41" },
  { state: "South Dakota", code: "SD", asSdt: "4,42" },
  { state: "Tennessee", code: "TN", asSdt: "4,43" },
  { state: "Texas", code: "TX", asSdt: "4,44" },
  { state: "Utah", code: "UT", asSdt: "4,45" },
  { state: "Vermont", code: "VT", asSdt: "4,46" },
  { state: "Virginia", code: "VA", asSdt: "4,47" },
  { state: "Washington", code: "WA", asSdt: "4,48" },
  { state: "West Virginia", code: "WV", asSdt: "4,49" },
  { state: "Wisconsin", code: "WI", asSdt: "4,50" },
  { state: "Wyoming", code: "WY", asSdt: "4,51" }
];
var federalCourtByKey = new Map(
  SCHOLAR_FEDERAL_COURTS.map((court) => [court.key, court])
);
var stateByCode = new Map(
  SCHOLAR_US_STATE_COURTS.map((entry) => [entry.code, entry])
);
var stateByName = new Map(
  SCHOLAR_US_STATE_COURTS.map((entry) => [
    entry.state.toLowerCase(),
    entry
  ])
);
function listScholarSearchOptions() {
  return {
    categories: SCHOLAR_SEARCH_CATEGORIES,
    federalCourts: SCHOLAR_FEDERAL_COURTS,
    states: SCHOLAR_US_STATE_COURTS
  };
}
function resolveScholarState(state) {
  const raw = state?.trim();
  if (!raw) return void 0;
  const upper = raw.toUpperCase();
  if (stateByCode.has(upper)) return stateByCode.get(upper);
  return stateByName.get(raw.toLowerCase());
}
function resolveScholarAsSdt(scope) {
  if (scope.customAsSdt?.trim()) return scope.customAsSdt.trim();
  if (scope.category === "article") {
    return scope.includePatents ? "7" : "0";
  }
  if (scope.federalCourt) {
    const court = federalCourtByKey.get(scope.federalCourt);
    if (court) return court.asSdt;
  }
  if (scope.category === "case_law_federal") {
    return "3";
  }
  if (scope.category === "case_law_state") {
    const stateEntry = resolveScholarState(scope.state);
    if (stateEntry) return stateEntry.asSdt;
    return "ffffffffffffe04";
  }
  if (scope.category === "case_law") {
    const stateEntry = resolveScholarState(scope.state);
    if (stateEntry) return stateEntry.asSdt;
    return "4";
  }
  return void 0;
}
function describeScholarSearchScope(scope) {
  if (scope.customAsSdt?.trim()) {
    return `custom as_sdt=${scope.customAsSdt.trim()}`;
  }
  if (scope.category === "article") {
    return scope.includePatents ? "scholarly articles (including patents)" : "scholarly articles";
  }
  if (scope.federalCourt) {
    const court = federalCourtByKey.get(scope.federalCourt);
    if (court) return `case law \u2014 ${court.label}`;
  }
  if (scope.category === "case_law_federal") {
    return "case law \u2014 all US federal courts";
  }
  if (scope.category === "case_law_state") {
    const stateEntry2 = resolveScholarState(scope.state);
    if (stateEntry2) return `case law \u2014 ${stateEntry2.state}`;
    return "case law \u2014 all US state courts";
  }
  const stateEntry = resolveScholarState(scope.state);
  if (stateEntry) return `case law \u2014 ${stateEntry.state}`;
  return "case law \u2014 all US federal and state courts";
}
function buildGoogleScholarSearchUrl(query, scope) {
  const url = new URL("https://scholar.google.com/scholar");
  url.searchParams.set("q", query.trim());
  url.searchParams.set("hl", "en");
  const asSdt = resolveScholarAsSdt(scope);
  if (asSdt) url.searchParams.set("as_sdt", asSdt);
  return url.toString();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SCHOLAR_FEDERAL_COURTS,
  SCHOLAR_SEARCH_CATEGORIES,
  SCHOLAR_US_STATE_COURTS,
  buildGoogleScholarSearchUrl,
  describeScholarSearchScope,
  listScholarSearchOptions,
  resolveScholarAsSdt,
  resolveScholarState
});
//# sourceMappingURL=6d2aaa8dc772d9d7f3d44431813af037a74f8e79.js.map
