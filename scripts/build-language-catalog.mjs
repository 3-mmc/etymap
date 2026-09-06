import { writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { parseCSVLine } from "../src/geography.js";

const sources = {
  wiktionary: "https://en.wiktionary.org/w/index.php?title=Module:languages/code_to_canonical_name&action=raw",
  glottolog: "https://raw.githubusercontent.com/glottolog/glottolog-cldf/master/cldf/languages.csv",
  wals: "https://raw.githubusercontent.com/cldf-datasets/wals/master/cldf/languages.csv",
  iso: "https://iso639-3.sil.org/sites/iso639-3/files/downloads/iso-639-3.tab"
};
const inputs = Object.fromEntries(await Promise.all(Object.entries(sources).map(async ([key, url]) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${key}: ${response.status}`);
  return [key, await response.text()];
})));
function rows(text, separator) {
  const lines = text.trim().split(/\r?\n/);
  const parse = separator ? (line) => line.split(separator) : parseCSVLine;
  const keys = parse(lines.shift());
  return lines.map((line) => Object.fromEntries(parse(line).map((value, i) => [keys[i], value])));
}
const isoRows = rows(inputs.iso, "\t");
const byIso = new Map(isoRows.map((r) => [r.Id, r]));
const twoLetter = new Map(isoRows.filter((r) => r.Part1).map((r) => [r.Part1, r.Id]));
const glottolog = rows(inputs.glottolog).filter((r) => r.Level !== "family");
const glottoByIso = new Map(glottolog.filter((r) => r.ISO639P3code && r.Level === "language").map((r) => [r.ISO639P3code, r]));
const glottoByName = new Map(glottolog.map((r) => [r.Name.toLowerCase(), r]));
const wals = rows(inputs.wals).filter((r) => !r.ID.startsWith("genus-"));
const catalog = {};
for (const match of inputs.wiktionary.matchAll(/\["([a-z0-9-]+)"\]\s*=\s*("(?:[^"\\]|\\.)*")/g)) {
  const code = match[1];
  const name = JSON.parse(match[2]);
  const iso = twoLetter.get(code) || (code === "sh" ? "hbs" : code);
  const isoRecord = byIso.get(iso);
  const geo = glottoByIso.get(iso) || glottoByName.get(name.toLowerCase());
  const profiles = wals.filter((r) => geo?.Glottocode ? r.Glottocode === geo.Glottocode : r.ISO639P3code === iso);
  const meta = { name, wiktionaryName: name };
  if (isoRecord) meta.iso = iso;
  if (isoRecord?.Language_Type) meta.languageType = isoRecord.Language_Type;
  if (["A", "H", "E"].includes(meta.languageType) || name.startsWith("Proto-")) meta.historical = true;
  if (meta.languageType === "L") meta.contemporary = true;
  if (geo) {
    meta.glottocode = geo.Glottocode;
    meta.macroarea = geo.Macroarea;
    if (geo.Latitude.trim() && geo.Longitude.trim() && Number.isFinite(+geo.Latitude) && Number.isFinite(+geo.Longitude)) {
      meta.point = [+geo.Latitude, +geo.Longitude];
      meta.locationSource = "Glottolog";
    }
  }
  if (profiles.length) {
    meta.wals = profiles.map((r) => ({ id:r.ID, name:r.Name, family:r.Family, genus:r.Genus }));
    const located = profiles.find((r) => r.Latitude?.trim() && r.Longitude?.trim() && Number.isFinite(+r.Latitude) && Number.isFinite(+r.Longitude));
    if (!meta.point && located) {
      meta.point = [+located.Latitude, +located.Longitude];
      meta.locationSource = "WALS representative location";
    }
  }
  catalog[code] = meta;
}
if (Object.keys(catalog).length < 7000 || !catalog.sux || !catalog.akk) throw new Error("Language source format changed");
const stats = {
  generated: new Date().toISOString(),
  languages: Object.keys(catalog).length,
  located: Object.values(catalog).filter((m) => m.point).length,
  walsLinked: Object.values(catalog).filter((m) => m.wals?.length).length,
  sources: Object.fromEntries(Object.entries(sources).map(([key, url]) => [key, {url, sha256:createHash("sha256").update(inputs[key]).digest("hex")}]))
};
await writeFile(new URL("../data/languages.json.gz", import.meta.url), gzipSync(JSON.stringify(catalog), {level:9}));
await writeFile(new URL("../data/language-catalog.json", import.meta.url), JSON.stringify(stats, null, 2) + "\n");
console.log(stats);
