import { LANGUAGES } from "./data.js";

export const PRESENT = new Date().getFullYear();
export const EARLIEST = -3500;

// Broad conventional language periods, including scribal use where stated.
// These are context, not dates for a lexeme or historical territorial extents.
export const HISTORICAL = {
  sux: { name:"Sumerian", point:[31.3,45.6], period:[-3200,100], region:"Southern Mesopotamia", era:"c. 3200 BCE–100 CE · including scribal use" },
  akk: { name:"Akkadian", point:[33.1,44.4], period:[-2500,100], region:"Mesopotamia", era:"c. 2500 BCE–100 CE · including scribal use" },
  hit: { name:"Hittite", point:[40.02,34.62], period:[-1650,-1180], region:"Central Anatolia", era:"c. 1650–1180 BCE" },
  xur: { name:"Urartian", point:[38.5,43.3], period:[-900,-600], region:"Armenian Highlands", era:"c. 900–600 BCE" },
  xhu: { name:"Hurrian", point:[36.8,40.8], period:[-2300,-1000], region:"Upper Mesopotamia", era:"c. 2300–1000 BCE" },
  peo: { name:"Old Persian", point:[29.9,52.9], period:[-525,-300], region:"Fars", era:"c. 525–300 BCE" },
  uga: { name:"Ugaritic", point:[35.6,35.8], period:[-1400,-1180], region:"Northern Levant", era:"c. 1400–1180 BCE" },
  la: { period:[-700,700] }, grc:{ period:[-800,600] }, ang:{ period:[450,1150] }, enm:{ period:[1100,1500] },
  goh:{ period:[500,1050] }, fro:{ period:[800,1400] }, "gem-pro":{ period:[-500,200] },
  "gmw-pro":{ period:[-100,400] }, "sla-pro":{ period:[-500,600] }, "zlw-opl":{ period:[1000,1500] }
};
let catalogPromise;
function addHistorical() {
  for (const [code, meta] of Object.entries(HISTORICAL)) {
    LANGUAGES[code] = { ...LANGUAGES[code], ...meta, historical:true, contemporary:false };
    if (meta.point) LANGUAGES[code].locationSource = "Approximate historical centre";
  }
}
addHistorical();

export function loadLanguageCatalog() {
  if (!catalogPromise) catalogPromise = (async () => {
    const response = await fetch(new URL("../data/languages.json.gz", import.meta.url));
    if (!response.ok) throw new Error(`Language catalogue returned ${response.status}`);
    const catalog = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).json();
    for (const [code, meta] of Object.entries(catalog)) {
      // Preserve explicitly curated history, but use source-backed modern coordinates.
      const existing = LANGUAGES[code] || {};
      LANGUAGES[code] = { ...existing, ...meta };
      if (existing.historical) Object.assign(LANGUAGES[code], {historical:true, contemporary:false});
    }
    addHistorical();
    return Object.keys(catalog).length;
  })().catch((error) => { catalogPromise = null; throw error; });
  return catalogPromise;
}

export function resolveLanguage(value) {
  const search = value.trim().toLowerCase();
  if (LANGUAGES[search] && !LANGUAGES[search].lexicalDataset) return search;
  return Object.keys(LANGUAGES).find((code) => !LANGUAGES[code].lexicalDataset && [LANGUAGES[code].name, LANGUAGES[code].wiktionaryName].some((name) => name?.toLowerCase() === search));
}

export function formatYear(year) {
  if (year >= PRESENT) return "Present";
  return year < 1 ? `${Math.abs(year || -1)} BCE` : `${year} CE`;
}

export function inPeriod(code, from, to, includeUndated = false, registry = LANGUAGES) {
  if (from <= EARLIEST && to >= PRESENT) return true;
  const meta = registry[code] || {};
  if (meta.period) return meta.period[0] <= to && meta.period[1] >= from;
  if (meta.contemporary && to >= PRESENT) return true;
  return includeUndated;
}

export function periodLabel(code) {
  const meta = LANGUAGES[code] || {};
  return meta.era || (meta.contemporary ? "Contemporary reference location" : "Period not dated");
}
