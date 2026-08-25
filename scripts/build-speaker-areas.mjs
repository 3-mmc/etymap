import { gzipSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const input = resolve(process.argv[2] || "./languages.geojson");
const output = resolve(process.argv[3] || "./data/speaker-areas");
const tolerance = Number(process.argv[4] || 0.01);
const collection = JSON.parse(readFileSync(input, "utf8"));
const index = {};

mkdirSync(output, { recursive: true });

function squaredDistance(a, b) {
  const x = a[0] - b[0];
  const y = a[1] - b[1];
  return x * x + y * y;
}

function squaredSegmentDistance(point, start, end) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;
  if (dx || dy) {
    const ratio = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (ratio > 1) { x = end[0]; y = end[1]; }
    else if (ratio > 0) { x += dx * ratio; y += dy * ratio; }
  }
  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function simplifyPath(points, first, last, threshold, simplified) {
  let maximum = threshold;
  let split;
  for (let index = first + 1; index < last; index += 1) {
    const distance = squaredSegmentDistance(points[index], points[first], points[last]);
    if (distance > maximum) { split = index; maximum = distance; }
  }
  if (split !== undefined) {
    if (split - first > 1) simplifyPath(points, first, split, threshold, simplified);
    simplified.push(points[split]);
    if (last - split > 1) simplifyPath(points, split, last, threshold, simplified);
  }
}

function simplifyOpen(points, threshold) {
  if (points.length <= 2) return points;
  const result = [points[0]];
  simplifyPath(points, 0, points.length - 1, threshold, result);
  result.push(points.at(-1));
  return result;
}

function simplifyRing(rawRing) {
  const ring = rawRing.slice(0, -1).map(([x, y]) => [Number(x.toFixed(4)), Number(y.toFixed(4))]);
  if (ring.length < 8) return [...ring, ring[0]];
  let opposite = 1;
  for (let index = 2; index < ring.length; index += 1) {
    if (squaredDistance(ring[0], ring[index]) > squaredDistance(ring[0], ring[opposite])) opposite = index;
  }
  const threshold = tolerance * tolerance;
  const firstHalf = simplifyOpen(ring.slice(0, opposite + 1), threshold);
  const secondHalf = simplifyOpen([...ring.slice(opposite), ring[0]], threshold);
  const simplified = [...firstHalf, ...secondHalf.slice(1)];
  return simplified.length >= 4 ? simplified : [...ring, ring[0]];
}

function simplifyGeometry(geometry) {
  if (geometry.type === "Polygon") {
    return { ...geometry, coordinates: geometry.coordinates.map(simplifyRing) };
  }
  if (geometry.type === "MultiPolygon") {
    return { ...geometry, coordinates: geometry.coordinates.map((polygon) => polygon.map(simplifyRing)) };
  }
  return geometry;
}

for (const feature of collection.features || []) {
  const glottocode = feature.properties?.["cldf:languageReference"];
  if (!/^[a-z0-9]{8}$/.test(glottocode || "")) continue;
  const title = feature.properties?.title || glottocode;
  const shard = {
    type: "Feature",
    properties: {
      glottocode,
      title,
      family: feature.properties?.family || null,
      source: "asher2007world"
    },
    geometry: simplifyGeometry(feature.geometry)
  };
  const compressed = gzipSync(JSON.stringify(shard), { level: 9 });
  writeFileSync(resolve(output, `${glottocode}.json.gz`), compressed);
  index[glottocode] = { title, bytes: compressed.byteLength };
}

writeFileSync(resolve(output, "index.json"), `${JSON.stringify(index)}\n`);
const totalBytes = Object.values(index).reduce((sum, item) => sum + item.bytes, 0);
process.stdout.write(`Built ${Object.keys(index).length} speaker-area shards (${(totalBytes / 1024 / 1024).toFixed(1)} MiB compressed, ${tolerance}° simplification)\n`);
