// Snapshot of distinct Wiktionary codes in the largest parsed translation sense,
// checked through the revisions API (main entries and /translations subpages).
// These are suggestions, not a live coverage guarantee or a count of locations.
export const COVERAGE_DATE = "2026-09-06";
export const SUGGESTED_WORDS = [
  ["water",3600], ["dog",689], ["fish",680], ["eye",585],
  ["one",578], ["fire",541], ["blood",517], ["sun",452],
  ["two",471], ["moon",449], ["tree",446], ["bird",444],
  ["father",443], ["mother",438], ["star",430], ["hand",410],
  ["cat",410], ["night",377], ["name",374], ["church",240]
].map(([word,languages]) => ({word,languages}));
