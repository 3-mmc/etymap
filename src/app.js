import { LANGUAGES, TYPE_LABELS, languageName, wiktionaryUrl } from "./data.js";
import { loadSpeakerArea } from "./geography.js";
import { EARLIEST, PRESENT, formatYear, inPeriod, loadLanguageCatalog, periodLabel, resolveLanguage } from "./languages.js";
import { buildJourney, enrichTranslations, fetchWikitext, getLanguageSection, parseTranslationSenses } from "./wiktionary.js";
import { clusterPoints, colourForSource, prepareBasemap, nightPaint } from "./map-model.js";

const $ = (selector) => document.querySelector(selector);
const state = {
  mode:"compare", map:null, basemap:null, fallback:null, markers:null, areas:null,
  entries:[], senses:[], concept:"water", nodes:[], region:null, search:0, areaRevision:0,
  controller:null, entryQuery:"", entryLimit:60, areaTimer:null, messageTimer:null,
  markerCache:new Map(), areaCache:new Map(), areaRenderer:null, focusMarker:null,
  geographyFrame:null, lineFrame:null, moving:false, dayStyle:null,
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
  if (gl?.isStyleLoaded()) {
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
  if(gl?.isStyleLoaded() && state.dayStyle) {
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
function popup(item) {
  const meta=LANGUAGES[item.code] || {};
  const node=document.createElement("div");
  node.className="etymon-popup";
  node.innerHTML='<div class="popup-lang">'+esc(languageName(item.code))+'</div><a class="popup-word" href="'+esc(wiktionaryUrl(item.term,item.code))+'" target="_blank" rel="noreferrer">'+esc(display(item))+'</a>'+
    (item.transliteration ? '<p>'+esc(item.transliteration)+'</p>':'')+
    '<p>'+esc(meta.region || meta.locationSource || "Representative location")+' · '+esc(periodLabel(item.code))+'</p>'+
    '<a class="popup-action" href="'+esc(wiktionaryUrl(item.term,item.code))+'" target="_blank" rel="noreferrer">Open Wiktionary entry ↗</a><p>'+resourceLinks(item.code)+'</p>';
  return node;
}
function wordLabel(item) {
  const node=document.createElement("a");
  node.className="word-chip";
  node.style.setProperty("--chip",color(item));
  node.href=wiktionaryUrl(item.term,item.code);
  node.target="_blank"; node.rel="noreferrer";
  node.innerHTML="<b>"+esc(display(item))+"</b><small>"+esc(languageName(item.code))+" ↗</small>";
  node.addEventListener("click",e=>e.stopPropagation());
  return node;
}
function addWord(item, permanent=true) {
  const point=LANGUAGES[item.code]?.point;
  if(!state.map || !point) return;
  const marker=L.circleMarker(pointOnMap(point),{radius:5, color:"#fff", weight:2, fillColor:color(item),fillOpacity:1}).addTo(state.markers);
  marker.bindPopup(popup(item));
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
  const groups=clusterPoints(projected, state.map.getZoom()>=7 ? 70:105);
  const retained=new Set();
  for(const group of groups) {
    const items=group.items;
    const id=JSON.stringify(items.map(key).sort());
    retained.add(id);
    const representative=group.representative;
    let record=state.markerCache.get(id);
    if(!record) {
      if(items.length===1) record={marker:addWord(items[0],true)};
      else {
        const element=document.createElement("div");
        element.className="cluster-card";
        element.innerHTML='<a class="cluster-word" target="_blank" rel="noreferrer"></a><button class="cluster-more" type="button"></button><small class="cluster-language"></small>';
        element.querySelector("a").addEventListener("click",event=>event.stopPropagation());
        const icon=L.divIcon({className:"region-cluster-wrap",html:element,iconSize:[134,55],iconAnchor:[67,27]});
        record={marker:L.marker(state.map.unproject(group.point),{icon,keyboard:false}).addTo(state.markers),element};
        const current=record;
        record.marker.on("click",()=>openRegion(current.items,regionName(current.items)));
      }
      state.markerCache.set(id,record);
    }
    record.items=items;
    const position=items.length===1 ? pointOnMap(LANGUAGES[items[0].code].point):state.map.unproject(group.point);
    if(!record.marker.getLatLng().equals(position)) record.marker.setLatLng(position);
    const signature=JSON.stringify([key(representative),color(representative)]);
    if(record.signature!==signature) {
      if(record.element) {
        const a=record.element.querySelector("a"), button=record.element.querySelector("button");
        a.textContent=display(representative); a.href=wiktionaryUrl(representative.term,representative.code);
        a.title=display(representative)+" · "+languageName(representative.code)+" · open Wiktionary";
        button.textContent="+"+(items.length-1);
        button.setAttribute("aria-label","Explore "+(items.length-1)+" more forms near "+languageName(representative.code));
        record.element.querySelector("small").textContent=languageName(representative.code);
        record.element.style.setProperty("--chip",color(representative));
      } else {
        record.marker.setStyle({fillColor:color(representative)});
        record.marker.getTooltip()?.getContent()?.style.setProperty("--chip",color(representative));
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
    return '<div class="entry-row" style="--entry-color:'+color(item)+'"><i class="entry-dot"></i><div class="entry-main"><a class="entry-link" href="'+esc(wiktionaryUrl(item.term,item.code))+'" target="_blank" rel="noreferrer"><b>'+esc(display(item))+'</b><span>'+esc(languageName(item.code))+' ↗</span></a><div class="entry-meta">'+
      (item.transliteration ? esc(item.transliteration)+' · ':'')+
      (meta.historical ? esc(meta.era || "Historical / extinct")+' · ':'')+
      (!meta.point ? "Location unavailable · ":"")+
      wals+'</div></div>'+
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
    '<div class="legend-title">Words &amp; language profiles</div><input id="entry-filter" class="entry-filter" type="search" placeholder="Find a language or form…" aria-label="Filter result languages and words" value="'+esc(state.entryQuery)+'" /><div id="entry-list"></div>'+
    '<details><summary>Etymological source colours</summary><ul class="cluster-list">'+[...clusters.values()].sort((a,b)=>b.count-a.count).map(c=>'<li style="--color:'+c.color+'"><i></i><b>'+esc(c.label)+'</b><small>'+c.count+'</small></li>').join("")+'</ul><p class="source-caveat">The first explicit source template in each entry determines its group. Matching colours suggest a shared source; they are not a complete cognacy analysis.</p></details>';
  renderEntryList();
}
function renderComparison() {
  state.nodes=[]; $("#journey-lines").innerHTML="";
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
  $("#map-caption-text").textContent=(areas ? areas+" contemporary speaker areas":"Language locations")+" · "+$("#time-label").textContent.toLowerCase();
}

function startSearch() {
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
    if(revision!==state.search || state.mode!=="compare") return;
    status("Reading etymologies · "+Math.min(offset+40,queue.length)+" / "+queue.length,"loading");
    const batch=await enrichTranslations(queue.slice(offset,offset+40),{signal});
    if(revision!==state.search) return;
    const updates=new Map(batch.map(i=>[key(i),i]));
    state.entries=state.entries.map(i=>updates.get(key(i)) || i);
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
    if(!senses.length) throw new Error("No English translation table found. Use Word journey to search a word in another language.");
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
    marker.bindPopup(popup(node));
    marker.bindTooltip(wordLabel(node),{permanent:true,interactive:true,direction:index%2 ? "left":"right",offset:[index%2 ? -15:15,0],className:"word-label",opacity:1});
  });
  $("#map-kicker").textContent=state.nodes.length ? languageName(state.nodes[0].code)+" · EXPLICIT SOURCE REFERENCES":"WORD JOURNEY";
  $("#map-title").textContent=state.nodes.length ? 'The sources of “'+state.nodes[0].term+'”':"Trace a word";
  $("#story-content").innerHTML='<ol class="journey-list">'+nodes.map(node=>'<li><span class="number">'+(state.nodes.indexOf(node)+1)+'</span><a href="'+esc(wiktionaryUrl(node.term,node.code))+'" target="_blank" rel="noreferrer">'+esc(node.term)+'</a><small>'+esc(languageName(node.code))+' · '+esc(periodLabel(node.code))+(node.point ? "":" · location unavailable")+'</small><span class="relation">'+esc(node.type==="current" ? "selected entry":(node.uncertain ? "possibly ":"")+(TYPE_LABELS[node.type] || "derived from"))+'</span><div class="entry-meta">'+resourceLinks(node.code)+'</div></li>').join("")+'</ol>'+
    (!nodes.length ? '<p class="empty-state">No stages in this period. Widen the time range to see the entry.</p>':'')+
    '<p class="source-caveat">'+(state.nodes.length===1 ? "This entry has no supported explicit source templates; its word and language links are still available. ":"")+"Arrows point from each source mentioned in the selected entry to that entry. They do not assume a chronological chain between those sources. Reconstructed forms are marked with *. Dates describe languages, not individual words.</p>";
  drawJourneyLines(); updateCaption();
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
  const {revision,signal}=startSearch();
  state.nodes=[]; renderJourney(); status("Reading Wiktionary…","loading");
  try {
    const title=clean.startsWith("*") ? "Reconstruction:"+languageName(code)+"/"+clean.slice(1):clean;
    const page=await fetchWikitext(title,{signal});
    if(revision!==state.search) return;
    if(!page) throw new Error("No Wiktionary entry found for this word.");
    if(!getLanguageSection(page.text,LANGUAGES[code]?.wiktionaryName || languageName(code))) throw new Error("This page has no "+languageName(code)+" section.");
    state.nodes=buildJourney(clean,code,page.text);
    renderJourney(); fitItems(visible(state.nodes),6);
    status("Live Wiktionary entry");
  } catch(error) {
    if(revision!==state.search || error.name==="AbortError") return;
    status("Entry unavailable","error"); message(error.message);
  }
}
function switchMode(mode) {
  if(state.mode===mode) return;
  startSearch();
  state.mode=mode;
  document.querySelectorAll(".mode-tab").forEach(button=>{
    button.classList.toggle("active",button.dataset.mode===mode);
    button.setAttribute("aria-pressed",String(button.dataset.mode===mode));
  });
  $("#compare-form").classList.toggle("hidden",mode!=="compare");
  $("#journey-form").classList.toggle("hidden",mode!=="journey");
  scheduleAreas();
  if(mode==="compare") loadComparison($("#concept-input").value);
  else loadJourney($("#word-input").value,resolveLanguage($("#language-input").value));
}
function updatePeriod(changed) {
  let from=+$("#time-from").value, to=+$("#time-to").value;
  if(from>to) { if(changed==="from") $("#time-to").value=String(from); else $("#time-from").value=String(to); }
  from=+$("#time-from").value; to=+$("#time-to").value;
  $("#from-label").textContent=formatYear(from); $("#to-label").textContent=formatYear(to);
  const label=from===EARLIEST && to===PRESENT ? "All periods":formatYear(from)+" – "+formatYear(to);
  $("#time-label").textContent=label; $("#options-summary").textContent=label;
  state.region=null; $("#map-drilldown").classList.add("hidden");
  if(state.mode==="compare") renderComparison(); else renderJourney();
  scheduleAreas(); updateCaption();
}

function bindEvents() {
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
  document.querySelectorAll(".mode-tab").forEach(b=>b.addEventListener("click",()=>switchMode(b.dataset.mode)));
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
    const button=event.target.closest("[data-entry]");
    if(!button) return;
    const item=state.entries.find(i=>key(i)===button.dataset.entry);
    if(!item) return;
    fitItems([item],7);
    if(state.focusMarker) state.markers.removeLayer(state.focusMarker);
    state.focusMarker=addWord(item);
    state.focusMarker?.openPopup();
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
