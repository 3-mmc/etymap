import { LANGUAGES } from "./data.js";

const GLOTTOLOG_URL = "https://cdn.jsdelivr.net/gh/glottolog/glottolog-cldf@master/cldf/languages.csv";
const GEOBOUNDARIES_API = "https://www.geoboundaries.org/api/current/gbOpen";
const SPEAKER_AREA_INDEX_URL = new URL("../data/speaker-areas/index.json", import.meta.url);
let glottologPromise;
let speakerAreaIndexPromise;
const speakerAreaCache = new Map();
const SPEAKER_CACHE_LIMIT = 80;

export function parseCSVLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(value);
      value = "";
    } else value += character;
  }
  cells.push(value);
  return cells;
}

export function registerGlottologCSV(csv, registry = LANGUAGES) {
  const lines = csv.split(/\r?\n/);
  const headers = parseCSVLine(lines.shift() || "");
  const column = Object.fromEntries(headers.map((name, index) => [name, index]));
  let added = 0;
  for (const line of lines) {
    if (!line) continue;
    const row = parseCSVLine(line);
    const code = row[column.ISO639P3code];
    const latitude = Number(row[column.Latitude]);
    const longitude = Number(row[column.Longitude]);
    if (!code || row[column.Level] !== "language" || !row[column.Latitude]?.trim() || !row[column.Longitude]?.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const existing = registry[code] || {};
    registry[code] = {
      ...existing,
      name: existing.name || row[column.Name],
      point: existing.point || [latitude, longitude],
      glottocode: row[column.Glottocode],
      macroarea: row[column.Macroarea],
      countryCodes: (row[column.Countries] || "").split(";").filter(Boolean),
      locationSource: existing.locationSource || "Glottolog"
    };
    added += 1;
  }
  return added;
}

export function loadGlottolog() {
  if (!glottologPromise) {
    glottologPromise = fetch(GLOTTOLOG_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Glottolog returned ${response.status}`);
        return response.text();
      })
      .then((csv) => registerGlottologCSV(csv))
      .catch((error) => {
        glottologPromise = null;
        throw error;
      });
  }
  return glottologPromise;
}

function pointInRing([longitude, latitude], ring) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const [currentX, currentY] = ring[current];
    const [previousX, previousY] = ring[previous];
    const intersects = ((currentY > latitude) !== (previousY > latitude))
      && (longitude < ((previousX - currentX) * (latitude - currentY)) / ((previousY - currentY) || Number.EPSILON) + currentX);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, coordinates) {
  if (!pointInRing(point, coordinates[0] || [])) return false;
  return !coordinates.slice(1).some((hole) => pointInRing(point, hole));
}

export function pointInFeature(point, feature) {
  if (!point || !feature?.geometry) return false;
  const longitudeLatitude = [point[1], point[0]];
  if (feature.geometry.type === "Polygon") return pointInPolygon(longitudeLatitude, feature.geometry.coordinates);
  if (feature.geometry.type === "MultiPolygon") {
    return feature.geometry.coordinates.some((polygon) => pointInPolygon(longitudeLatitude, polygon));
  }
  return false;
}

export function assignEntriesToFeatures(features, entries) {
  for (const feature of features) {
    feature.properties ||= {};
    feature.properties._etymonEntries = entries.filter((entry) => pointInFeature(LANGUAGES[entry.code]?.point, feature));
  }
  return features;
}

export async function fetchAdministrativeBoundaries(iso3, level) {
  const response = await fetch(`${GEOBOUNDARIES_API}/${iso3}/ADM${level}/`);
  if (!response.ok) throw new Error(`No ADM${level} boundary layer is available`);
  const metadata = await response.json();
  const url = metadata.simplifiedGeometryGeoJSON || metadata.gjDownloadURL;
  if (!url) throw new Error(`ADM${level} boundary metadata has no GeoJSON URL`);
  const geoResponse = await fetch(url);
  if (!geoResponse.ok) throw new Error(`ADM${level} GeoJSON returned ${geoResponse.status}`);
  return geoResponse.json();
}

export async function loadSpeakerArea(glottocode) {
  if (!glottocode) return null;
  if (!speakerAreaIndexPromise) {
    speakerAreaIndexPromise = fetch(SPEAKER_AREA_INDEX_URL)
      .then((response) => {
        if (!response.ok) throw new Error("Speaker-area index is unavailable");
        return response.json();
      }).catch((error) => { speakerAreaIndexPromise=null; throw error; });
  }
  const index = await speakerAreaIndexPromise;
  if (!index[glottocode]) return null;
  if (!speakerAreaCache.has(glottocode)) {
    speakerAreaCache.set(glottocode, (async () => {
      const url = new URL(`../data/speaker-areas/${glottocode}.json.gz`, import.meta.url);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Speaker area returned ${response.status}`);
      if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot decompress speaker-area vectors");
      const decompressed = response.body.pipeThrough(new DecompressionStream("gzip"));
      return new Response(decompressed).json();
    })().catch((error) => { speakerAreaCache.delete(glottocode); throw error; }));
  }
  const promise=speakerAreaCache.get(glottocode);
  speakerAreaCache.delete(glottocode);speakerAreaCache.set(glottocode,promise);
  while(speakerAreaCache.size>SPEAKER_CACHE_LIMIT) speakerAreaCache.delete(speakerAreaCache.keys().next().value);
  return promise;
}

export function featureName(feature) {
  return feature?.properties?.shapeName
    || feature?.properties?.name
    || feature?.properties?.ADMIN
    || feature?.properties?.NAME
    || "Unnamed region";
}

export function featureIso3(feature) {
  return feature?.id
    || feature?.properties?.shapeGroup
    || feature?.properties?.ISO_A3
    || feature?.properties?.iso_a3
    || "";
}

export const GEOGRAPHY_SOURCES = { GLOTTOLOG_URL, GEOBOUNDARIES_API, SPEAKER_AREA_INDEX_URL };
