import { LANGUAGES, TYPE_LABELS, languageName, wiktionaryUrl } from "./data.js";
import { loadSpeakerArea } from "./geography.js";
import { EARLIEST, PRESENT, formatYear, inPeriod, loadLanguageCatalog, periodLabel, resolveLanguage } from "./languages.js";
import { buildJourney, enrichTranslations, fetchWikitext, getLanguageSection, parseTranslationSenses } from "./wiktionary.js";
import { clusterPoints, colourForSource, prepareBasemap, nightPaint, labelLayout } from "./map-model.js";
import { fetchPronunciation } from "./pronunciation.js";
import { COVERAGE_DATE, SUGGESTED_WORDS } from "./suggestions.js";

const $ = (selector) => document.querySelector(selector);
const state = {
  mode:"compare", map:null, basemap:null, fallback:null, markers:null, areas:null,
  entries:[], senses:[], concept:"water", nodes:[], region:null, search:0, areaRevision:0,
  controller:null, entryQuery:"", entryLimit:60, areaTimer:null, messageTimer:null,
  markerCache:new Map(), areaCache:new Map(), areaRenderer:null, focusMarker:null,
  geographyFrame:null, lineFrame:null, moving:false, dayStyle:null,
  selection:null, selectionController:null, selectionPages:new Map(), mapSnapshot:null,
  theme:document.documentElement.dataset.theme === "night" ? "night":"day"
};
const esc = (value = "") => String(value).replace(/[&<>'"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[c]);
const key = (item) => item.code + ":" + item.term;
const display = (item) => item.display || item.term;
const locateIcon = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20 4 13 21l-3-7-7-3Z"/></svg>';
const period = () => ({from:+$("#time-from").value, to:+$("#time-to").value, undated:$("#undated-toggle").checked});
const visible = (items) => { const p=period(); return items.filter((i) => inPeriod(i.code,p.from,p.to,p.undated)); };
const color = (item) => colourForSource(item.source, item.sourceName);

function status(text, kind = "live") {
  $("#live-status").className = "live-status " + kind;
  $("#live-status").innerHTML = "<i></i>" + esc(text);
}
function message(text) {
  clearTimeout(state.messageTimer);
  $("#map-message").textContent = text;
  $("#map-message").classList.remove("hidden");
  state.messageTimer = setTimeout(() => $("#map-message").classList.add("hidden"), 8500);
}
function padding() {
  if (innerWidth <= 700) {
    const height = $(".info-card").getBoundingClientRect().height;
    return {paddingTopLeft:[40,105], paddingBottomRight:[55,height+45]};
  }
  return {paddingTopLeft:[$(".info-card").classList.contains("collapsed") ? 70 : 410,80], paddingBottomRight:[90,80]};
}
function fitItems(items, maxZoom=7) {
  const points = items.map((i) => i.point || LANGUAGES[i.code]?.point).filter(Boolean);
  if (!state.map || !points.length) return;
  state.map.fitBounds(points, {...padding(), maxZoom, animate:!matchMedia("(prefers-reduced-motion: reduce)").matches});
}
function pointOnMap(point) {
  const longitude = point[1] + 360 * Math.round((state.map.getCenter().lng - point[1]) / 360);
  return [point[0], longitude];
}
function applyBasemapOptions() {
  const gl = state.basemap?.getMaplibreMap();
  // Paint/layout changes only need the style graph, not all visible tiles downloaded.
  if (gl?.getLayer("background")) {
    for (const layer of gl.getStyle().layers) {
      if (layer["source-layer"] === "boundary") gl.setLayoutProperty(layer.id,"visibility",$("#borders-toggle").checked ? "visible":"none");
      else if (layer.type === "symbol") gl.setLayoutProperty(layer.id,"visibility",$("#labels-toggle").checked ? "visible":"none");
    }
  }
  state.fallback?.setStyle({weight:$("#borders-toggle").checked ? .6:0, color:state.theme === "night" ? "#647985":"#95a99a", fillColor:state.theme === "night" ? "#182730":"#eff1e8"});
}
function syncThemeButton() {
  $("#theme-toggle").setAttribute("aria-pressed",String(state.theme === "night"));
  $("#theme-toggle").title=state.theme === "night" ? "Switch to day mode":"Switch to night mode";
  document.querySelector('meta[name="theme-color"]').content=state.theme === "night" ? "#142531":"#d8e9e9";
}
function applyMapTheme() {
  const gl=state.basemap?.getMaplibreMap();
  if(gl?.getLayer("background") && state.dayStyle) {
    const themed=prepareBasemap(state.dayStyle,state.theme);
    for(const layer of themed.layers) {
      const day=state.dayStyle.layers.find(l=>l.id===layer.id);
      for(const property of Object.keys(nightPaint(day))) gl.setPaintProperty(layer.id,property,layer.paint?.[property] ?? null);
    }
  }
  applyBasemapOptions();
}
function setTheme(theme) {
  state.theme=theme;
  document.documentElement.dataset.theme=theme;
  syncThemeButton(); applyMapTheme();
}
function scheduleGeography() {
  if(state.geographyFrame || state.moving) return;
  state.geographyFrame=requestAnimationFrame(()=>{state.geographyFrame=null;renderGeography();});
}
function scheduleJourneyLines() {
  if(state.mode !== "journey" || state.lineFrame) return;
  state.lineFrame=requestAnimationFrame(()=>{state.lineFrame=null;drawJourneyLines();});
}
function resetMarkers() {
  state.markers?.clearLayers();
  state.markerCache.clear();
  state.focusMarker=null;
}
function updateLabelDetail() {
  if (state.map) $("#map").dataset.detail=labelLayout(state.map.getZoom()).detail;
}
async function initMap() {
  if (!window.L) { message("The map could not load. Please check your connection and reload."); return; }
  state.map = L.map("map", {
    center:[25,25], zoom:2.4, zoomSnap:.1, minZoom:1, maxZoom:14,
    zoomControl:false, attributionControl:false, worldCopyJump:true,
    maxBounds:[[-85,-Infinity],[85,Infinity]], maxBoundsViscosity:1
  });
  L.control.zoom({position:"topright"}).addTo(state.map);
  state.map.createPane("land").style.zIndex=200;
  state.map.createPane("territories").style.zIndex=350;
  state.areaRenderer=L.canvas({pane:"territories",padding:.3});
  state.markers=L.layerGroup().addTo(state.map);
  state.areas=L.layerGroup().addTo(state.map);
  updateLabelDetail();
  state.map.on("zoomend", updateLabelDetail);
  state.map.on("move zoom resize", scheduleJourneyLines);
  state.map.on("movestart",()=>{
    state.moving=true;
    state.areaRevision++;
    clearTimeout(state.areaTimer);
  });
  state.map.on("moveend", () => {
    state.moving=false;
    if (state.mode === "compare") scheduleGeography();
    scheduleAreas();
  });
  state.map.on("resize", () => { if(state.mode === "compare") scheduleGeography(); });
  try {
    if (!L.maplibreGL) throw new Error("Vector basemap unavailable");
    const response=await fetch("https://tiles.openfreemap.org/styles/positron");
    if (!response.ok) throw new Error("Basemap unavailable");
    state.dayStyle=prepareBasemap(await response.json());
    const style=prepareBasemap(state.dayStyle,state.theme);
    state.basemap=L.maplibreGL({style, interactive:false, attributionControl:false}).addTo(state.map);
    state.basemap.getMaplibreMap().on("load", applyMapTheme);
  } catch {
    message("Using a simplified land map while the detailed basemap is unavailable.");
    try {
      const response=await fetch("https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json");
      if (!response.ok) throw new Error("Land unavailable");
      state.fallback=L.geoJSON(await response.json(), {pane:"land", interactive:false, style:{weight:0, fillColor:"#eff1e8", fillOpacity:1}}).addTo(state.map);
      applyBasemapOptions();
    } catch { message("Basemap unavailable. Word locations and entry links still work."); }
  }
}

function resourceLinks(code) {
  const meta=LANGUAGES[code] || {};
  return (meta.wals || []).map((profile) => '<a href="https://wals.info/languoid/lect/wals_code_'+encodeURIComponent(profile.id)+'" target="_blank" rel="noreferrer" title="'+esc(profile.name+' · '+profile.family+' · '+profile.genus)+'">WALS'+(meta.wals.length>1 ? ' · '+esc(profile.name):'')+' ↗</a>').join(" · ");
}
function currentItem(item) {
  return findItem(key(item)) || item;
}
function findItem(id) {
  return state.nodes.find(value=>key(value)===id) || state.entries.find(value=>key(value)===id) ||
    (state.selection && key(state.selection.item)===id ? state.selection.item : null);
}
function readingContent(item, compact=false) {
  const ipa=item.ipa || [];
  const rows=(item.transliteration ? '<span class="reading-line"><span class="reading-kind">Roman.</span> <span>'+esc(item.transliteration)+'</span></span>' : '')+
    (compact ? ipa.slice(0,1) : ipa).map(value=>'<span class="reading-line"><span class="reading-kind">IPA</span> <span>'+esc(value.text)+(value.qualifier ? ' <span class="reading-qualifier">('+esc(value.qualifier)+')</span>':'')+'</span></span>').join("");
  if(compact) return rows;
  return rows+(item.readingStatus === "loaded" ? (!ipa.length ? '<span class="reading-note">No IPA found in this entry section.</span>':'') :
    '<button type="button" class="reading-button" data-pronunciation="'+esc(key(item))+'"'+(item.readingStatus === "loading" ? ' disabled':'')+'>'+
    (item.readingStatus === "loading" ? 'Reading pronunciation…':item.readingStatus === "error" ? 'Retry pronunciation ↻':ipa.length ? 'Check full pronunciation':'Get pronunciation')+'</button>');
}
function readings(item, compact=false) {
  return '<span class="readings" data-reading-key="'+esc(key(item))+'" data-compact="'+compact+'">'+readingContent(item,compact)+'</span>';
}
function refreshReadings(item) {
  for(const value of [...state.entries,...state.nodes,state.selection?.item].filter(Boolean)) {
    if(key(value)===key(item)) Object.assign(value,{transliteration:item.transliteration,ipa:item.ipa,readingStatus:item.readingStatus});
  }
  for(const node of document.querySelectorAll("[data-reading-key]")) {
    if(node.dataset.readingKey===key(item)) node.innerHTML=readingContent(item,node.dataset.compact === "true");
  }
}
async function loadReading(item) {
  item=currentItem(item);
  if(item.readingStatus === "loading" || item.readingStatus === "loaded") return;
  const revision=state.search;
  item.readingStatus="loading"; refreshReadings(item);
  try {
    const reading=await fetchPronunciation(item.term,item.code);
    if(revision!==state.search) return;
    item=currentItem(item);
    item.transliteration ||= reading.transliteration;
    // Rendered output retains generated dialect labels; keep explicit IPA if
    // a page's layout is unsupported by the HTML extractor.
    if(reading.ipa.length) item.ipa=reading.ipa;
    item.readingStatus="loaded";
  } catch {
    if(revision!==state.search) return;
    item=currentItem(item); item.readingStatus="error";
  }
  refreshReadings(item); scheduleGeography();
}
function popup(item) {
  item=currentItem(item);
  const meta=LANGUAGES[item.code] || {};
  const node=document.createElement("div");
  node.className="etymon-popup";
  node.innerHTML='<div class="popup-lang">'+esc(languageName(item.code))+'</div><a class="popup-word" href="'+esc(wiktionaryUrl(item.term,item.code))+'" target="_blank" rel="noreferrer">'+esc(display(item))+'</a>'+
    readings(item)+
    '<p>'+esc(meta.region || meta.locationSource || "Representative location")+' · '+esc(periodLabel(item.code))+'</p>'+
    '<a class="popup-action" href="'+esc(wiktionaryUrl(item.term,item.code))+'" target="_blank" rel="noreferrer">Open Wiktionary entry ↗</a><p>'+resourceLinks(item.code)+'</p>';
  return node;
}
function wordLabel(item) {
  const node=document.createElement("div");
  node.className="word-chip";
  node.style.setProperty("--chip",color(item));
  node.innerHTML='<button type="button" class="map-word-select" aria-label="Explore '+esc(display(item)+' · '+languageName(item.code))+'"><b>'+esc(display(item))+'</b></button>'+readings(item,true)+
    '<small>'+esc(languageName(item.code))+' <a href="'+esc(wiktionaryUrl(item.term,item.code))+'" target="_blank" rel="noreferrer" aria-label="Open '+esc(display(item))+' in Wiktionary">↗</a></small>';
  node.title=display(item)+" · "+languageName(item.code)+" · Explore etymology";
  node.querySelector("button").addEventListener("click",()=>selectWord(currentItem(item)));
  node.addEventListener("click",e=>e.stopPropagation());
  return node;
}
function addWord(item, permanent=true) {
  const point=LANGUAGES[item.code]?.point;
  if(!state.map || !point) return;
  const marker=L.circleMarker(pointOnMap(point),{radius:5, color:"#fff", weight:2, fillColor:color(item),fillOpacity:1}).addTo(state.markers);
  marker.bindPopup(()=>popup(item));
  marker.on("popupopen",()=>{selectWord(currentItem(item));loadReading(item);});
  marker.bindTooltip(wordLabel(item),{permanent,interactive:true,direction:"right",offset:[9,0],className:"word-label",opacity:1});
  return marker;
}
function regionName(entries) {
  const codes=[...new Set(entries.map(i=>i.code))];
  if(codes.length===1) return languageName(codes[0]);
  const historical=entries.map(i=>LANGUAGES[i.code]?.region).filter(Boolean);
  if(historical.length===entries.length && new Set(historical).size===1) return historical[0];
  return languageName(codes[0])+" + "+(codes.length-1);
}
function renderGeography() {
  if(!state.map || state.mode!=="compare") return;
  const bounds=state.map.getBounds().pad(.3);
  const entries=visible(state.entries).filter(i=>LANGUAGES[i.code]?.point && bounds.contains(pointOnMap(LANGUAGES[i.code].point)));
  const projected=entries.map(item=>({item, point:state.map.project(pointOnMap(LANGUAGES[item.code].point))}));
  const layout=labelLayout(state.map.getZoom());
  const groups=clusterPoints(projected, layout.radius);
  const retained=new Set();
  for(const group of groups) {
    const items=group.items;
    const id=layout.detail+JSON.stringify(items.map(key).sort());
    retained.add(id);
    const representative=group.representative;
    let record=state.markerCache.get(id);
    if(!record) {
      if(items.length===1) record={marker:addWord(items[0],true)};
      else {
        const element=document.createElement("div");
        element.className="cluster-card";
        element.innerHTML='<button class="cluster-word" type="button"></button><button class="cluster-more" type="button"></button><span class="cluster-reading"></span><small class="cluster-language"></small>';
        const icon=L.divIcon({className:"region-cluster-wrap",html:element,iconSize:[layout.width,layout.height],iconAnchor:[layout.width/2,layout.height/2]});
        record={marker:L.marker(state.map.unproject(group.point),{icon,keyboard:false}).addTo(state.markers),element};
        const current=record;
        element.querySelector(".cluster-word").addEventListener("click",event=>{event.stopPropagation();selectWord(currentItem(current.representative));});
        record.marker.on("click",()=>openRegion(current.items,regionName(current.items)));
      }
      state.markerCache.set(id,record);
    }
    record.items=items;
    record.representative=representative;
    const position=items.length===1 ? pointOnMap(LANGUAGES[items[0].code].point):state.map.unproject(group.point);
    if(!record.marker.getLatLng().equals(position)) record.marker.setLatLng(position);
    const signature=JSON.stringify([key(representative),color(representative),representative.transliteration,representative.ipa]);
    if(record.signature!==signature) {
      if(record.element) {
        const a=record.element.querySelector(".cluster-word"), button=record.element.querySelector(".cluster-more");
        a.textContent=display(representative);
        a.title=display(representative)+" · "+languageName(representative.code)+" · explore etymology";
        a.setAttribute("aria-label","Explore "+display(representative)+" · "+languageName(representative.code));
        button.textContent="+"+(items.length-1);
        button.setAttribute("aria-label","Explore "+(items.length-1)+" more forms near "+languageName(representative.code));
        record.element.querySelector("small").textContent=languageName(representative.code);
        record.element.querySelector(".cluster-reading").innerHTML=readings(representative,true);
        record.element.style.setProperty("--chip",color(representative));
      } else {
        record.marker.setStyle({fillColor:color(representative)});
        record.marker.setTooltipContent(wordLabel(representative));
      }
      record.signature=signature;
    }
  }
  for(const [id,record] of state.markerCache) {
    if(!retained.has(id) && !record.marker.isPopupOpen()) {state.markers.removeLayer(record.marker);state.markerCache.delete(id);}
  }
}
function openRegion(items,name) {
  state.region=new Set(items.map(key));
  state.entryQuery=""; state.entryLimit=60;
  $("#map-drilldown").classList.remove("hidden");
  $("#map-place").textContent=name;
  renderStory();
  fitItems(items,Math.min(14,state.map.getZoom()+2.5));
}
function allResults() {
  if(state.mode==="journey") { returnToLanguages(); return; }
  state.region=null;
  state.entryQuery="";
  $("#map-drilldown").classList.add("hidden");
  if(state.mode==="compare") { renderStory(); fitItems(visible(state.entries),5); }
  else fitItems(visible(state.nodes),6);
}
function entryRows(items) {
  return items.map(item=>{
    const meta=LANGUAGES[item.code] || {};
    const wals=resourceLinks(item.code);
    return '<div class="entry-row" style="--entry-color:'+color(item)+'"><i class="entry-dot"></i><div class="entry-main"><button type="button" class="entry-link" data-select-word="'+esc(key(item))+'" aria-pressed="'+Boolean(state.selection && key(state.selection.item)===key(item))+'"><b>'+esc(display(item))+'</b><span>'+esc(languageName(item.code))+'</span></button>'+readings(item)+'<div class="entry-meta">'+
      (meta.historical ? esc(meta.era || "Historical / extinct")+' · ':'')+
      (!meta.point ? "Location unavailable · ":"")+
      wals+'</div></div><a class="entry-wiki" href="'+esc(wiktionaryUrl(item.term,item.code))+'" target="_blank" rel="noreferrer" aria-label="Open '+esc(display(item)+' · '+languageName(item.code))+' in Wiktionary" title="Open Wiktionary">↗</a>'+
      (meta.point ? '<button class="locate-button" type="button" data-entry="'+esc(key(item))+'" aria-label="Locate '+esc(languageName(item.code)+' '+display(item))+'">'+locateIcon+'</button>':'')+'</div>';
  }).join("");
}
function currentEntries() {
  return visible(state.entries).filter(i=>!state.region || state.region.has(key(i)));
}
function renderEntryList() {
  const query=state.entryQuery.toLowerCase();
  const items=currentEntries().filter(i=>[i.term,i.display,i.code,languageName(i.code),i.transliteration].some(v=>v?.toLowerCase().includes(query)));
  const target=$("#entry-list");
  if(target) target.innerHTML=(entryRows(items.slice(0,state.entryLimit)) || '<p class="empty-state">No matching forms. Try another language or widen the time range.</p>')+
    (items.length>state.entryLimit ? '<button id="more-entries" class="more-entries" type="button">Show more · '+(items.length-state.entryLimit)+' remaining</button>':'');
}
function renderStory() {
  const items=currentEntries();
  const located=items.filter(i=>LANGUAGES[i.code]?.point);
  const languages=new Set(items.map(i=>i.code));
  const clusters=new Map();
  for(const item of items) {
    const label=item.sourceName || "Etymology not loaded";
    const group=clusters.get(label) || {label,color:color(item),count:0};
    group.count++; clusters.set(label,group);
  }
  const p=period();
  const excluded=state.entries.length-visible(state.entries).length;
  $("#map-kicker").textContent=state.region ? "NEARBY LANGUAGES":"LANGUAGES, WITHOUT BORDERS";
  $("#map-title").textContent='How we say “'+state.concept+'”';
  $("#story-content").innerHTML='<div class="stat-row"><div class="stat"><b>'+languages.size+'</b><span>languages</span></div><div class="stat"><b>'+items.length+'</b><span>word forms</span></div><div class="stat"><b>'+located.length+'</b><span>mapped forms</span></div></div>'+
    (excluded ? '<p class="source-caveat">'+excluded+' forms outside this period or undated. Reset the time range to see all '+state.entries.length+' forms.</p>':'')+
    (p.to<PRESENT ? '<p class="source-caveat">Historical points are approximate. Contemporary speaker territories are hidden for this period.</p>':'')+
    '<div class="legend-title">Words &amp; language profiles</div><p class="source-caveat">Zoom in for map readings. Select a location or Get pronunciation to load generated IPA.</p><input id="entry-filter" class="entry-filter" type="search" placeholder="Find a language or form…" aria-label="Filter result languages and words" value="'+esc(state.entryQuery)+'" /><div id="entry-list"></div>'+
    '<details><summary>Etymological source colours</summary><ul class="cluster-list">'+[...clusters.values()].sort((a,b)=>b.count-a.count).map(c=>'<li style="--color:'+c.color+'"><i></i><b>'+esc(c.label)+'</b><small>'+c.count+'</small></li>').join("")+'</ul><p class="source-caveat">The first explicit source template in each entry determines its group. Matching colours suggest a shared source; they are not a complete cognacy analysis.</p></details>';
  renderEntryList();
}
function renderComparison() {
  $("#journey-lines").innerHTML="";
  renderStory(); scheduleGeography(); scheduleAreas();
}
function scheduleAreas() {
  clearTimeout(state.areaTimer);
  state.areaRevision++;
  state.areaTimer=setTimeout(renderAreas,180);
}
async function renderAreas() {
  const revision=state.areaRevision;
  if(!state.map) return;
  const eligible=state.mode==="compare" && $("#speaker-toggle").checked && period().to>=PRESENT && state.map.getZoom()>=3;
  if(!eligible) { state.areas.clearLayers(); updateCaption(); return; }
  const bounds=state.map.getBounds().pad(.2);
  const entries=visible(state.entries).filter(i=>{
    const meta=LANGUAGES[i.code];
    return meta?.glottocode && !meta.historical && meta.point && bounds.contains(pointOnMap(meta.point));
  });
  const unique=[...new Map(entries.map(i=>[LANGUAGES[i.code].glottocode,i])).values()];
  const wanted=new Set(unique.map(i=>LANGUAGES[i.code].glottocode));
  for(const [code,record] of state.areaCache) {
    if(!wanted.has(code)) state.areas.removeLayer(record.layer);
  }
  let cursor=0, failures=0;
  await Promise.all(Array.from({length:Math.min(4,unique.length)},async()=>{
    while(cursor<unique.length && revision===state.areaRevision) {
      const item=unique[cursor++];
      try {
        const code=LANGUAGES[item.code].glottocode;
        let record=state.areaCache.get(code);
        if(!record) {
          const feature=await loadSpeakerArea(code);
          if(!feature || revision!==state.areaRevision) continue;
          const layer=L.geoJSON(feature,{renderer:state.areaRenderer,pane:"territories",interactive:false,style:{color:color(item),weight:1,fillColor:color(item),fillOpacity:.15}});
          record={layer,color:color(item)};
          state.areaCache.set(code,record);
        }
        if(record.color!==color(item)) {record.layer.setStyle({color:color(item),fillColor:color(item)});record.color=color(item);}
        if(!state.areas.hasLayer(record.layer)) state.areas.addLayer(record.layer);
        // Refresh recency; inactive rendered geometry is bounded, decoded data remains cached.
        state.areaCache.delete(code);state.areaCache.set(code,record);
      } catch { failures++; }
    }
  }));
  if(revision===state.areaRevision) {
    updateCaption(state.areas.getLayers().length);
    for(const [code,record] of state.areaCache) {
      if(state.areaCache.size<=80) break;
      if(!wanted.has(code)) state.areaCache.delete(code);
    }
    if(failures) message("Some speaker territories could not load. Language points remain available.");
  }
}
function updateCaption(areas=0) {
  $("#map-caption-text").textContent=(state.mode==="journey" ? "Etymology · "+(state.selection?.item.term || "") : areas ? areas+" contemporary speaker areas":"Language locations")+" · "+$("#time-label").textContent.toLowerCase();
}

function startSearch() {
  closeSelection();
  state.mapSnapshot=null;
  state.controller?.abort();
  state.controller=new AbortController();
  state.search++;
  state.region=null; state.entryQuery="";
  $("#map-drilldown").classList.add("hidden");
  return {revision:state.search,signal:state.controller.signal};
}
function pending(items) { return items.map(i=>({...i,source:"unresolved",sourceName:"Etymology not loaded"})); }
async function enrichAll(revision,signal) {
  const queue=[...state.entries];
  for(let offset=0;offset<queue.length;offset+=40) {
    if(revision!==state.search) return;
    status("Reading etymologies · "+Math.min(offset+40,queue.length)+" / "+queue.length,"loading");
    const batch=await enrichTranslations(queue.slice(offset,offset+40),{signal});
    if(revision!==state.search) return;
    const updates=new Map(batch.map(i=>[key(i),i]));
    state.entries=state.entries.map(i=>{
      const update=updates.get(key(i));
      if(!update) return i;
      return {...update, readingStatus:i.readingStatus, transliteration:i.transliteration || update.transliteration,
        ipa:i.ipa?.length ? i.ipa : update.ipa};
    });
    // Preserve the user's place in the list and open controls while data arrives.
    renderEntryList(); scheduleGeography();
  }
  if(revision===state.search) { renderStory(); scheduleAreas(); status("Wiktionary · "+new Set(state.entries.map(i=>i.code)).size+" languages"); }
}
async function loadComparison(concept) {
  const clean=concept.trim();
  if(!clean) return;
  const {revision,signal}=startSearch();
  state.entries=[]; state.concept=clean; state.senses=[];
  $("#sense-field").classList.add("hidden");
  renderComparison(); status("Reading Wiktionary…","loading");
  try {
    const page=await fetchWikitext(clean,{signal});
    if(!page) throw new Error('No Wiktionary entry for “'+clean+'”');
    let senses=parseTranslationSenses(page.text);
    if(!senses.length || /\{\{(?:see translation subpage|trans-see)/i.test(page.text)) {
      const subpage=await fetchWikitext(clean+"/translations",{signal});
      if(subpage) {
        const more=parseTranslationSenses(subpage.text);
        if(more.length) senses=[...senses,...more];
      }
    }
    if(revision!==state.search) return;
    if(!senses.length) throw new Error("No English translation table found. Open ‘Look up a word in any language’ to explore this entry directly.");
    state.senses=senses;
    const largest=senses.reduce((best,s,i)=>s.entries.length>senses[best].entries.length ? i:best,0);
    $("#sense-select").innerHTML=senses.map((s,i)=>'<option value="'+i+'">'+esc(s.label)+' · '+s.entries.length+' forms</option>').join("");
    $("#sense-select").value=String(largest);
    $("#sense-field").classList.toggle("hidden",senses.length<2);
    state.entries=pending(senses[largest].entries);
    renderComparison(); fitItems(visible(state.entries),5);
    await enrichAll(revision,signal);
  } catch(error) {
    if(revision!==state.search || error.name==="AbortError") return;
    status(state.entries.length ? "Word results loaded · etymology incomplete":"Search unavailable","error");
    message(error.message);
  }
}
async function changeSense() {
  const sense=state.senses[+$("#sense-select").value];
  if(!sense) return;
  const {revision,signal}=startSearch();
  state.entries=pending(sense.entries);
  renderComparison(); fitItems(visible(state.entries),5);
  try { await enrichAll(revision,signal); }
  catch(error) { if(revision===state.search && error.name!=="AbortError") { status("Etymology incomplete","error"); message(error.message); } }
}
function renderJourney() {
  if(!state.map) return;
  resetMarkers(); state.areas.clearLayers();
  const nodes=visible(state.nodes);
  nodes.forEach(node=>{
    if(!node.point) return;
    const index=state.nodes.indexOf(node);
    const marker=L.marker(pointOnMap(node.point),{icon:L.divIcon({className:"journey-node",html:String(index+1),iconSize:[28,28],iconAnchor:[14,14]})}).addTo(state.markers);
    marker.bindPopup(()=>popup(node));
    marker.on("popupopen",()=>loadReading(node));
    marker.bindTooltip(wordLabel(node),{permanent:true,interactive:true,direction:index%2 ? "left":"right",offset:[index%2 ? -15:15,0],className:"word-label",opacity:1});
  });
  drawJourneyLines(); updateCaption();
}

function renderSuggestions() {
  const chip=item=>'<button type="button" data-example="'+esc(item.word)+'" title="'+item.languages.toLocaleString()+' languages in the largest translation sense · checked '+COVERAGE_DATE+'">'+esc(item.word)+'</button>';
  $("#suggested-words").innerHTML='<div class="examples"><span>Try</span>'+SUGGESTED_WORDS.slice(0,8).map(chip).join("")+'</div>'+
    '<details class="more-suggestions"><summary>More word ideas</summary><div class="examples">'+SUGGESTED_WORDS.slice(8).map(chip).join("")+'</div><p class="fine-print">Broad translation coverage, checked '+COVERAGE_DATE+'. Coverage varies by meaning and changes as Wiktionary grows.</p></details>';
}

function revealSelection() {
  $(".info-card").classList.remove("collapsed");
  $("#collapse-card").textContent="−";
  $("#collapse-card").setAttribute("aria-expanded","true");
  $("#collapse-card").setAttribute("aria-label","Collapse information card");
  $("#word-detail-title")?.focus({preventScroll:true});
  $("#word-detail").scrollIntoView({block:"start",behavior:"auto"});
}

function renderSelection() {
  const selection=state.selection;
  const panel=$("#word-detail");
  const focusedId=panel.contains(document.activeElement) ? document.activeElement.id : null;
  panel.classList.toggle("hidden",!selection);
  if(!selection) { panel.innerHTML=""; return; }
  const item=selection.item;
  const shown=new Set(visible(state.nodes));
  const mapped=state.nodes.filter(node=>shown.has(node) && node.point);
  panel.innerHTML='<div class="selection-heading"><div><p class="selection-kicker">'+esc(languageName(item.code))+' · WORD ETYMOLOGY</p><h2 id="word-detail-title" tabindex="-1">'+esc(display(item))+'</h2></div><button type="button" class="icon-button" id="close-word-detail" aria-label="Close word details">×</button></div>'+
    '<a class="selection-wiki" href="'+esc(wiktionaryUrl(item.term,item.code))+'" target="_blank" rel="noreferrer">Open Wiktionary entry ↗</a>'+
    '<div class="selection-actions"><button type="button" id="show-etymology-map"'+(state.mode!=="journey" && (selection.status!=="ready" || !mapped.length) ? ' disabled':'')+'>'+(state.mode==="journey" ? '← Back to language map':'View etymology on map')+'</button></div>'+
    (selection.status==="loading" ? readings(item)+'<p class="source-caveat" role="status">Reading this word’s etymology…</p>' : selection.status==="error" ? readings(item)+'<p class="source-caveat" role="status">'+esc(selection.error)+'</p><button class="reading-button" id="retry-word-detail" type="button">Retry etymology ↻</button>' :
      '<ol class="journey-list">'+state.nodes.map((node,index)=>'<li><span class="number">'+(index+1)+'</span><a href="'+esc(wiktionaryUrl(node.term,node.code))+'" target="_blank" rel="noreferrer">'+esc(display(node))+'</a>'+readings(node)+'<small>'+esc(languageName(node.code))+' · '+esc(periodLabel(node.code))+(node.point ? "":" · location unavailable")+(!shown.has(node) ? " · outside map period":"")+'</small><span class="relation">'+esc(node.type==="current" ? "selected entry":(node.uncertain ? "possibly ":"")+(TYPE_LABELS[node.type] || "derived from"))+'</span><div class="entry-meta">'+resourceLinks(node.code)+'</div></li>').join("")+'</ol>'+
      (!mapped.length ? '<p class="source-caveat">No located stages in the current map period. Widen the time range; entry links remain available.</p>':'')+
      (state.nodes.length===1 ? '<p class="source-caveat">No supported explicit source templates were found. Wiktionary may contain more etymological discussion.</p>':'')+
      '<p class="source-caveat">The first etymology is shown; check Wiktionary for other homographs. Arrows run from each explicit source to the selected word, not an assumed chain. * marks reconstructions; dates describe languages, not words.</p>');
  if(focusedId) document.getElementById(focusedId)?.focus({preventScroll:true});
}

function returnToLanguages() {
  if(state.mode!=="journey") return;
  state.mode="compare";
  resetMarkers();
  $("#journey-lines").innerHTML="";
  $("#map-back").textContent="← All results";
  $("#map-drilldown").classList.toggle("hidden",!state.region);
  if(state.region) $("#map-place").textContent=regionName(currentEntries());
  const snapshot=state.mapSnapshot;
  const restore=()=>{
    if(state.mode!=="compare" || state.mapSnapshot!==snapshot) return;
    state.mapSnapshot=null;
    if(snapshot) state.map?.setView(snapshot.center,snapshot.zoom,{animate:false});
  };
  // Leaflet ignores setView during an animated zoom. Restore once it settles,
  // and invalidate that callback if a new search or map view takes over.
  if(state.moving) state.map.once("moveend",restore);
  else restore();
  scheduleGeography(); scheduleAreas(); renderSelection(); updateCaption();
}

function showEtymologyMap() {
  if(state.mode==="journey") { returnToLanguages(); return; }
  if(!state.map || state.selection?.status!=="ready" || !visible(state.nodes).some(node=>node.point)) return;
  state.mapSnapshot ||= {center:state.map.getCenter(),zoom:state.map.getZoom()};
  state.mode="journey";
  state.map.closePopup();
  renderJourney(); scheduleAreas();
  $("#map-drilldown").classList.remove("hidden");
  $("#map-back").textContent="← Language map";
  $("#map-place").textContent=display(state.selection.item);
  fitItems(visible(state.nodes),6);
  renderSelection();
}

function closeSelection() {
  returnToLanguages();
  state.selectionController?.abort();
  state.selection=null; state.nodes=[];
  renderSelection();
  for(const button of document.querySelectorAll("[data-select-word]")) button.setAttribute("aria-pressed","false");
}

async function selectWord(item,{retry=false}={}) {
  if(!item) return;
  if(!retry && state.selection && key(state.selection.item)===key(item)) { revealSelection(); return; }
  returnToLanguages();
  state.selectionController?.abort();
  const controller=new AbortController();
  state.selectionController=controller;
  const selection={item:{...item},status:"loading"};
  state.selection=selection; state.nodes=[];
  renderSelection(); revealSelection();
  for(const button of document.querySelectorAll("[data-select-word]")) button.setAttribute("aria-pressed",String(button.dataset.selectWord===key(item)));
  try {
    const title=item.term.startsWith("*") ? "Reconstruction:"+(LANGUAGES[item.code]?.wiktionaryName || languageName(item.code))+"/"+item.term.slice(1) : item.term;
    let page=state.selectionPages.get(title);
    if(!page) {
      page=await fetchWikitext(title,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});
      if(page) {
        state.selectionPages.set(title,page);
        if(state.selectionPages.size>64) state.selectionPages.delete(state.selectionPages.keys().next().value);
      }
    }
    if(state.selection!==selection) return;
    if(!page) throw new Error("No Wiktionary entry found for this word.");
    if(!getLanguageSection(page.text,LANGUAGES[item.code]?.wiktionaryName || languageName(item.code))) throw new Error("This page has no "+languageName(item.code)+" section.");
    const latest=currentItem(selection.item);
    state.nodes=buildJourney(item.term,item.code,page.text);
    const root=state.nodes[0];
    Object.assign(root,{display:item.display,source:item.source,sourceName:item.sourceName,
      transliteration:latest.transliteration || root.transliteration,ipa:latest.ipa?.length ? latest.ipa:root.ipa,readingStatus:latest.readingStatus});
    selection.item=root; selection.status="ready";
    renderSelection(); loadReading(root);
  } catch(error) {
    if(state.selection!==selection || controller.signal.aborted) return;
    selection.status="error";
    selection.error=error.name==="TimeoutError" ? "Wiktionary took too long to respond. Please retry." : error.message;
    renderSelection();
  }
}
function drawJourneyLines() {
  const svg=$("#journey-lines");
  if(state.mode!=="journey" || !state.map) { svg.innerHTML=""; return; }
  const nodes=visible(state.nodes);
  const root=state.nodes[0];
  if(!root?.point || !nodes.includes(root)) { svg.innerHTML=""; return; }
  const size=state.map.getSize();
  svg.setAttribute("viewBox","0 0 "+size.x+" "+size.y);
  const to=state.map.latLngToContainerPoint(pointOnMap(root.point));
  const parts=['<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto"><path class="journey-arrow" d="M0,0 L0,6 L8,3 z"/></marker></defs>'];
  for(const node of nodes) {
    if(node===root || !node.point) continue;
    const from=state.map.latLngToContainerPoint(pointOnMap(node.point));
    const bend=Math.max(40,Math.abs(to.x-from.x)*.2);
    parts.push('<path class="journey-line" d="M '+from.x+' '+from.y+' Q '+((from.x+to.x)/2)+' '+(Math.min(from.y,to.y)-bend)+' '+to.x+' '+to.y+'" marker-end="url(#arrow)"/>');
  }
  svg.innerHTML=parts.join("");
}
async function loadJourney(word,code) {
  const clean=word.trim();
  if(!clean) return;
  if(!code) { message("Choose a language from the suggestions, or enter its Wiktionary code."); return; }
  await selectWord({term:clean,code});
}
function updatePeriod(changed) {
  let from=+$("#time-from").value, to=+$("#time-to").value;
  if(from>to) { if(changed==="from") $("#time-to").value=String(from); else $("#time-from").value=String(to); }
  from=+$("#time-from").value; to=+$("#time-to").value;
  $("#from-label").textContent=formatYear(from); $("#to-label").textContent=formatYear(to);
  const label=from===EARLIEST && to===PRESENT ? "All periods":formatYear(from)+" – "+formatYear(to);
  $("#time-label").textContent=label; $("#options-summary").textContent=label;
  state.region=null; $("#map-drilldown").classList.toggle("hidden",state.mode!=="journey");
  if(state.mode==="compare") renderComparison(); else renderJourney();
  renderSelection();
  scheduleAreas(); updateCaption();
}

function bindEvents() {
  renderSuggestions();
  document.addEventListener("click",event=>{
    const button=event.target.closest("[data-pronunciation]");
    if(!button) return;
    const item=findItem(button.dataset.pronunciation);
    if(item) loadReading(item);
  });
  syncThemeButton();
  let themeChosen=false;
  try { themeChosen=Boolean(localStorage.getItem("etymap-theme")); } catch { /* optional storage */ }
  $("#theme-toggle").addEventListener("click",()=>{
    themeChosen=true;
    setTheme(state.theme === "night" ? "day":"night");
    try { localStorage.setItem("etymap-theme",state.theme); } catch { /* retain for this session */ }
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change",event=>{
    if(!themeChosen) setTheme(event.matches ? "night":"day");
  });
  $("#compare-form").addEventListener("submit",e=>{e.preventDefault();loadComparison($("#concept-input").value);});
  $("#journey-form").addEventListener("submit",e=>{e.preventDefault();loadJourney($("#word-input").value,resolveLanguage($("#language-input").value));});
  document.querySelectorAll("[data-example]").forEach(b=>b.addEventListener("click",()=>{$("#concept-input").value=b.dataset.example;loadComparison(b.dataset.example);}));
  document.querySelectorAll("[data-word]").forEach(b=>b.addEventListener("click",()=>{$("#word-input").value=b.dataset.word;$("#language-input").value=languageName(b.dataset.language);loadJourney(b.dataset.word,b.dataset.language);}));
  $("#sense-select").addEventListener("change",changeSense);
  $("#collapse-card").addEventListener("click",()=>{
    const collapsed=$(".info-card").classList.toggle("collapsed");
    $("#collapse-card").textContent=collapsed ? "+":"−";
    $("#collapse-card").setAttribute("aria-expanded",String(!collapsed));
    $("#collapse-card").setAttribute("aria-label",collapsed ? "Expand information card":"Collapse information card");
  });
  $("#map-home").addEventListener("click",allResults); $("#map-back").addEventListener("click",allResults);
  $("#labels-toggle").addEventListener("change",applyBasemapOptions); $("#borders-toggle").addEventListener("change",applyBasemapOptions);
  $("#speaker-toggle").addEventListener("change",scheduleAreas);
  $("#time-from").addEventListener("input",()=>updatePeriod("from")); $("#time-to").addEventListener("input",()=>updatePeriod("to"));
  $("#undated-toggle").addEventListener("change",()=>updatePeriod());
  $("#reset-time").addEventListener("click",()=>{$("#time-from").value=String(EARLIEST);$("#time-to").value=String(PRESENT);updatePeriod();});
  $("#story-content").addEventListener("input",event=>{if(event.target.id==="entry-filter"){state.entryQuery=event.target.value;renderEntryList();}});
  $("#story-content").addEventListener("click",event=>{
    if(event.target.closest("#more-entries")) { state.entryLimit+=60; renderEntryList(); return; }
    const selected=event.target.closest("[data-select-word]");
    if(selected) { selectWord(findItem(selected.dataset.selectWord)); return; }
    const button=event.target.closest("[data-entry]");
    if(!button) return;
    const item=state.entries.find(i=>key(i)===button.dataset.entry);
    if(!item) return;
    selectWord(item);
    fitItems([item],7);
    if(state.focusMarker) state.markers.removeLayer(state.focusMarker);
    state.focusMarker=addWord(item);
    state.focusMarker?.openPopup();
  });
  $("#word-detail").addEventListener("click",event=>{
    if(event.target.closest("#show-etymology-map")) showEtymologyMap();
    else if(event.target.closest("#retry-word-detail")) selectWord(state.selection.item,{retry:true});
    else if(event.target.closest("#close-word-detail")) { closeSelection(); $("#entry-filter")?.focus(); }
  });
}
async function start() {
  for(const id of ["time-from","time-to"]) $("#"+id).max=String(PRESENT);
  $("#time-to").value=String(PRESENT);
  bindEvents();
  const mapReady=initMap();
  try {
    const count=await loadLanguageCatalog();
    $("#language-list").innerHTML=Object.entries(LANGUAGES).filter(([code])=>!code.includes("_")).sort((a,b)=>a[1].name.localeCompare(b[1].name)).map(([code,m])=>'<option value="'+esc(m.name)+'">'+esc(code+(m.historical ? " · historical":""))+'</option>').join("");
    $("#language-input").placeholder="Search "+count.toLocaleString()+" languages…";
  } catch { message("The full language catalogue could not load. Core languages are available; reload to retry."); }
  updatePeriod();
  if(state.search===0) loadComparison("water");
  await mapReady;
}
start();
