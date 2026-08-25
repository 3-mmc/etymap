import {
  CLUSTER_COLORS, DEMO_CERKIEW, DEMO_CHURCH, LANGUAGES, TYPE_LABELS,
  languageName, wiktionaryUrl
} from "./data.js";
import {
  assignEntriesToFeatures, featureIso3, featureName, fetchAdministrativeBoundaries, loadGlottolog, loadSpeakerArea
} from "./geography.js";
import {
  buildJourney, chooseCluster, enrichTranslations, fetchWikitext, parseEtymology, parseTranslations
} from "./wiktionary.js";

const WORLD_URL = "https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json";
const state = {
  mode: "compare",
  map: null,
  countryLayer: null,
  adminLayer: null,
  speakerLayer: null,
  markers: null,
  badges: null,
  countryColors: new Map(),
  worldFeatures: [],
  worldLayers: new Map(),
  journeyNodes: [],
  lastComparison: DEMO_CHURCH,
  clusters: new Map(),
  concept: "church",
  source: "demo",
  drill: null,
  drillRevision: 0,
  searchRevision: 0
};

const ui = {
  tabs: [...document.querySelectorAll(".mode-tab")],
  compareForm: document.querySelector("#compare-form"),
  journeyForm: document.querySelector("#journey-form"),
  concept: document.querySelector("#concept-input"),
  word: document.querySelector("#word-input"),
  language: document.querySelector("#language-select"),
  kicker: document.querySelector("#map-kicker"),
  title: document.querySelector("#map-title"),
  status: document.querySelector("#live-status"),
  storyIndex: document.querySelector("#story-index"),
  story: document.querySelector("#story-content"),
  storyPanel: document.querySelector(".story-panel"),
  collapse: document.querySelector("#collapse-story"),
  message: document.querySelector("#map-message"),
  lines: document.querySelector("#journey-lines"),
  drilldown: document.querySelector("#map-drilldown"),
  back: document.querySelector("#map-back"),
  place: document.querySelector("#map-place")
};

function escapeHTML(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

function setStatus(label, kind = "live") {
  ui.status.className = `live-status ${kind}`;
  ui.status.innerHTML = `<i></i>${escapeHTML(label)}`;
}

function showMessage(message) {
  ui.message.textContent = message;
  ui.message.classList.remove("hidden");
  window.setTimeout(() => ui.message.classList.add("hidden"), 6000);
}

function initLanguageSelect() {
  const modern = Object.entries(LANGUAGES)
    .filter(([, item]) => !item.historical)
    .sort((a, b) => a[1].name.localeCompare(b[1].name));
  for (const [code, item] of modern) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = item.name;
    option.selected = code === "pl";
    ui.language.append(option);
  }
}

function initMap() {
  if (!window.L) {
    document.querySelector("#map").innerHTML = '<p class="map-message">The map library could not load. Check your connection and reload.</p>';
    return;
  }
  state.map = window.L.map("map", {
    center: [27, 10], zoom: 2, minZoom: 1, maxZoom: 9,
    zoomControl: true, worldCopyJump: true, attributionControl: false
  });
  state.markers = window.L.layerGroup().addTo(state.map);
  state.badges = window.L.layerGroup().addTo(state.map);
  state.map.on("zoom move resize", drawJourneyLines);
  state.map.on("zoomend", () => {
    if (state.mode === "compare" && !state.drill) renderComparisonGeography();
  });
  loadBoundaries();
}

async function loadBoundaries() {
  try {
    const response = await fetch(WORLD_URL);
    if (!response.ok) throw new Error("Boundary download failed");
    const geojson = await response.json();
    state.worldFeatures = geojson.features;
    state.countryLayer = window.L.geoJSON(geojson, {
      style: boundaryStyle,
      onEachFeature(feature, layer) {
        state.worldLayers.set(feature, layer);
        layer.on({
          mouseover: (event) => event.target.setStyle({ weight: 1.4, fillOpacity: .82 }),
          mouseout: (event) => state.countryLayer.resetStyle(event.target),
          click: () => {
            const entries = feature.properties?._etymonEntries || [];
            if (state.mode === "compare" && entries.length) openCountry(feature, layer, entries);
          }
        });
      }
    }).addTo(state.map);
    state.countryLayer.bringToBack();
    if (state.mode === "compare") renderComparisonGeography();
  } catch {
    showMessage("Country boundaries are unavailable; language locations still work.");
  }
}

function boundaryStyle(feature) {
  const color = state.countryColors.get(featureName(feature));
  const count = feature.properties?._etymonEntries?.length || 0;
  return {
    color: count ? "#202d31" : "rgba(241,239,230,.22)",
    weight: count ? 1 : .55,
    fillColor: color || "#364348",
    fillOpacity: count ? .7 : .6
  };
}

function refreshBoundaries() {
  if (state.countryLayer) state.countryLayer.setStyle(boundaryStyle);
}

function clearMap({ preserveDrill = false } = {}) {
  state.markers?.clearLayers();
  state.badges?.clearLayers();
  state.countryColors.clear();
  state.journeyNodes = [];
  ui.lines.innerHTML = "";
  if (!preserveDrill) resetDrill(false);
}

function resetDrill(move = true) {
  state.drillRevision += 1;
  if (state.adminLayer) state.map?.removeLayer(state.adminLayer);
  if (state.speakerLayer) state.map?.removeLayer(state.speakerLayer);
  state.adminLayer = null;
  state.speakerLayer = null;
  state.drill = null;
  ui.drilldown.classList.add("hidden");
  if (state.countryLayer && !state.map.hasLayer(state.countryLayer)) state.countryLayer.addTo(state.map);
  if (move) state.map?.setView([28, 12], 2, { animate: true });
  if (state.mode === "compare") renderComparisonGeography();
}

function makePopup(item, color) {
  const wrapper = document.createElement("div");
  wrapper.className = "etymon-popup";
  const language = document.createElement("div");
  language.className = "popup-lang";
  language.textContent = languageName(item.code);
  const link = document.createElement("a");
  link.href = wiktionaryUrl(item.term, item.code);
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = item.term;
  link.style.textDecorationColor = color;
  const detail = document.createElement("p");
  detail.textContent = item.sourceName && item.sourceName !== "No explicit source"
    ? `Etymology grouped by ${item.sourceName}` : "No explicit source template found";
  const action = document.createElement("a");
  action.className = "popup-action";
  action.href = link.href;
  action.target = "_blank";
  action.rel = "noreferrer";
  action.textContent = "Open Wiktionary entry ↗";
  wrapper.append(language, link, detail, action);
  return wrapper;
}

function makeWordLabel(item, color) {
  const chip = document.createElement("a");
  chip.className = "word-chip";
  chip.style.setProperty("--chip", color);
  chip.href = wiktionaryUrl(item.term, item.code);
  chip.target = "_blank";
  chip.rel = "noreferrer";
  chip.title = `Open ${item.term} in Wiktionary`;
  chip.addEventListener("click", (event) => event.stopPropagation());
  const word = document.createElement("b");
  word.textContent = item.term;
  const lang = document.createElement("small");
  lang.textContent = `${languageName(item.code)} ↗`;
  chip.append(word, lang);
  return chip;
}

function addWordMarker(item, permanent = true) {
  const meta = LANGUAGES[item.code];
  if (!meta?.point) return;
  const color = item._color || CLUSTER_COLORS[0];
  const marker = window.L.circleMarker(meta.point, {
    radius: 6, color: "#202d31", weight: 2, fillColor: color, fillOpacity: 1
  }).addTo(state.markers);
  marker.bindPopup(makePopup(item, color));
  marker.bindTooltip(makeWordLabel(item, color), {
    permanent, interactive: true,
    direction: meta.point[1] > 70 ? "left" : "right",
    offset: [5, 0], className: "word-label", opacity: 1
  });
}

function addRegionBadge(feature, layer, entries, onClick, levelLabel) {
  if (!entries.length) return;
  const name = featureName(feature);
  const center = layer.getBounds().getCenter();
  const icon = window.L.divIcon({
    className: "region-cluster-wrap",
    html: `<button class="region-cluster" aria-label="Zoom to ${escapeHTML(name)}, ${entries.length} entries"><b>${entries.length}</b><span>${escapeHTML(name)}</span><small>${escapeHTML(levelLabel)} · zoom in</small></button>`,
    iconSize: [112, 62], iconAnchor: [56, 31]
  });
  const marker = window.L.marker(center, { icon, zIndexOffset: 300 }).addTo(state.badges);
  marker.on("click", onClick);
}

function assignWorldEntries(items) {
  if (!state.worldFeatures.length) return;
  assignEntriesToFeatures(state.worldFeatures, items);
  for (const feature of state.worldFeatures) {
    const entries = feature.properties._etymonEntries || [];
    if (!entries.length) continue;
    const dominant = entries.reduce((counts, entry) => counts.set(entry._color, (counts.get(entry._color) || 0) + 1), new Map());
    const color = [...dominant.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    state.countryColors.set(featureName(feature), color);
  }
  refreshBoundaries();
}

function renderComparisonGeography() {
  if (state.mode !== "compare" || state.drill) return;
  state.markers.clearLayers();
  state.badges.clearLayers();
  assignWorldEntries(state.lastComparison);
  if (!state.worldFeatures.length || state.map.getZoom() >= 3.4) {
    for (const item of state.lastComparison) addWordMarker(item, state.map.getZoom() >= 4);
    return;
  }
  for (const feature of state.worldFeatures) {
    const entries = feature.properties?._etymonEntries || [];
    const layer = state.worldLayers.get(feature);
    if (layer && entries.length) addRegionBadge(feature, layer, entries, () => openCountry(feature, layer, entries), "country");
  }
}

function renderComparison(items, concept, source = "live") {
  clearMap();
  state.lastComparison = items.filter((item) => LANGUAGES[item.code]?.point);
  state.concept = concept;
  state.source = source;
  const sources = [...new Set(state.lastComparison.map((item) => item.source || item.code))];
  const colorBySource = new Map(sources.map((key, index) => [key, CLUSTER_COLORS[index % CLUSTER_COLORS.length]]));
  const clusters = new Map();
  for (const item of state.lastComparison) {
    const clusterKey = item.source || item.code;
    item._color = colorBySource.get(clusterKey);
    const cluster = clusters.get(clusterKey) || { color: item._color, label: item.sourceName || languageName(clusterKey), count: 0 };
    cluster.count += 1;
    clusters.set(clusterKey, cluster);
  }
  state.clusters = clusters;
  renderComparisonGeography();
  state.countryLayer?.bringToBack();
  state.map?.setView([28, 12], 2, { animate: false });
  ui.kicker.textContent = "Country counts · click to reveal subregions";
  ui.title.textContent = `How the world says “${concept}”`;
  renderComparisonStory(state.lastComparison, clusters, concept, source);
}

function entryLinks(items, limit = 18) {
  return items.slice(0, limit).map((item) => `
    <a class="entry-link" href="${wiktionaryUrl(item.term, item.code)}" target="_blank" rel="noreferrer">
      <b>${escapeHTML(item.term)}</b><span>${escapeHTML(languageName(item.code))} ↗</span>
    </a>`).join("");
}

function renderComparisonStory(items, clusters, concept, source) {
  ui.storyIndex.textContent = "01 / OVERVIEW";
  const largest = [...clusters.values()].sort((a, b) => b.count - a.count)[0];
  const clusterHTML = [...clusters.values()].sort((a, b) => b.count - a.count).map((cluster) => `
    <li style="--color:${cluster.color}"><i></i><b>${escapeHTML(cluster.label)}</b><small>${cluster.count} ${cluster.count === 1 ? "word" : "words"}</small></li>
  `).join("");
  ui.story.innerHTML = `
    <p class="story-lede"><em>${escapeHTML(concept)}</em> crosses the map in ${items.length} located forms${largest ? `, with the largest visible group linked to ${escapeHTML(largest.label)}` : ""}.</p>
    <div class="stat-row"><div class="stat"><b>${items.length}</b><span>locations mapped</span></div><div class="stat"><b>${clusters.size}</b><span>source groups</span></div></div>
    <div class="legend-title">Open a Wiktionary entry</div>
    <div class="entry-links">${entryLinks(items)}</div>
    ${items.length > 18 ? `<p class="source-caveat">Zoom into a region to see its remaining ${items.length - 18} entries.</p>` : ""}
    <div class="legend-title spaced">Shared source in entry</div>
    <ul class="cluster-list">${clusterHTML}</ul>
    <p class="source-caveat">${source === "demo" ? "Showing a curated preview while Wiktionary loads. " : ""}Glottolog points are representative locations, not complete speaker territories. Colours group the first explicit Wiktionary source template.</p>`;
}

function renderRegionStory(name, entries, level) {
  ui.storyIndex.textContent = `01 / ${level.toUpperCase()}`;
  ui.story.innerHTML = `
    <p class="story-lede"><em>${escapeHTML(name)}</em> contains ${entries.length} mapped ${entries.length === 1 ? "entry" : "entries"} for “${escapeHTML(state.concept)}”.</p>
    <div class="legend-title">Open in Wiktionary</div>
    <div class="entry-links">${entryLinks(entries, 60)}</div>
    <p class="source-caveat">Click a numbered subregion to continue inward. Locations come from Glottolog; administrative containment is computed from the representative point.</p>`;
}

function balancedEtymologySample(items, limit = 49) {
  const groups = new Map();
  for (const item of items) {
    const area = LANGUAGES[item.code]?.macroarea || "Unspecified";
    const group = groups.get(area) || [];
    group.push(item);
    groups.set(area, group);
  }
  const sample = [];
  const queues = [...groups.values()];
  while (sample.length < limit && queues.some((queue) => queue.length)) {
    for (const queue of queues) {
      if (queue.length && sample.length < limit) sample.push(queue.shift());
    }
  }
  return sample;
}

async function openCountry(feature, layer, entries) {
  const iso3 = featureIso3(feature);
  if (!iso3 || iso3.length !== 3) {
    state.map.fitBounds(layer.getBounds(), { padding: [50, 50] });
    showWordsInBounds(entries, featureName(feature));
    return;
  }
  state.drill = { iso3, level: 1, trail: [featureName(feature)], entries };
  ui.drilldown.classList.remove("hidden");
  ui.place.textContent = `${featureName(feature)} / ADM1`;
  state.map.fitBounds(layer.getBounds(), { padding: [35, 35], maxZoom: 5 });
  renderRegionStory(featureName(feature), entries, "country");
  await openAdministrativeLevel(iso3, 1, entries, featureName(feature));
}

async function openAdministrativeLevel(iso3, level, entries, parentName) {
  const revision = ++state.drillRevision;
  setStatus(`Loading ADM${level} boundaries…`, "loading");
  try {
    const geojson = await fetchAdministrativeBoundaries(iso3, level);
    if (revision !== state.drillRevision || state.mode !== "compare") return;
    assignEntriesToFeatures(geojson.features, entries);
    const matched = geojson.features.filter((feature) => feature.properties?._etymonEntries?.length);
    if (!matched.length) throw new Error("No entries fall inside this boundary layer");
    if (state.adminLayer) state.map.removeLayer(state.adminLayer);
    state.markers.clearLayers();
    state.badges.clearLayers();
    if (state.countryLayer && state.map.hasLayer(state.countryLayer)) state.map.removeLayer(state.countryLayer);
    state.adminLayer = window.L.geoJSON({ type: "FeatureCollection", features: matched }, {
      style: (feature) => ({ color: "rgba(241,239,230,.75)", weight: 1.2, fillColor: feature.properties._etymonEntries[0]._color, fillOpacity: .5 }),
      onEachFeature(feature, regionLayer) {
        const regionEntries = feature.properties._etymonEntries;
        regionLayer.on("mouseover", () => regionLayer.setStyle({ fillOpacity: .75, weight: 2 }));
        regionLayer.on("mouseout", () => state.adminLayer.resetStyle(regionLayer));
        regionLayer.on("click", () => openSubregion(feature, regionLayer, regionEntries, iso3, level));
      }
    }).addTo(state.map);
    state.adminLayer.eachLayer((regionLayer) => {
      const feature = regionLayer.feature;
      const regionEntries = feature.properties._etymonEntries;
      addRegionBadge(feature, regionLayer, regionEntries, () => openSubregion(feature, regionLayer, regionEntries, iso3, level), `ADM${level}`);
    });
    state.drill = { iso3, level, trail: [...(state.drill?.trail || [parentName])], entries };
    ui.place.textContent = `${state.drill.trail.join(" / ")} / ADM${level}`;
    setStatus("Glottolog + Wiktionary", "live");
    if (level === 1) renderSpeakerAreas(entries, revision);
  } catch (error) {
    if (revision !== state.drillRevision || state.mode !== "compare") return;
    setStatus("Representative locations", "error");
    showMessage(`${error.message}. Showing the individual language locations instead.`);
    showWordsInBounds(entries, parentName);
  }
}

async function renderSpeakerAreas(entries, revision) {
  const located = entries.filter((entry) => LANGUAGES[entry.code]?.glottocode);
  if (!located.length) return;
  setStatus("Loading speaker-area vectors…", "loading");
  try {
    const results = await Promise.all(located.map(async (entry) => ({
      entry,
      feature: await loadSpeakerArea(LANGUAGES[entry.code].glottocode)
    })));
    if (revision !== state.drillRevision || state.mode !== "compare") return;
    const features = results.filter((result) => result.feature).map(({ entry, feature }) => ({
      ...feature,
      properties: { ...feature.properties, _color: entry._color, _term: entry.term, _language: languageName(entry.code) }
    }));
    if (!features.length) {
      setStatus("Representative locations", "live");
      return;
    }
    if (state.speakerLayer) state.map.removeLayer(state.speakerLayer);
    state.speakerLayer = window.L.geoJSON({ type: "FeatureCollection", features }, {
      interactive: false,
      style: (feature) => ({
        color: feature.properties._color,
        weight: 1.4,
        fillColor: feature.properties._color,
        fillOpacity: .28,
        dashArray: "5 4"
      })
    }).addTo(state.map);
    state.badges.bringToFront?.();
    ui.kicker.textContent = `${features.length} contemporary speaker ${features.length === 1 ? "area" : "areas"} · click a subregion to continue`;
    setStatus("Glottography speaker areas", "live");
  } catch (error) {
    if (revision !== state.drillRevision) return;
    setStatus("Representative locations", "error");
    showMessage(`${error.message}. Administrative drill-down remains available.`);
  }
}

function openSubregion(feature, layer, entries, iso3, level) {
  const name = featureName(feature);
  state.map.fitBounds(layer.getBounds(), { padding: [50, 50], maxZoom: Math.min(7, level + 4) });
  renderRegionStory(name, entries, `ADM${level}`);
  state.drill.trail = [...state.drill.trail.slice(0, level), name];
  ui.place.textContent = state.drill.trail.join(" / ");
  if (entries.length === 1 || level >= 3) showWordsInBounds(entries, name);
  else openAdministrativeLevel(iso3, level + 1, entries, name);
}

function showWordsInBounds(entries, name) {
  if (state.adminLayer) state.adminLayer.setStyle({ fillOpacity: .25 });
  state.badges.clearLayers();
  state.markers.clearLayers();
  for (const item of entries) addWordMarker(item, true);
  ui.place.textContent = `${state.drill?.trail?.join(" / ") || name} / entries`;
  renderRegionStory(name, entries, "entries");
}

async function loadComparison(concept) {
  const clean = concept.trim();
  if (!clean) return;
  const revision = ++state.searchRevision;
  setStatus("Loading language geography…", "loading");
  try {
    const [, page] = await Promise.all([loadGlottolog(), fetchWikitext(clean)]);
    if (revision !== state.searchRevision) return;
    if (!page) throw new Error(`No Wiktionary entry for “${clean}”`);
    const translations = parseTranslations(page.text)
      .filter((item) => LANGUAGES[item.code]?.point)
      .slice(0, 180);
    if (!translations.length) throw new Error("No located translations were found in the English entry");
    const pending = translations.map((item) => ({
      ...item, source: "unresolved", sourceName: "Etymology not loaded", type: "unknown", edges: []
    }));
    renderComparison(pending, clean, "live");
    setStatus("Reading etymologies…", "loading");
    const ownEdges = parseEtymology(page.text, "en");
    const ownCluster = chooseCluster(ownEdges, "en");
    const enriched = await enrichTranslations(balancedEtymologySample(translations));
    if (revision !== state.searchRevision) return;
    const enrichedByCode = new Map(enriched.map((item) => [item.code, item]));
    const located = translations.map((item) => enrichedByCode.get(item.code) || {
      ...item, source: "unresolved", sourceName: "Etymology not loaded", type: "unknown", edges: []
    });
    renderComparison([{ code: "en", term: clean, language: "English", ...ownCluster, edges: ownEdges }, ...located], clean, "live");
    setStatus("Glottolog + Wiktionary", "live");
  } catch (error) {
    if (revision !== state.searchRevision) return;
    setStatus("Preview data", "error");
    if (clean.toLowerCase() === "church") {
      renderComparison(DEMO_CHURCH, "church", "demo");
      showMessage(`${error.message}. Keeping the curated church preview.`);
    } else showMessage(`${error.message}. Try an English lemma with a translation table.`);
  }
}

function journeyTooltip(node, index) {
  return makePopup({ code: node.code, term: node.term, sourceName: node.era }, CLUSTER_COLORS[index % CLUSTER_COLORS.length]);
}

function renderJourney(nodes, word, languageCode, source = "live") {
  clearMap();
  state.journeyNodes = nodes.filter((node) => node.point);
  refreshBoundaries();
  const bounds = [];
  state.journeyNodes.forEach((node, index) => {
    bounds.push(node.point);
    const icon = window.L.divIcon({ className: "journey-node", html: String(index + 1), iconSize: [28, 28] });
    const marker = window.L.marker(node.point, { icon, zIndexOffset: 500 - index }).addTo(state.markers);
    marker.bindPopup(journeyTooltip(node, index));
    marker.bindTooltip(makeWordLabel(node, CLUSTER_COLORS[index % CLUSTER_COLORS.length]), {
      permanent: true, interactive: true, direction: index % 2 ? "left" : "right",
      offset: [index % 2 ? -12 : 12, 0], className: "word-label", opacity: 1
    });
  });
  if (bounds.length > 1) state.map.fitBounds(bounds, { padding: [80, 90], maxZoom: 4, animate: false });
  else if (bounds[0]) state.map.setView(bounds[0], 4, { animate: false });
  window.setTimeout(drawJourneyLines, 0);
  ui.kicker.textContent = `${languageName(languageCode)} · ${nodes.length} attested stages`;
  ui.title.textContent = `The journey of “${word}”`;
  renderJourneyStory(nodes, source);
}

function drawJourneyLines() {
  if (state.mode !== "journey" || !state.map || state.journeyNodes.length < 2) {
    ui.lines.innerHTML = "";
    return;
  }
  const size = state.map.getSize();
  ui.lines.setAttribute("viewBox", `0 0 ${size.x} ${size.y}`);
  const parts = ['<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto"><path class="journey-arrow" d="M0,0 L0,6 L8,3 z" /></marker></defs>'];
  for (let index = 0; index < state.journeyNodes.length - 1; index += 1) {
    const from = state.map.latLngToContainerPoint(state.journeyNodes[index].point);
    const to = state.map.latLngToContainerPoint(state.journeyNodes[index + 1].point);
    const bend = Math.max(28, Math.abs(to.x - from.x) * .25);
    parts.push(`<path class="journey-line" d="M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${Math.min(from.y, to.y) - bend} ${to.x} ${to.y}" marker-end="url(#arrow)" />`);
  }
  ui.lines.innerHTML = parts.join("");
}

function renderJourneyStory(nodes, source) {
  ui.storyIndex.textContent = "02 / LINEAGE";
  const items = nodes.map((node, index) => `<li>
    <span class="number">${index + 1}</span>
    <a href="${wiktionaryUrl(node.term, node.code)}" target="_blank" rel="noreferrer">${escapeHTML(node.term)}</a>
    <span class="language">${escapeHTML(languageName(node.code))} · ${escapeHTML(node.era || "Earlier form")}</span>
    <span class="relation">${escapeHTML(index === 0 ? "the word today" : (TYPE_LABELS[node.type] || "derived from"))}</span>
  </li>`).join("");
  ui.story.innerHTML = `<p class="story-lede">Follow the forms from the present word toward its <em>earlier recorded sources.</em></p>
    <ol class="journey-list">${items}</ol>
    <p class="source-caveat">${source === "demo" ? "This is a curated fallback lineage. " : "Relationships are parsed from explicit Wiktionary templates. "}Dates and points are approximate historical context.</p>`;
}

async function loadJourney(word, languageCode) {
  const clean = word.trim();
  if (!clean) return;
  setStatus("Reading Wiktionary…", "loading");
  try {
    const page = await fetchWikitext(clean);
    if (!page) throw new Error(`No Wiktionary entry for “${clean}”`);
    const nodes = buildJourney(clean, languageCode, page.text);
    if (nodes.length < 2) throw new Error(`No explicit etymology chain found for ${languageName(languageCode)} “${clean}”`);
    renderJourney(nodes, clean, languageCode, "live");
    setStatus("Live Wiktionary data", "live");
  } catch (error) {
    setStatus("Preview data", "error");
    if (clean.toLocaleLowerCase() === "cerkiew" && languageCode === "pl") {
      renderJourney(DEMO_CERKIEW, "cerkiew", "pl", "demo");
      showMessage(`${error.message}. Keeping the curated cerkiew preview.`);
    } else showMessage(`${error.message}. Try another lemma/language pair.`);
  }
}

function switchMode(mode) {
  state.mode = mode;
  ui.tabs.forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  ui.compareForm.classList.toggle("hidden", mode !== "compare");
  ui.journeyForm.classList.toggle("hidden", mode !== "journey");
  if (mode === "compare") renderComparison(state.lastComparison, state.concept, state.source);
  else {
    renderJourney(DEMO_CERKIEW, "cerkiew", "pl", "demo");
    loadJourney(ui.word.value, ui.language.value);
  }
  window.setTimeout(() => state.map?.invalidateSize(), 0);
}

function bindEvents() {
  ui.tabs.forEach((tab) => tab.addEventListener("click", () => switchMode(tab.dataset.mode)));
  ui.compareForm.addEventListener("submit", (event) => { event.preventDefault(); loadComparison(ui.concept.value); });
  ui.journeyForm.addEventListener("submit", (event) => { event.preventDefault(); loadJourney(ui.word.value, ui.language.value); });
  document.querySelectorAll("[data-example]").forEach((button) => button.addEventListener("click", () => {
    ui.concept.value = button.dataset.example;
    loadComparison(button.dataset.example);
  }));
  document.querySelectorAll("[data-word]").forEach((button) => button.addEventListener("click", () => {
    ui.word.value = button.dataset.word;
    ui.language.value = button.dataset.language;
    loadJourney(button.dataset.word, button.dataset.language);
  }));
  ui.collapse.addEventListener("click", () => {
    const collapsed = ui.storyPanel.classList.toggle("collapsed");
    ui.collapse.textContent = collapsed ? "+" : "−";
  });
  ui.back.addEventListener("click", () => resetDrill(true));
}

initLanguageSelect();
initMap();
bindEvents();
if (state.map) {
  renderComparison(DEMO_CHURCH, "church", "demo");
  loadComparison("church");
}
