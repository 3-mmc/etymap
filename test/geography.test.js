import test from "node:test";
import assert from "node:assert/strict";
import { assignEntriesToFeatures, parseCSVLine, pointInFeature, registerGlottologCSV } from "../src/geography.js";

test("parses quoted CLDF CSV cells", () => {
  assert.deepEqual(parseCSVLine('abcd1234,"Language, One",Africa,1.5,2.5'), [
    "abcd1234", "Language, One", "Africa", "1.5", "2.5"
  ]);
});

test("registers located ISO-coded languages from Glottolog", () => {
  const registry = {};
  const csv = "ID,Name,Macroarea,Latitude,Longitude,Glottocode,ISO639P3code,Level,Countries\nwash1253,Washo,North America,38.8,-119.6,wash1253,was,language,US";
  assert.equal(registerGlottologCSV(csv, registry), 1);
  assert.deepEqual(registry.was.point, [38.8, -119.6]);
  assert.equal(registry.was.glottocode, "wash1253");
});

test("assigns representative language points to nested polygon features", () => {
  const feature = {
    type: "Feature",
    properties: { name: "Test region" },
    geometry: { type: "Polygon", coordinates: [[[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]]] }
  };
  assert.equal(pointInFeature([0, 0], feature), true);
  assert.equal(pointInFeature([10, 10], feature), false);
  // English's built-in representative point is outside this deliberately tiny region.
  assignEntriesToFeatures([feature], [{ code: "en", term: "word" }]);
  assert.equal(feature.properties._etymonEntries.length, 0);
});
