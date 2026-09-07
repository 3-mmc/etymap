import { LANGUAGES, TYPE_LABELS, languageName, wiktionaryUrl } from "./data.js";
import { loadSpeakerArea } from "./geography.js";
import { EARLIEST, PRESENT, formatYear, inPeriod, loadLanguageCatalog, periodLabel, resolveLanguage } from "./languages.js";
import { buildJourney, enrichTranslations, fetchWikitext, getLanguageSection, parseTranslationSenses } from "./wiktionary.js";
import { layoutClusters, colourForSource, prepareBasemap, nightPaint, labelLayout } from "./map-model.js";
import { fetchPronunciation, fetchRenderedEntry } from "./pronunciation.js";
import { parseRenderedFamily, familyGraph, familyTitle } from "./family.js";
import { COVERAGE_DATE, SUGGESTED_WORDS } from "./suggestions.js";
import { entryKey, entryUrl, entrySource, loadLexicalIndex, loadLexicalConcept, registerLexicalLanguages, matchConcepts } from "./lexical.js";

const $ = (selector) => document.querySelector(selector);
const state = {
  mode:"compare", map:null, basemap:null, fallback:null, markers:null, areas:null,
  entries:[], senses:[], concept:"water", nodes:[], region:null, search:0, areaRevision:0,
  controller:null, entryQuery:"", entryLimit:60, areaTimer:null, messageTimer:null,
  markerCache:new Map(), areaCache:new Map(), areaRenderer:null, focusMarker:null,
  geographyFrame:null, lineFrame:null, moving:false, dayStyle:null,
  selection:null, selectionController:null, selectionPages:new Map(), mapSnapshot:null,
  openCluster:null, stackSequence:0,
  journeyKind:"etymology",
  reliefError:false,
  lexicalIndex:null, lexicalConcept:null, lexicalLimit:12, itemIndex:null, clusterLayout:null,
  periodFrame:null, listFrame:null, territoryTotal:0,
  theme:document.documentElement.dataset.theme === "night" ? "night":"day"
};
const esc = (value = "") => String(value).replace(/[&<>'"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[c]);
const key = entryKey;
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
      if (layer.id === "etymap-relief") gl.setLayoutProperty(layer.id,"visibility",$("#relief-toggle").checked ? "visible":"none");
      else if (layer["source-layer"] === "boundary") gl.setLayoutProperty(layer.id,"visibility",$("#borders-toggle").checked ? "visible":"none");
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
  state.geographyFrame=requestAnimationFrame(()=>{state.geographyFrame=null;if(!state.moving) renderGeography();});
}
function scheduleJourneyLines() {
  if(state.mode !== "journey" || state.lineFrame) return;
  state.lineFrame=requestAnimationFrame(()=>{state.lineFrame=null;drawJourneyLines();});
}
function resetMarkers() {
  closeCluster();
  state.markers?.clearLayers();
  state.markerCache.clear();
  state.focusMarker=null;
}
function updateLabelDetail() {
  if (state.map) $("#map").dataset.detail=labelLayout(state.map.getZoom()).detail;
}
function resizeBasemap() {
  if(!state.basemap) return;
  // Adapter 0.1.0 repositions on resize but leaves its container at the original
  // dimensions. Resize through public APIs before its camera synchronization.
  const size=state.basemap.getSize(), container=state.basemap.getContainer();
  container.style.width=size.x+"px";
  container.style.height=size.y+"px";
  state.basemap.getMaplibreMap().resize();
}
async function initMap() {
  if (!window.L) { message("The map could not load. Please check your connection and reload."); return; }
  state.map = L.map("map", {
    center:[25,25], zoom:2.4, zoomSnap:.1, minZoom:1, maxZoom:14,
    zoomControl:false, attributionControl:false, worldCopyJump:true,
    preferCanvas:true, wheelDebounceTime:30,
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
    closeCluster();
    state.moving=true;
    $(".atlas").classList.add("map-moving");
    state.areaRevision++;
    clearTimeout(state.areaTimer);
  });
  state.map.on("moveend", () => {
    state.moving=false;
    $(".atlas").classList.remove("map-moving");
    if (state.mode === "compare") scheduleGeography();
    scheduleAreas();
  });
  state.map.on("resize", () => { closeCluster(); resizeBasemap(); if(state.mode === "compare") scheduleGeography(); });
  try {
    if (!L.maplibreGL) throw new Error("Vector basemap unavailable");
    const response=await fetch("https://tiles.openfreemap.org/styles/positron");
    if (!response.ok) throw new Error("Basemap unavailable");
    state.dayStyle=prepareBasemap(await response.json());
    const style=prepareBasemap(state.dayStyle,state.theme);
    state.basemap=L.maplibreGL({style, interactive:false, attributionControl:false}).addTo(state.map);
    state.basemap.getMaplibreMap().on("load", applyMapTheme);
    state.basemap.getMaplibreMap().on("error",event=>{
      if(event.sourceId==="etymap-elevation" && !state.reliefError) {
        state.reliefError=true;
        message("Some terrain relief could not load. The language map remains available.");
      }
    });
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
  if(state.itemIndex?.entries!==state.entries) state.itemIndex={entries:state.entries,byId:new Map(state.entries.map(item=>[key(item),item]))};
  return state.nodes.find(value=>key(value)===id) || state.itemIndex.byId.get(id) ||
    state.selection?.family?.graph?.nodes.find(value=>key(value)===id) ||
    (state.selection && key(state.selection.item)===id ? state.selection.item : null);
}
function readingContent(item, compact=false) {
  if(item.lexical) {
    const row=item.lexical.record;
    // The source labels these representations. Never relabel phonemic or
    // publisher-specific transcription as IPA or machine-generated romanisation.
    const names=(row.Transcriptions || "").split(";").slice(1);
    const values=(row.AlternativeValues || "").split(";").map((value,i)=>({value,label:names[i]})).filter(item=>item.value);
    return values.slice(0,compact ? 1:values.length).map(({value,label})=>'<span class="reading-line"><span class="reading-kind">'+esc(label || "Source alt.")+'</span> <span>'+esc(value)+'</span></span>').join("");
  }
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
  for(const value of [...state.entries,...state.nodes,...(state.selection?.family?.graph?.nodes || []),state.selection?.item].filter(Boolean)) {
    if(key(value)===key(item)) Object.assign(value,{transliteration:item.transliteration,ipa:item.ipa,readingStatus:item.readingStatus});
  }
  for(const node of document.querySelectorAll("[data-reading-key]")) {
    if(node.dataset.readingKey===key(item)) node.innerHTML=readingContent(item,node.dataset.compact === "true");
  }
}
async function loadReading(item) {
  item=currentItem(item);
  if(item.lexical) return;
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
  node.innerHTML='<div class="popup-lang">'+esc(languageName(item.code))+'</div><a class="popup-word" href="'+esc(entryUrl(item))+'" target="_blank" rel="noreferrer">'+esc(display(item))+'</a>'+
    readings(item)+
    '<p>'+esc(meta.region || meta.locationSource || "Representative location")+' · '+esc(periodLabel(item.code))+'</p>'+
    '<a class="popup-action" href="'+esc(entryUrl(item))+'" target="_blank" rel="noreferrer">Open '+esc(entrySource(item))+' source ↗</a><p>'+resourceLinks(item.code)+'</p>';
  return node;
}
function wordLabel(item,onSelect=()=>selectWord(currentItem(item))) {
  const node=document.createElement("div");
  node.className="word-chip";
  node.style.setProperty("--chip",color(item));
  node.innerHTML='<button type="button" class="map-word-select" aria-label="Explore '+esc(display(item)+' · '+languageName(item.code))+'"><b>'+esc(display(item))+'</b></button>'+readings(item,true)+
    '<small>'+esc(languageName(item.code))+' <a href="'+esc(entryUrl(item))+'" target="_blank" rel="noreferrer" aria-label="Open '+esc(display(item))+' in '+esc(entrySource(item))+'">↗</a></small>';
  node.title=display(item)+" · "+languageName(item.code)+" · "+entrySource(item);
  node.querySelector("button").addEventListener("click",onSelect);
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
function closeCluster(restoreFocus=false) {
  const record=state.openCluster;
  if(!record) return;
  record.stack.hidden=true;
  record.stack.replaceChildren();
  record.remaining=[];
  record.element.classList.remove("stack-open");
  record.element.querySelector(".cluster-more").setAttribute("aria-expanded","false");
  record.pinned=false;
  state.openCluster=null;
  if(restoreFocus) record.element.querySelector(".cluster-more").focus({preventScroll:true});
}
function appendClusterWords(record) {
  const next=record.remaining.slice(record.stackCount,record.stackCount+30);
  const fragment=document.createDocumentFragment();
  for(const entry of next) {
    const item=currentItem(entry), row=document.createElement("li");
    row.style.setProperty("--chip",color(item));
    row.innerHTML='<button type="button" class="stack-word" data-stack-word="'+esc(key(item))+'"><b>'+esc(display(item))+'</b><small>'+esc(languageName(item.code))+'</small></button>'+readings(item,true)+
      '<a class="stack-wiki" href="'+esc(entryUrl(item))+'" target="_blank" rel="noreferrer" aria-label="Open '+esc(display(item)+' · '+languageName(item.code))+' in '+esc(entrySource(item))+'">↗</a>';
    fragment.append(row);
  }
  record.stack.querySelector("ol").append(fragment);
  record.stackCount+=next.length;
  const more=record.stack.querySelector(".stack-load-more");
  more.hidden=record.stackCount>=record.remaining.length;
  more.textContent="Show more · "+(record.remaining.length-record.stackCount)+" left";
}
function openCluster(record,pinned=false) {
  if(state.openCluster===record) { record.pinned ||= pinned; return; }
  closeCluster();
  state.openCluster=record;
  record.pinned=pinned;
  record.remaining=record.items.filter(item=>key(item)!==key(record.representative));
  record.stackCount=0;
  record.stack.innerHTML='<ol aria-label="Other nearby word forms"></ol><button type="button" class="stack-load-more"></button><button type="button" class="stack-zoom">Zoom to this group ↗</button>';
  appendClusterWords(record);
  record.stack.hidden=false;
  record.element.classList.add("stack-open");
  record.element.querySelector(".cluster-more").setAttribute("aria-expanded","true");
  // Prefer downwards; near the bottom edge, open above rather than off-screen.
  // Keep clear of the mobile bottom card, without moving the map itself.
  const rect=record.element.getBoundingClientRect();
  const mapBottom=innerWidth<=700 ? Math.min(innerHeight,$(".info-card").getBoundingClientRect().top) : innerHeight;
  const below=mapBottom-rect.bottom-16, above=rect.top-16;
  const flip=below<120 && above>below;
  record.stack.style.top=flip ? "auto":"100%";
  record.stack.style.bottom=flip ? "100%":"auto";
  record.stack.style.maxHeight=Math.max(0,Math.min(320,flip ? above:below))+"px";
  record.stack.scrollTop=0;
}
function bindCluster(record) {
  const element=record.element, button=element.querySelector(".cluster-more");
  record.stack=element.querySelector(".cluster-stack");
  record.stack.id="word-stack-"+(++state.stackSequence);
  button.setAttribute("aria-controls",record.stack.id);
  button.setAttribute("aria-expanded","false");
  L.DomEvent.disableClickPropagation(element);
  L.DomEvent.disableScrollPropagation(element);
  element.addEventListener("pointerenter",event=>{if(event.pointerType==="mouse") openCluster(record);});
  element.addEventListener("pointerleave",()=>{
    if(state.openCluster===record && !record.pinned && !element.contains(document.activeElement)) closeCluster();
  });
  element.addEventListener("focusout",()=>queueMicrotask(()=>{
    if(state.openCluster===record && !record.pinned && !element.matches(":hover") && !element.contains(document.activeElement)) closeCluster();
  }));
  element.querySelector(".cluster-word").addEventListener("click",()=>{
    closeCluster(); selectWord(currentItem(record.representative));
  });
  button.addEventListener("click",()=>{
    if(state.openCluster===record && record.pinned) closeCluster();
    else openCluster(record,true);
  });
  record.stack.addEventListener("click",event=>{
    const word=event.target.closest("[data-stack-word]");
    if(word) {
      const item=record.items.find(value=>key(value)===word.dataset.stackWord);
      closeCluster(); if(item) selectWord(currentItem(item));
    } else if(event.target.closest(".stack-load-more")) {
      const previousCount=record.stackCount;
      appendClusterWords(record);
      record.stack.querySelectorAll(".stack-word")[previousCount]?.focus({preventScroll:true});
    } else if(event.target.closest(".stack-zoom")) {
      closeCluster(); openRegion(record.items,regionName(record.items));
    }
  });
}
function renderGeography() {
  if(!state.map || state.mode!=="compare") return;
  const bounds=state.map.getBounds().pad(.3);
  const layout=labelLayout(state.map.getZoom());
  const anchor=Math.round(state.map.getCenter().lng/180)*180;
  const signature=JSON.stringify([state.map.getZoom(),period(),anchor]);
  if(state.clusterLayout?.entries!==state.entries || state.clusterLayout.signature!==signature) {
    // Cluster once per zoom/data/period, not per pan. Membership no longer jumps
    // when a nearby word crosses the viewport edge; existing markers can stay put.
    const projected=visible(state.entries).filter(i=>LANGUAGES[i.code]?.point).map(item=>{
      const [lat,lon]=LANGUAGES[item.code].point;
      return {item,point:state.map.project([lat,lon+360*Math.round((anchor-lon)/360)])};
    });
    state.clusterLayout={entries:state.entries,signature,groups:layoutClusters(projected,layout)};
  }
  const groups=state.clusterLayout.groups.filter(group=>{
    const location=state.map.unproject(group.point);
    return bounds.contains(pointOnMap([location.lat,location.lng]));
  });
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
        element.innerHTML='<button class="cluster-word" type="button"></button><button class="cluster-more" type="button"></button><span class="cluster-reading"></span><small class="cluster-language"></small><div class="cluster-stack" hidden></div>';
        const icon=L.divIcon({className:"region-cluster-wrap",html:element,iconSize:[layout.width,layout.height],iconAnchor:[layout.width/2,layout.height/2]});
        record={marker:L.marker(state.map.unproject(group.point),{icon,keyboard:false}).addTo(state.markers),element};
        bindCluster(record);
      }
      state.markerCache.set(id,record);
    }
    record.items=items;
    record.representative=representative;
    const centre=state.map.unproject(group.point);
    const position=items.length===1 ? pointOnMap(LANGUAGES[items[0].code].point):pointOnMap([centre.lat,centre.lng]);
    if(!record.marker.getLatLng().equals(position)) record.marker.setLatLng(position);
    const signature=JSON.stringify([key(representative),color(representative),representative.transliteration,representative.ipa]);
    if(record.signature!==signature) {
      if(record.element) {
        const a=record.element.querySelector(".cluster-word"), button=record.element.querySelector(".cluster-more");
        a.textContent=display(representative);
        a.title=display(representative)+" · "+languageName(representative.code)+" · "+entrySource(representative);
        a.setAttribute("aria-label","Explore "+display(representative)+" · "+languageName(representative.code));
        button.textContent="+"+(items.length-1);
        button.setAttribute("aria-label","Show "+(items.length-1)+" more forms near "+languageName(representative.code));
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
    if(!retained.has(id) && !record.marker.isPopupOpen()) {
      if(state.openCluster===record) closeCluster();
      state.markers.removeLayer(record.marker);state.markerCache.delete(id);
    }
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
      (item.lexical ? '<span class="source-badge">'+esc(entrySource(item))+'</span> · ':'')+wals+'</div></div><a class="entry-wiki" href="'+esc(entryUrl(item))+'" target="_blank" rel="noreferrer" aria-label="Open '+esc(display(item)+' · '+languageName(item.code))+' in '+esc(entrySource(item))+'" title="Open '+esc(entrySource(item))+'">↗</a>'+
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
  $("#story-content").innerHTML='<div class="stat-row"><div class="stat"><b>'+languages.size+'</b><span>'+(state.lexicalConcept ? 'varieties':'languages')+'</span></div><div class="stat"><b>'+items.length+'</b><span>word forms</span></div><div class="stat"><b>'+located.length+'</b><span>mapped forms</span></div></div>'+
    (excluded ? '<p class="source-caveat">'+excluded+' forms outside this period or undated. Reset the time range to see all '+state.entries.length+' forms.</p>':'')+
    (p.to<PRESENT ? '<p class="source-caveat">Historical points are approximate. Contemporary speaker territories are hidden for this period.</p>':'')+
    (state.lexicalConcept ? '<p class="source-caveat"><span class="source-badge">'+esc(state.lexicalConcept.dataset.toUpperCase())+'</span> Exact source meaning: '+esc(state.lexicalConcept.name)+'. Counts are dictionary varieties and records, not additional unique languages. Grey means lexical evidence only.</p>' : '')+
    '<div class="legend-title">Words &amp; language profiles</div><p class="source-caveat">'+(state.lexicalConcept ? 'Select a form for its original value, annotations, and dictionary credits. Transcription labels follow the source.' : 'Zoom in for map readings. Select a location or Get pronunciation to load generated IPA.')+'</p><input id="entry-filter" class="entry-filter" type="search" placeholder="Find a language or form…" aria-label="Filter result languages and words" value="'+esc(state.entryQuery)+'" /><div id="entry-list"></div>'+
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
    return meta?.glottocode && !meta.historical && (!i.lexical || meta.contemporary) && meta.point && bounds.contains(pointOnMap(meta.point));
  });
  const candidates=[...new Map(entries.map(i=>[LANGUAGES[i.code].glottocode,i])).values()];
  const centre=state.map.getCenter();
  candidates.sort((a,b)=>state.map.distance(centre,pointOnMap(LANGUAGES[a.code].point))-state.map.distance(centre,pointOnMap(LANGUAGES[b.code].point)));
  const unique=candidates.slice(0,48);
  state.territoryTotal=candidates.length;
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
          // Let pointer/keyboard work run between geometry constructions.
          await new Promise(resolve=>setTimeout(resolve,0));
          if(revision!==state.areaRevision || state.moving) continue;
          const layer=L.geoJSON(feature,{renderer:state.areaRenderer,pane:"territories",interactive:false,style:{color:color(item),weight:1,fillColor:color(item),fillOpacity:.15}});
          record={layer,color:color(item)};
          state.areaCache.set(code,record);
        }
        if(record.color!==color(item)) {record.layer.setStyle({color:color(item),fillColor:color(item)});record.color=color(item);}
        if(!state.areas.hasLayer(record.layer)) state.areas.addLayer(record.layer);
        // Both rendered and decoded geometry have bounded caches.
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
  $("#map-caption-text").textContent=(state.mode==="journey" ? (state.journeyKind==="family" ? "Word family · "+(state.selection?.family?.item.term || "") : "Etymology · "+(state.selection?.item.term || "")) : areas ? areas+" contemporary speaker areas":"Language locations")+" · "+$("#time-label").textContent.toLowerCase();
  if(areas && state.territoryTotal>48) $("#map-caption-text").textContent+=" · zoom in for more areas";
}

function startSearch() {
  clearTimeout(state.messageTimer);$("#map-message").classList.add("hidden");
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
function renderDictionaryChoices() {
  const target=$("#dictionary-matches");
  if(!state.lexicalIndex) return;
  const matches=matchConcepts(state.lexicalIndex.concepts,$("#dictionary-query").value,$("#dictionary-source").value);
  $("#dictionary-count").textContent=matches.length+" meanings";
  target.innerHTML=matches.slice(0,state.lexicalLimit).map(concept=>'<button type="button" class="dictionary-choice" data-dictionary-concept="'+esc(concept.dataset+":"+concept.localId)+'"><span>'+esc(concept.name)+'</span><small>'+esc(concept.dataset.toUpperCase())+' · '+concept.varieties+' varieties · '+concept.forms+' forms</small></button>').join("") || '<p class="source-caveat">No indexed meanings match. Try a shorter gloss, or search Wiktionary above.</p>';
  if(matches.length>state.lexicalLimit) target.innerHTML+='<button type="button" class="more-entries" id="more-dictionary-meanings">Show more meanings · '+(matches.length-state.lexicalLimit)+' left</button>';
}
async function initDictionaries() {
  try {
    const index=await loadLexicalIndex();
    state.lexicalIndex=index;
    registerLexicalLanguages(index.datasets);
    const count=Object.values(index.datasets).reduce((sum,d)=>sum+d.stats.forms,0);
    $("#dictionary-summary").textContent=count.toLocaleString()+" sourced records · IDS + WOLD";
    renderDictionaryChoices();
  } catch {
    $("#dictionary-matches").innerHTML='<p class="source-caveat">Dictionary index unavailable. Wiktionary still works.</p><button type="button" id="retry-dictionaries" class="more-entries">Retry dictionaries</button>';
  }
}
async function selectDictionaryConcept(id) {
  const concept=state.lexicalIndex?.concepts.find(c=>c.dataset+":"+c.localId===id);
  if(!concept) return;
  const {revision,signal}=startSearch();
  state.entries=[];state.senses=[];state.lexicalConcept=concept;state.concept=concept.name;state.entryLimit=60;
  $("#sense-field").classList.add("hidden");
  renderComparison();status("Loading "+concept.dataset.toUpperCase()+" · "+concept.name+"…","loading");
  try {
    const entries=await loadLexicalConcept(concept,{signal});
    if(revision!==state.search) return;
    state.entries=entries;
    renderComparison();fitItems(visible(entries),5);
    status(concept.dataset.toUpperCase()+" · "+concept.varieties+" dictionary varieties");
    $("#dictionary-browser").open=false;
  } catch(error) {
    if(revision!==state.search || signal.aborted) return;
    status("Dictionary meaning unavailable","error");message(error.message);
    $("#dictionary-browser").open=true;
  }
}

function renderLexicalSelection(item) {
  const {dataset,record,concept}=item.lexical;
  const source=state.lexicalIndex.datasets[dataset], language=LANGUAGES[item.code];
  const detail=(label,value)=>value ? '<dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd>' : '';
  const fields=[
    ["Meaning",concept.name],["Source form",record.Form],["Original value",record.Value],
    ["Source representation",record.Transcriptions?.split(";")[0] || language.representations?.split(";")[0]],
    ["Original script",record.original_script],["Comment",record.Comment],["Form note",record.comment_on_word_form],
    ["Borrowing assessment",record.Borrowed],["Borrowing note",record.comment_on_borrowed],
    ["Etymological note",record.etymological_note],["Loan history",record.loan_history],
    ["Gloss",record.gloss],["Reference",record.reference],["Record date (not word age)",language.date],
    ["Dictionary authors",language.authors],["Consultants",language.consultants],["Data entry",language.dataEntry],
    ["Language identifier",language.glottocode],["Location",language.locationSource],
    ["CLDF record",record.ID],["Word-level source IDs",record.Source || "Not supplied; dictionary-level attribution only"]
  ];
  if((record.Source || "").split(";").some(id=>source.emptyBibliography?.includes(id.split("[")[0].trim()))) fields.push(["Bibliography limitation","This release has an empty bibliography record for a cited ID. Consult the linked vocabulary and its contributors."]);
  return '<div class="selection-heading"><div><p class="selection-kicker">'+esc(language.name)+' · '+esc(dataset.toUpperCase())+'</p><h2 id="word-detail-title" tabindex="-1">'+esc(display(item))+'</h2></div><button type="button" class="icon-button" id="close-word-detail" aria-label="Close word details">×</button></div>'+
    '<a class="selection-wiki" href="'+esc(entryUrl(item))+'" target="_blank" rel="noreferrer">Open '+esc(dataset.toUpperCase())+' source '+(dataset==="ids" ? 'meaning':'word')+' ↗</a>'+readings(item)+
    '<p class="source-caveat">Lexical evidence, not a verified Wiktionary match. No cognacy or donor arrows are inferred. Source transcriptions are not automatically IPA; locations describe the variety, not the word’s age.</p>'+
    '<dl class="lexical-details">'+fields.map(([label,value])=>detail(label,value)).join("")+'</dl>'+
    '<details class="source-record"><summary>All original CLDF fields</summary><pre>'+esc(JSON.stringify(record,null,2))+'</pre></details>'+
    '<div class="source-links"><a href="'+esc(language.url)+'" target="_blank" rel="noreferrer">Dictionary &amp; contributors ↗</a>'+ (concept.concepticon ? '<a href="https://concepticon.clld.org/parameters/'+esc(concept.concepticon)+'" target="_blank" rel="noreferrer">Concepticon definition ↗</a>' : '')+
    '<a href="./data/lexicon/'+esc(dataset)+'/sources.bib" target="_blank">Source bibliography ↗</a><a href="'+esc(source.doi)+'" target="_blank" rel="noreferrer">'+esc(source.version)+' release ↗</a></div>'+
    '<p class="source-caveat">'+esc(source.citation)+' <a href="'+esc(source.license)+'" target="_blank" rel="noreferrer">CC BY 4.0</a>. Imported as source-specific records; original annotations are retained.</p>';
}
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
  state.entries=[]; state.concept=clean; state.senses=[]; state.lexicalConcept=null;
  $("#dictionary-query").value=clean;state.lexicalLimit=12;renderDictionaryChoices();
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
  state.lexicalConcept=null;
  state.entries=pending(sense.entries);
  renderComparison(); fitItems(visible(state.entries),5);
  try { await enrichAll(revision,signal); }
  catch(error) { if(revision===state.search && error.name!=="AbortError") { status("Etymology incomplete","error"); message(error.message); } }
}
function journeyNodes() {
  return state.journeyKind==="family" ? state.selection?.family?.graph?.nodes || [] : state.nodes;
}
function renderJourney() {
  if(!state.map) return;
  resetMarkers(); state.areas.clearLayers();
  const all=journeyNodes(), nodes=visible(all);
  nodes.forEach(node=>{
    if(!node.point) return;
    const index=all.indexOf(node);
    const marker=L.marker(pointOnMap(node.point),{icon:L.divIcon({className:"journey-node"+(node.term.startsWith("*") ? " reconstructed":""),html:String(index+1),iconSize:[28,28],iconAnchor:[14,14]})}).addTo(state.markers);
    marker.bindPopup(()=>popup(node));
    marker.on("popupopen",()=>loadReading(node));
    marker.bindTooltip(wordLabel(node,state.journeyKind==="family" ? ()=>loadFamily(node):undefined),{permanent:state.journeyKind!=="family" || nodes.length<=40,interactive:true,direction:index%2 ? "left":"right",offset:[index%2 ? -15:15,0],className:"word-label",opacity:1});
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
  if(item.lexical) {panel.innerHTML=renderLexicalSelection(item);return;}
  const shown=new Set(visible(state.nodes));
  const mapped=state.nodes.filter(node=>shown.has(node) && node.point);
  panel.innerHTML='<div class="selection-heading"><div><p class="selection-kicker">'+esc(languageName(item.code))+' · WORD ETYMOLOGY</p><h2 id="word-detail-title" tabindex="-1">'+esc(display(item))+'</h2></div><button type="button" class="icon-button" id="close-word-detail" aria-label="Close word details">×</button></div>'+
    '<a class="selection-wiki" href="'+esc(wiktionaryUrl(item.term,item.code))+'" target="_blank" rel="noreferrer">Open Wiktionary entry ↗</a>'+
    '<div class="selection-actions"><button type="button" id="show-etymology-map"'+(state.mode!=="journey" && (selection.status!=="ready" || !mapped.length) ? ' disabled':'')+'>'+(state.mode==="journey" ? '← Back to language map':'View etymology on map')+'</button></div>'+
    (selection.status==="loading" ? readings(item)+'<p class="source-caveat" role="status">Reading this word’s etymology…</p>' : selection.status==="error" ? readings(item)+'<p class="source-caveat" role="status">'+esc(selection.error)+'</p><button class="reading-button" id="retry-word-detail" type="button">Retry etymology ↻</button>' :
      '<button class="family-launch" id="load-word-family" type="button">Explore descendants &amp; cognates</button><div id="family-panel"></div>'+
      '<ol class="journey-list">'+state.nodes.map((node,index)=>'<li><span class="number">'+(index+1)+'</span><a href="'+esc(wiktionaryUrl(node.term,node.code))+'" target="_blank" rel="noreferrer">'+esc(display(node))+'</a>'+readings(node)+'<small>'+esc(languageName(node.code))+' · '+esc(periodLabel(node.code))+(node.point ? "":" · location unavailable")+(!shown.has(node) ? " · outside map period":"")+'</small><span class="relation">'+esc(node.type==="current" ? "selected entry":(node.uncertain ? "possibly ":"")+(TYPE_LABELS[node.type] || "derived from"))+'</span><div class="entry-meta">'+resourceLinks(node.code)+'</div></li>').join("")+'</ol>'+
      (!mapped.length ? '<p class="source-caveat">No located stages in the current map period. Widen the time range; entry links remain available.</p>':'')+
      (state.nodes.length===1 ? '<p class="source-caveat">No supported explicit source templates were found. Wiktionary may contain more etymological discussion.</p>':'')+
      '<p class="source-caveat">The first etymology is shown; check Wiktionary for other homographs. Arrows run from each explicit source to the selected word, not an assumed chain. * marks reconstructions; dates describe languages, not words.</p>');
  renderFamily();
  if(focusedId) document.getElementById(focusedId)?.focus({preventScroll:true});
}

function renderFamily() {
  const panel=$("#family-panel"), family=state.selection?.family;
  if(!panel) return;
  $("#load-word-family").hidden=Boolean(family);
  if(!family) { panel.innerHTML=""; return; }
  const item=family.item;
  const row=(form,relation="")=>'<div class="family-form"><button type="button" data-family-word="'+esc(key(form))+'"><b>'+esc(display(form))+'</b><small>'+esc(languageName(form.code))+(form.term.startsWith("*") ? ' · reconstructed':'')+(!form.point ? ' · location unavailable' : !visible([form]).length ? ' · outside map period':'')+'</small></button><a href="'+esc(form.url || wiktionaryUrl(form.term,form.code))+'" target="_blank" rel="noreferrer" aria-label="Open '+esc(display(form)+' · '+languageName(form.code))+' in Wiktionary">↗</a>'+readings(form,true)+(relation ? '<span class="family-relation">'+esc(relation)+'</span>':'')+(form.missing ? '<span class="family-relation">Wiktionary entry not yet written</span>':'')+'</div>';
  panel.innerHTML='<section class="family-explorer"><div class="family-heading"><div><p class="selection-kicker">WORD FAMILY · '+esc(languageName(item.code))+'</p><h3 id="family-title" tabindex="-1">'+esc(display(item))+'</h3></div>'+(family.history.length ? '<button type="button" id="family-back" class="reading-button">← Previous family</button>':'')+'</div>'+
    (family.status==="loading" ? '<p class="source-caveat" role="status">Reading descendants and cognates…</p>' : family.status==="error" ? '<p class="source-caveat" role="status">'+esc(family.error)+'</p><button type="button" id="retry-family" class="reading-button">Retry word family ↻</button>' : (()=>{
      const data=family.data, descendants=data.descendants, count=descendants.filter(value=>value.item).length;
      const mapped=visible(family.graph.nodes).filter(value=>value.point).length;
      return '<p class="source-caveat">'+count+' descendant forms · '+data.cognates.length+' listed cognates · '+mapped+' located family forms in this period</p>'+
        (mapped>40 ? '<p class="source-caveat">Large family: hover or focus map points for labels. All loaded forms remain available below.</p>':'')+
        '<button type="button" id="show-family-map" class="family-launch"'+(!mapped && !(state.mode==="journey" && state.journeyKind==="family") ? ' disabled':'')+'>'+(state.mode==="journey" && state.journeyKind==="family" ? '← Back to language map':'View this family on map')+'</button>'+
        '<p class="source-caveat">Follow a source or proto-form to find its other branches. Word buttons explore that form’s family; ↗ opens Wiktionary.</p>'+
        '<h4>Sources &amp; earlier forms</h4>'+ (data.ancestors.map(form=>row(form,(form.uncertain ? 'possibly ':'')+(TYPE_LABELS[form.type] || 'explicit source'))).join("") || '<p class="source-caveat">No supported explicit sources in this etymology.</p>')+
        '<h4>Descendant branches</h4><ol class="family-tree">'+descendants.slice(0,family.limit).map(branch=>'<li style="--depth:'+Math.min(branch.depth,5)+'">'+(branch.item ? row(branch.item,(branch.uncertain ? 'possibly ':'')+branch.relation+(branch.ambiguous ? ' · parent unresolved':'')+(branch.qualifier ? ' · '+branch.qualifier:'')) : '<span class="family-group">'+esc(branch.label)+'</span>')+'</li>').join("")+'</ol>'+
        (descendants.length>family.limit ? '<button type="button" id="family-more" class="reading-button">Show more branches · '+(descendants.length-family.limit)+' rows remaining</button>':'')+
        (!count ? '<p class="source-caveat">'+(data.hasDescendants ? 'No supported linked descendant forms were found in this section.':'No Descendants section was found for this etymology.')+' This does not prove that the word has no descendants.</p>':'')+
        '<h4>Listed cognates</h4>'+ (data.cognates.map(form=>row(form,'listed cognate · check entry context'+(form.qualifier ? ' · '+form.qualifier:''))).join("") || '<p class="source-caveat">No explicit cognate templates found. Try an earlier form’s descendant tree.</p>')+
        '<p class="source-caveat family-legend">Map: arrows follow documented source/descendant relationships; orange dashes mark borrowing, dotted lines without arrows mark listed cognates. These are not migration routes.</p>'+
        '<p class="source-caveat">Wiktionary’s first etymology only, including descendant subtrees it renders. Not an exhaustive genealogy. Grouping rows are not reconstructed words; intermediate stages may be omitted. * marks a scholarly reconstruction, not an attestation. Locations and periods describe languages approximately.</p>'+
        (data.skipped ? '<p class="source-caveat">'+data.skipped+' unsupported branch or template error(s); consult the source for missing detail.</p>':'')+
        '<a class="family-source" href="'+esc(wiktionaryUrl(item.term,item.code))+'" target="_blank" rel="noreferrer">Check the full source entry ↗</a>';
    })())+'</section>';
}

async function loadFamily(item,{retry=false}={}) {
  const selection=state.selection;
  if(!selection || selection.status!=="ready" || !item) return;
  returnToLanguages();
  const previous=selection.family;
  if(!retry && previous?.status==="ready" && key(previous.item)===key(item)) { $("#family-title")?.focus({preventScroll:true}); return; }
  const family={item:{...item},status:"loading",limit:60,history:previous?.status==="ready" ? [...previous.history,previous].slice(-12) : previous?.history || []};
  // History snapshots need no recursive copies of their own history.
  if(previous?.status==="ready") family.history=family.history.map(({history,...snapshot})=>snapshot);
  selection.family=family;
  renderFamily(); $("#family-title")?.focus({preventScroll:true}); $("#family-panel")?.scrollIntoView({block:"nearest"});
  try {
    const title=familyTitle(item);
    const raw=state.selectionPages.get(title) || await fetchWikitext(title,{signal:AbortSignal.any([state.selectionController.signal,AbortSignal.timeout(20000)])});
    if(state.selection!==selection || selection.family!==family) return;
    if(!raw) throw new Error("This linked Wiktionary entry has not been written yet, or is unavailable.");
    state.selectionPages.set(title,raw);
    if(state.selectionPages.size>64) state.selectionPages.delete(state.selectionPages.keys().next().value);
    const html=await fetchRenderedEntry(item.term,item.code);
    if(state.selection!==selection || selection.family!==family) return;
    family.data=parseRenderedFamily(html,raw.text,item);
    family.graph=familyGraph(family.data);
    family.status="ready";
  } catch(error) {
    if(state.selection!==selection || selection.family!==family) return;
    family.status="error";
    family.error=error.name==="TimeoutError" ? "Wiktionary took too long. Please retry." : error.message;
  }
  renderFamily(); $("#family-title")?.focus({preventScroll:true});
}

function previousFamily() {
  const family=state.selection?.family;
  if(!family?.history.length) return;
  returnToLanguages();
  const history=[...family.history], previous=history.pop();
  state.selection.family={...previous,history};
  renderFamily(); $("#family-title")?.focus({preventScroll:true});
}

function showFamilyMap() {
  const family=state.selection?.family;
  if(state.mode==="journey" && state.journeyKind==="family") { returnToLanguages(); return; }
  if(!state.map || family?.status!=="ready" || !visible(family.graph.nodes).some(node=>node.point)) return;
  state.mapSnapshot ||= {center:state.map.getCenter(),zoom:state.map.getZoom()};
  state.mode="journey"; state.journeyKind="family";
  state.map.closePopup(); renderJourney(); scheduleAreas();
  $("#map-drilldown").classList.remove("hidden");
  $("#map-back").textContent="← Language map";
  $("#map-place").textContent="Family · "+display(family.item);
  fitItems(visible(family.graph.nodes),6);
  renderSelection();
}

function returnToLanguages() {
  if(state.mode!=="journey") return;
  state.mode="compare";
  state.journeyKind="etymology";
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
  state.journeyKind="etymology";
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
  if(item.lexical) selection.status="ready";
  renderSelection(); revealSelection();
  for(const button of document.querySelectorAll("[data-select-word]")) button.setAttribute("aria-pressed",String(button.dataset.selectWord===key(item)));
  if(item.lexical) return;
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
  const nodes=new Map(visible(journeyNodes()).filter(node=>node.point).map(node=>[key(node),node]));
  const root=state.nodes[0];
  const edges=state.journeyKind==="family" ? state.selection?.family?.graph?.edges || [] : state.nodes.slice(1).map(node=>({from:key(node),to:key(root),kind:"source"}));
  const size=state.map.getSize();
  svg.setAttribute("viewBox","0 0 "+size.x+" "+size.y);
  const parts=['<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto"><path class="journey-arrow" d="M0,0 L0,6 L8,3 z"/></marker></defs>'];
  for(const edge of edges) {
    const source=nodes.get(edge.from), target=nodes.get(edge.to);
    if(!source || !target) continue;
    const from=state.map.latLngToContainerPoint(pointOnMap(source.point));
    const to=state.map.latLngToContainerPoint(pointOnMap(target.point));
    const bend=Math.max(40,Math.abs(to.x-from.x)*.2);
    parts.push('<path class="journey-line family-'+edge.kind+(edge.uncertain ? ' uncertain':'')+'" d="M '+from.x+' '+from.y+' Q '+((from.x+to.x)/2)+' '+(Math.min(from.y,to.y)-bend)+' '+to.x+' '+to.y+'"'+(edge.kind==="cognate" ? '':' marker-end="url(#arrow)"')+'><title>'+esc((edge.uncertain ? 'possibly ':'')+(edge.label || 'explicit source'))+'</title></path>');
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
  document.addEventListener("pointerdown",event=>{
    if(state.openCluster && !state.openCluster.element.contains(event.target)) closeCluster();
  },true);
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape" && state.openCluster) { event.preventDefault(); closeCluster(true); }
  });
  renderSuggestions();
  document.addEventListener("click",event=>{
    const button=event.target.closest("[data-pronunciation]");
    if(!button) return;
    const item=findItem(button.dataset.pronunciation);
    if(item) loadReading(item);
  });
  syncThemeButton();
  let themeChosen=false;
  try {$("#lightweight-toggle").checked=localStorage.getItem("etymap-lightweight")==="true";} catch { /* optional storage */ }
  const applyLightweight=()=>document.documentElement.classList.toggle("lightweight-glass",$("#lightweight-toggle").checked);
  applyLightweight();
  $("#lightweight-toggle").addEventListener("change",()=>{
    applyLightweight();
    try {localStorage.setItem("etymap-lightweight",String($("#lightweight-toggle").checked));} catch { /* session preference remains */ }
  });
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
  $("#dictionary-query").addEventListener("input",()=>{state.lexicalLimit=12;renderDictionaryChoices();});
  $("#dictionary-source").addEventListener("change",()=>{state.lexicalLimit=12;renderDictionaryChoices();});
  $("#dictionary-matches").addEventListener("click",event=>{
    const choice=event.target.closest("[data-dictionary-concept]");
    if(choice) selectDictionaryConcept(choice.dataset.dictionaryConcept);
    else if(event.target.closest("#more-dictionary-meanings")) {state.lexicalLimit+=24;renderDictionaryChoices();}
    else if(event.target.closest("#retry-dictionaries")) initDictionaries();
  });
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
  $("#relief-toggle").addEventListener("change",()=>{state.reliefError=false;applyBasemapOptions();});
  $("#speaker-toggle").addEventListener("change",scheduleAreas);
  const schedulePeriod=changed=>{cancelAnimationFrame(state.periodFrame);state.periodFrame=requestAnimationFrame(()=>{state.periodFrame=null;updatePeriod(changed);});};
  $("#time-from").addEventListener("input",()=>schedulePeriod("from")); $("#time-to").addEventListener("input",()=>schedulePeriod("to"));
  $("#undated-toggle").addEventListener("change",()=>updatePeriod());
  $("#reset-time").addEventListener("click",()=>{$("#time-from").value=String(EARLIEST);$("#time-to").value=String(PRESENT);updatePeriod();});
  $("#story-content").addEventListener("input",event=>{if(event.target.id==="entry-filter"){
    state.entryQuery=event.target.value;
    if(!state.listFrame) state.listFrame=requestAnimationFrame(()=>{state.listFrame=null;renderEntryList();});
  }});
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
    const familyWord=event.target.closest("[data-family-word]");
    if(familyWord) loadFamily(state.selection?.family?.graph?.nodes.find(item=>key(item)===familyWord.dataset.familyWord));
    else if(event.target.closest("#load-word-family")) loadFamily(state.selection.item);
    else if(event.target.closest("#retry-family")) loadFamily(state.selection.family.item,{retry:true});
    else if(event.target.closest("#family-back")) previousFamily();
    else if(event.target.closest("#family-more")) { state.selection.family.limit+=60; renderFamily(); $("#family-more")?.focus({preventScroll:true}); }
    else if(event.target.closest("#show-family-map")) showFamilyMap();
    else if(event.target.closest("#show-etymology-map")) showEtymologyMap();
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
  initDictionaries();
  updatePeriod();
  if(state.search===0) loadComparison("water");
  await mapReady;
}
start();
