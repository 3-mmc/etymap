export const LANGUAGES = {
  en: { name: "English", point: [52, -1], countries: ["United Kingdom", "United States of America", "Australia", "Canada"] },
  de: { name: "German", point: [51, 10], countries: ["Germany", "Austria", "Switzerland"] },
  nl: { name: "Dutch", point: [52.2, 5.4], countries: ["Netherlands", "Belgium"] },
  sv: { name: "Swedish", point: [62, 15], countries: ["Sweden"] },
  da: { name: "Danish", point: [56, 10], countries: ["Denmark"] },
  no: { name: "Norwegian", point: [62, 9], countries: ["Norway"] },
  is: { name: "Icelandic", point: [65, -19], countries: ["Iceland"] },
  fr: { name: "French", point: [46.5, 2.4], countries: ["France", "Belgium", "Canada"] },
  es: { name: "Spanish", point: [40, -4], countries: ["Spain", "Mexico", "Argentina", "Colombia", "Peru", "Chile"] },
  pt: { name: "Portuguese", point: [39.5, -8], countries: ["Portugal", "Brazil", "Angola", "Mozambique"] },
  it: { name: "Italian", point: [42.5, 12.5], countries: ["Italy"] },
  ro: { name: "Romanian", point: [46, 25], countries: ["Romania", "Moldova"] },
  ca: { name: "Catalan", point: [41.7, 1.6], countries: ["Spain", "Andorra"] },
  pl: { name: "Polish", point: [52, 19], countries: ["Poland"] },
  cs: { name: "Czech", point: [49.8, 15.5], countries: ["Czech Republic"] },
  sk: { name: "Slovak", point: [48.7, 19.5], countries: ["Slovakia"] },
  uk: { name: "Ukrainian", point: [49, 31], countries: ["Ukraine"] },
  ru: { name: "Russian", point: [57, 40], countries: ["Russia"] },
  be: { name: "Belarusian", point: [53, 28], countries: ["Belarus"] },
  bg: { name: "Bulgarian", point: [42.7, 25.5], countries: ["Bulgaria"] },
  sr: { name: "Serbo-Croatian", point: [44, 20.5], countries: ["Serbia", "Croatia", "Bosnia and Herzegovina", "Montenegro"] },
  sh: { name: "Serbo-Croatian", point: [44, 20.5], countries: ["Serbia", "Croatia", "Bosnia and Herzegovina", "Montenegro"] },
  sl: { name: "Slovene", point: [46.1, 14.8], countries: ["Slovenia"] },
  el: { name: "Greek", point: [39, 22], countries: ["Greece", "Cyprus"] },
  la: { name: "Latin", point: [41.9, 12.5], countries: [], historical: true, era: "c. 700 BCE–700 CE" },
  grc: { name: "Ancient Greek", point: [38, 23.7], countries: [], historical: true, era: "c. 800 BCE–600 CE" },
  ang: { name: "Old English", point: [52.5, -1], countries: [], historical: true, era: "c. 450–1150" },
  enm: { name: "Middle English", point: [52, -1.5], countries: [], historical: true, era: "c. 1100–1500" },
  goh: { name: "Old High German", point: [48.5, 10.5], countries: [], historical: true, era: "c. 500–1050" },
  fro: { name: "Old French", point: [48, 2], countries: [], historical: true, era: "c. 800–1400" },
  gem_pro: { name: "Proto-Germanic", point: [55, 10], countries: [], historical: true, era: "c. 500 BCE–200 CE" },
  "gem-pro": { name: "Proto-Germanic", point: [55, 10], countries: [], historical: true, era: "c. 500 BCE–200 CE" },
  "gmw-pro": { name: "Proto-West Germanic", point: [53, 8], countries: [], historical: true, era: "c. 100 BCE–400 CE" },
  "sla-pro": { name: "Proto-Slavic", point: [50.5, 29], countries: [], historical: true, era: "c. 500 BCE–600 CE" },
  cu: { name: "Church Slavonic", point: [50.5, 30.5], countries: [], historical: true, era: "c. 800–1100" },
  chu: { name: "Church Slavonic", point: [50.5, 30.5], countries: [], historical: true, era: "c. 800–1100" },
  "zlw-opl": { name: "Old Polish", point: [52, 19], countries: [], historical: true, era: "c. 1000–1500" },
  ar: { name: "Arabic", point: [25, 42], countries: ["Saudi Arabia", "Egypt", "Algeria", "Morocco", "Iraq", "Syria"] },
  tr: { name: "Turkish", point: [39, 35], countries: ["Turkey"] },
  fa: { name: "Persian", point: [32, 54], countries: ["Iran", "Afghanistan"] },
  he: { name: "Hebrew", point: [31.5, 35], countries: ["Israel"] },
  hi: { name: "Hindi", point: [24, 79], countries: ["India"] },
  bn: { name: "Bengali", point: [23.7, 90], countries: ["Bangladesh", "India"] },
  ur: { name: "Urdu", point: [30, 69], countries: ["Pakistan", "India"] },
  sa: { name: "Sanskrit", point: [25, 78], countries: [], historical: true, era: "c. 1500 BCE–1200 CE" },
  zh: { name: "Chinese", point: [34, 105], countries: ["China", "Taiwan"] },
  ja: { name: "Japanese", point: [37, 138], countries: ["Japan"] },
  ko: { name: "Korean", point: [37.5, 127.8], countries: ["South Korea", "North Korea"] },
  vi: { name: "Vietnamese", point: [16, 106], countries: ["Vietnam"] },
  th: { name: "Thai", point: [15, 101], countries: ["Thailand"] },
  id: { name: "Indonesian", point: [-2, 118], countries: ["Indonesia"] },
  ms: { name: "Malay", point: [4, 102], countries: ["Malaysia", "Brunei"] },
  sw: { name: "Swahili", point: [-6, 35], countries: ["Tanzania", "Kenya"] },
  fi: { name: "Finnish", point: [64, 26], countries: ["Finland"] },
  hu: { name: "Hungarian", point: [47, 19.5], countries: ["Hungary"] },
  et: { name: "Estonian", point: [58.6, 25.5], countries: ["Estonia"] },
  lv: { name: "Latvian", point: [57, 24.6], countries: ["Latvia"] },
  lt: { name: "Lithuanian", point: [55.2, 24], countries: ["Lithuania"] },
  ga: { name: "Irish", point: [53.2, -8], countries: ["Ireland"] },
  cy: { name: "Welsh", point: [52.2, -3.6], countries: ["United Kingdom"] }
};

export const CLUSTER_COLORS = ["#D7FF45", "#FF8068", "#78DCE1", "#B6A0FF", "#FFC857", "#F19BC2", "#8ED081"];

export const TYPE_LABELS = {
  inh: "inherited from",
  inherited: "inherited from",
  bor: "borrowed from",
  borrowed: "borrowed from",
  obor: "orthographic borrowing from",
  slbor: "semi-learned borrowing from",
  ubor: "unadapted borrowing from",
  abor: "adapted borrowing from",
  lbor: "learned borrowing from",
  learned_borrowing: "learned borrowing from",
  der: "derived from",
  derived: "derived from",
  cal: "calqued from",
  clq: "calqued from",
  pcal: "partly calqued from",
  sl: "semantic loan from"
};

export const DEMO_CHURCH = [
  { code: "en", term: "church", source: "grc", sourceName: "Ancient Greek" },
  { code: "de", term: "Kirche", source: "grc", sourceName: "Ancient Greek" },
  { code: "nl", term: "kerk", source: "grc", sourceName: "Ancient Greek" },
  { code: "sv", term: "kyrka", source: "grc", sourceName: "Ancient Greek" },
  { code: "pl", term: "cerkiew", source: "cu", sourceName: "Church Slavonic" },
  { code: "ru", term: "це́рковь", source: "cu", sourceName: "Church Slavonic" },
  { code: "uk", term: "це́рква", source: "cu", sourceName: "Church Slavonic" },
  { code: "fr", term: "église", source: "la", sourceName: "Latin" },
  { code: "es", term: "iglesia", source: "la", sourceName: "Latin" },
  { code: "pt", term: "igreja", source: "la", sourceName: "Latin" },
  { code: "it", term: "chiesa", source: "la", sourceName: "Latin" },
  { code: "el", term: "εκκλησία", source: "grc", sourceName: "Ancient Greek" }
];

export const DEMO_CERKIEW = [
  { code: "pl", term: "cerkiew", type: "current", era: "Modern", point: [52, 19] },
  { code: "sla-pro", term: "*cьrky", type: "inh", era: "c. 500 BCE–600 CE", point: [50.5, 29] },
  { code: "goh", term: "kirihha", type: "der", era: "c. 500–1050", point: [48.5, 10.5] },
  { code: "gmw-pro", term: "*kirikā", type: "der", era: "c. 100 BCE–400 CE", point: [53, 8] },
  { code: "grc", term: "κυριακόν", type: "der", era: "Late Antiquity", point: [40.5, 23] }
];

export function languageName(code) {
  return LANGUAGES[code]?.name || code.replaceAll("-", " ").toUpperCase();
}

export function wiktionaryUrl(term, languageCode) {
  const sectionName = LANGUAGES[languageCode]?.wiktionaryName || LANGUAGES[languageCode]?.name;
  const anchor = sectionName ? `#${sectionName.replaceAll(" ", "_")}` : "";
  if (term.startsWith("*") && sectionName) {
    const title = `Reconstruction:${sectionName}/${term.slice(1)}`;
    return `https://en.wiktionary.org/wiki/${encodeURIComponent(title).replaceAll("%2F", "/")}`;
  }
  return `https://en.wiktionary.org/wiki/${encodeURIComponent(term)}${anchor}`;
}
