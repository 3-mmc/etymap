// Real dictionary shards + deterministic Wiktionary trees. Optional real tiles.
import assert from "node:assert/strict";
const {chromium}=await import(process.env.ETYMAP_PLAYWRIGHT_MODULE || "playwright");
const browser=await chromium.launch({executablePath:process.env.ETYMAP_CHROMIUM || undefined,headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader"]});
const link=(code,title,name,display=title)=>'<span lang="'+code+'"><a href="/wiki/'+encodeURIComponent(title)+'#'+name+'">'+display+'</a></span>';
const raw={
  water:'==English==\n===Noun===\n====Translations====\n{{trans-top|liquid}}\n* Polish: {{t|pl|woda}}\n* German: {{t|de|Wasser}}\n{{trans-bottom}}\n{{trans-top|a body of water}}\n* Polish: {{t|pl|woda}}\n{{trans-bottom}}',
  fire:'==English==\n===Noun===\n====Translations====\n{{trans-top|combustion}}\n* Polish: {{t|pl|ogień}}\n{{trans-bottom}}',
  woda:'==Polish==\n===Etymology===\n{{inh|pl|sla-pro|*voda}}\n===Noun===',
  'Reconstruction:Proto-Slavic/voda':'==Proto-Slavic==\n===Etymology===\n{{inh|sla-pro|ine-pro|*wódr̥}} {{cog|la|unda}}\n===Noun===',
  'Reconstruction:Proto-Austronesian/daNum':'==Proto-Austronesian==\n===Noun==='
};
const rendered={
  'Reconstruction:Proto-Slavic/voda':'<h2>Proto-Slavic</h2><h3>Etymology</h3><p>'+link('ine-pro','Reconstruction:Proto-Indo-European/wódr̥','Proto-Indo-European','*wódr̥')+' '+link('la','unda','Latin')+'</p><h3>Noun</h3><h4>Descendants</h4><ul><li>'+link('zlw-opl','woda','Old_Polish')+'<ul><li>'+link('pl','woda','Polish')+'</li></ul></li><li><span class="desc-arr" title="borrowed">→</span><span class="desc-arr" title="uncertain">?</span>'+link('de','Wodka','German')+'</li><li>'+link('qzx-test','unlocated','Unlocated')+'</li></ul>',
  'Reconstruction:Proto-Austronesian/daNum':'<h2>Proto-Austronesian</h2><h3>Noun</h3><h4>Descendants</h4><ul><li>'+link('poz-pro','Reconstruction:Proto-Malayo-Polynesian/daNum','Proto-Malayo-Polynesian','*daNum')+'<ul><li>'+link('id','danau','Indonesian')+'</li></ul></li></ul>'
};
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000},hasTouch:true});
  const errors=[],requests=[],wiki=[],glErrors=[];
  page.setDefaultTimeout(30000);
  page.on("pageerror",error=>errors.push(error.message));
  page.on("request",request=>{
    if(request.url().includes("/data/lexicon/")) requests.push(request.url());
    if(request.url().includes("en.wiktionary.org/w/api.php")) wiki.push(request.url());
  });
  await page.route("**/src/app.js",async route=>{
    const response=await route.fetch();
    let source=await response.text();
    if(!process.env.ETYMAP_REAL_MAP) source=source.replace('const style=prepareBasemap(state.dayStyle,state.theme);','const style=prepareBasemap(state.dayStyle,state.theme);style.layers=style.layers.filter(layer=>layer.id!=="etymap-relief");delete style.sources["etymap-elevation"];');
    await route.fulfill({response,body:source+'\nwindow.__state=state;window.__dictionary=selectDictionaryConcept;window.__renderGeography=renderGeography;window.__proto=loadProto;window.__select=selectWord;'});
  });
  if(!process.env.ETYMAP_REAL_MAP) await page.route("https://tiles.openfreemap.org/styles/positron",route=>route.fulfill({json:{version:8,sources:{},layers:[{id:"background",type:"background",paint:{"background-color":"#d3e4e6"}}]}}));
  let slowProto=false;
  await page.route("https://en.wiktionary.org/w/api.php?*",async route=>{
    const params=new URL(route.request().url()).searchParams;
    if(params.get("action")==="parse") {
      if(slowProto) await new Promise(resolve=>setTimeout(resolve,400));
      return route.fulfill({json:{parse:{text:rendered[params.get("page")] || "<h2>English</h2>"}}});
    }
    await route.fulfill({json:{query:{pages:params.get("titles").split("|").map(title=>raw[title] ? {title,revisions:[{slots:{main:{content:raw[title]}}}]}:{title,missing:true})}}});
  });
  await page.goto(process.env.ETYMAP_URL || "http://127.0.0.1:4174");
  await page.waitForFunction(()=>window.__state?.lexicalIndex && __state.entries.length===2 && !document.querySelector("#live-status").classList.contains("loading"));
  await page.waitForFunction(()=>__state.basemap?.getMaplibreMap().getLayer("background"));
  await page.evaluate(()=>{
    window.__glErrors=[];__state.basemap.getMaplibreMap().on("error",e=>{if(!e.sourceId) __glErrors.push(e.error?.message);});
  });
  assert.equal(requests.length,1,"Only the meaning index loads at bootstrap");
  const wikiBaseline=wiki.length;
  const concepts=await page.evaluate(()=>Object.fromEntries(["ids","wold"].map(dataset=>[dataset,__state.lexicalIndex.concepts.find(c=>c.dataset===dataset && c.gloss==="WATER")])));
  const idsKey="ids:"+concepts.ids.localId,woldKey="wold:"+concepts.wold.localId;
  await page.locator("#dictionary-browser summary").click();
  await page.locator('[data-dictionary-concept="'+idsKey+'"]').click();
  await page.waitForFunction(count=>__state.entries.length===count,concepts.ids.forms+2);
  assert.equal(await page.evaluate(()=>__state.wikiEntries.length),2);
  assert.equal(requests.length,2);
  assert.equal(await page.locator("#entry-list .entry-row").count(),60);
  await page.locator('[data-dictionary-concept="'+woldKey+'"]').click();
  await page.waitForFunction(count=>__state.entries.length===count,concepts.ids.forms+concepts.wold.forms+2);
  assert.equal(requests.length,3);
  assert.equal(wiki.length,wikiBaseline,"Co-displaying dictionaries never guesses Wiktionary matches");
  assert.match(await page.locator("#story-content").innerText(),/overlapping source varieties/);
  await page.locator("#entry-filter").fill("Batlukh");
  await page.locator("#entry-list [data-select-word]").first().click();
  assert.match(await page.locator("#word-detail").innerText(),/Madzhid Khalilov/);
  assert.match(await page.locator("#word-detail").innerText(),/dictionary-level attribution only/);
  assert.match(await page.locator("#word-detail .selection-wiki").getAttribute("href"),/ids.clld.org\/valuesets\//);
  assert.equal(await page.locator("#load-word-family").count(),0);
  await page.locator('[data-source-layer="'+idsKey+'"]').uncheck();
  assert.equal(await page.locator("#word-detail").isVisible(),false,"Hiding a selected record closes stale details");
  assert.equal(await page.evaluate(()=>__state.entries.length),concepts.wold.forms+2);
  await page.locator("#wiki-source-toggle").uncheck();
  assert.equal(await page.evaluate(()=>__state.entries.length),concepts.wold.forms);
  await page.locator("#entry-filter").fill("");
  await page.locator("#entry-list [data-select-word]").first().click();
  assert.match(await page.locator("#word-detail").innerText(),/Borrowing assessment/);
  assert.match(await page.locator("#word-detail .selection-wiki").getAttribute("href"),/wold.clld.org\/word\/\d+/);
  await page.locator("#close-word-detail").click();
  await page.locator('[data-source-layer="'+idsKey+'"]').check();
  await page.locator("#wiki-source-toggle").check();
  assert.equal(requests.length,3,"Toggling sources reuses loaded records");
  const timing=await page.evaluate(async()=>{
    __state.map.setView([40,12],4,{animate:false});await new Promise(requestAnimationFrame);__renderGeography();
    const layout=__state.clusterLayout,times=[];let reused=true;
    for(let i=0;i<20;i++) {
      __state.map.panBy([i%2 ? -8:8,0],{animate:false});
      const start=performance.now();__renderGeography();times.push(performance.now()-start);reused &&= layout===__state.clusterLayout;
      await new Promise(requestAnimationFrame);
    }
    times.sort((a,b)=>a-b);return {reused,median:times[10],p95:times[18],forms:__state.entries.length};
  });
  assert.equal(timing.reused,true);assert.equal(requests.length,3);
  console.log("Combined-map cached pan overlay (headless ms, not full frame time):",timing);
  await page.evaluate(()=>{__state.map.setView([46,12],5,{animate:false});});
  await page.waitForFunction(()=>!__state.moving);
  await page.mouse.move(1400,900);await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>{
    const boxes=[...document.querySelectorAll(".cluster-card,.word-chip")].filter(node=>node.getClientRects().length).map(node=>node.getBoundingClientRect());
    let overlaps=0;
    for(let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++) {const a=boxes[i],b=boxes[j];if(a.left<b.right && b.left<a.right && a.top<b.bottom && b.top<a.bottom) overlaps++;}
    return overlaps;
  }),0,"Combined-source card footprints do not collide at rest");
  assert.ok(await page.evaluate(()=>__state.areas.getLayers().length<=48));

  // A failing layer does not remove other sources; retry is local to that layer.
  const fire=await page.evaluate(()=>__state.lexicalIndex.concepts.find(c=>c.dataset==="ids" && c.gloss==="FIRE"));
  const fireKey="ids:"+fire.localId,firePath="**/data/lexicon/ids/"+fire.localId+".json.gz";
  await page.route(firePath,route=>route.fulfill({status:503,body:"Retry"}));
  await page.evaluate(id=>{__dictionary(id);},fireKey);
  await page.waitForFunction(id=>__state.dictionaryLayers.get(id)?.status==="error",fireKey);
  assert.equal(await page.evaluate(()=>__state.entries.length),concepts.ids.forms+concepts.wold.forms+2);
  await page.unroute(firePath);
  await page.locator('[data-retry-layer="'+fireKey+'"]').click();
  await page.waitForFunction(id=>__state.dictionaryLayers.get(id)?.status==="ready",fireKey);
  await page.locator('[data-remove-layer="'+fireKey+'"]').click();

  // New sense clears the chosen cross-source comparison, not just its display.
  await page.locator("#sense-select").selectOption("1");
  await page.waitForFunction(()=>__state.entries.length===1 && __state.dictionaryLayers.size===0);
  await page.locator("#sense-select").selectOption("0");
  await page.waitForFunction(()=>__state.entries.length===2 && !document.querySelector("#live-status").classList.contains("loading"));
  await page.evaluate(id=>{__dictionary(id);},idsKey);
  await page.waitForFunction(count=>__state.entries.length===count,concepts.ids.forms+2);
  await page.evaluate(async()=>{const {LANGUAGES}=await import('./src/data.js');LANGUAGES['qzx-test']={name:'Unlocated'};});
  await page.waitForFunction(()=>!__state.moving);
  const before=await page.evaluate(()=>({center:__state.map.getCenter(),zoom:__state.map.getZoom(),ids:__state.entries.map(i=>i.id || i.code+":"+i.term)}));
  await page.locator("#proto-browser summary").click();
  await page.locator("#proto-form button[type=submit]").click();
  await page.waitForFunction(()=>__state.mode==="journey" && __state.journeyKind==="proto" && !__state.moving);
  assert.equal(await page.locator("path.family-cognate").count(),0);
  assert.equal(await page.locator("path.family-source").count(),0);
  assert.ok(await page.locator("path.family-descendant").count());
  assert.ok(await page.locator("path.family-borrowing.uncertain").count());
  assert.match(await page.locator("#family-panel").innerText(),/unlocated/);
  assert.match(await page.locator("#family-panel").innerText(),/not established homelands/);
  await page.locator("#proto-only-toggle").check();
  assert.equal(await page.locator(".journey-node").count(),1);
  assert.equal(await page.locator("#journey-lines path.journey-line").count(),0);
  assert.match(await page.locator("#family-panel").innerText(),/No reconstructed descendants/);
  await page.locator("#proto-only-toggle").uncheck();
  assert.ok(await page.locator(".journey-node").count()>1);
  await page.locator("#map-back").click();
  await page.waitForFunction(()=>__state.mode==="compare" && !__state.moving && !__state.mapSnapshot);
  const after=await page.evaluate(()=>({center:__state.map.getCenter(),zoom:__state.map.getZoom(),ids:__state.entries.map(i=>i.id || i.code+":"+i.term)}));
  assert.deepEqual(after.ids,before.ids);assert.equal(after.zoom,before.zoom);
  assert.ok(await page.evaluate(center=>__state.map.project(center).distanceTo(__state.map.project(__state.map.getCenter()))<1,before.center),"Return preserves camera to within Leaflet's pixel rounding");
  await page.locator('[data-proto-example="2"]').click();
  await page.waitForFunction(()=>__state.journeyKind==="proto" && __state.selection?.family?.item.code==="map-pro");
  await page.locator("#proto-only-toggle").check();
  assert.ok(await page.locator("#family-panel [data-family-word='poz-pro:*daNum']").count());
  assert.equal(await page.locator("#family-panel [data-family-word='id:danau']").count(),0);
  await page.locator("#map-back").click();
  await page.locator("#close-word-detail").click();

  // Style changes keep the same MapLibre instance, sources, cards, and camera.
  await page.locator(".map-options summary").click();
  await page.evaluate(()=>{window.__gl=__state.basemap.getMaplibreMap();window.__sources=JSON.stringify(__gl.getStyle().sources);});
  for(const view of ["waterways","atlas","minimal","relief"]) {
    await page.locator('[data-map-view="'+view+'"]').click();
    assert.equal(await page.locator('[data-map-view="'+view+'"]').getAttribute("aria-pressed"),"true");
    assert.equal(await page.evaluate(()=>__state.basemap.getMaplibreMap()===__gl && JSON.stringify(__gl.getStyle().sources)===__sources),true);
    if(process.env.ETYMAP_SCREENSHOT) await page.screenshot({path:process.env.ETYMAP_SCREENSHOT.replace(".png","-"+view+".png")});
  }
  await page.locator("#theme-toggle").click();
  await page.locator('[data-map-view="atlas"]').click();
  assert.equal(await page.evaluate(()=>__gl.getPaintProperty("background","background-color")),"#302c25");
  await page.locator('[data-map-view="relief"]').click();
  assert.equal(await page.evaluate(()=>__gl.getPaintProperty("background","background-color")),"#182730");
  await page.locator("#lightweight-toggle").check();
  assert.equal(await page.locator(".info-card").evaluate(node=>getComputedStyle(node).backdropFilter),"none");
  await page.locator("#lightweight-toggle").uncheck();
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>!__state.moving && __state.markerCache.size>0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('[data-map-view="waterways"]').click();
  if(process.env.ETYMAP_SCREENSHOT) await page.screenshot({path:process.env.ETYMAP_SCREENSHOT.replace(".png","-mobile.png")});

  // Pending meaning removal/search cannot resurrect old results.
  const other=await page.evaluate(()=>__state.lexicalIndex.concepts.find(c=>c.dataset==="wold" && c.gloss==="FIRE"));
  await page.route("**/data/lexicon/wold/"+other.localId+".json.gz",async route=>{await new Promise(resolve=>setTimeout(resolve,400));await route.continue();});
  await page.evaluate(id=>{__dictionary(id);},"wold:"+other.localId);
  await page.locator("#concept-input").fill("fire");
  await page.locator("#compare-form button[type=submit]").click();
  await page.waitForFunction(()=>__state.entries.length===1 && __state.concept==="fire");
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>__state.dictionaryLayers.size),0);
  assert.equal(await page.evaluate(()=>__state.entries.some(i=>i.lexical)),false);
  // A Proto request losing selection must not hijack the later map.
  slowProto=true;
  await page.evaluate(()=>{__proto("*voda","sla-pro");__select({code:"pl",term:"woda"});});
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>__state.mode),"compare");
  assert.equal(await page.evaluate(()=>__state.selection.item.code),"pl");
  if(process.env.ETYMAP_LIVE_PROTO) {
    await page.unroute("https://en.wiktionary.org/w/api.php?*");
    // Use a fresh page/context cache for real entry retrieval, not the fixtures.
    const live=await browser.newPage({viewport:{width:1440,height:1000}});
    await live.route("**/src/app.js",async route=>{
      const response=await route.fetch();
      const source=(await response.text()).replace('if(state.search===0) loadComparison("water");','');
      await route.fulfill({response,body:source+'\nwindow.__state=state;window.__proto=loadProto;'});
    });
    await live.goto(process.env.ETYMAP_URL || "http://127.0.0.1:4174");
    await live.waitForSelector('#proto-languages option',{state:"attached"});
    for(const item of [{code:"sla-pro",term:"*voda"},{code:"ine-pro",term:"*wódr̥"},{code:"map-pro",term:"*daNum"}]) {
      await live.evaluate(async item=>{await __proto(item.term,item.code);},item);
      const result=await live.evaluate(()=>({code:__state.selection?.item.code,status:__state.selection?.family?.status,error:__state.selection?.error || __state.selection?.family?.error,descendants:__state.selection?.family?.data?.descendants.filter(row=>row.item).length}));
      console.log("Live Wiktionary Proto lookup:",result);
      assert.equal(result.status,"ready");assert.ok(result.descendants>0);
      if(process.env.ETYMAP_SCREENSHOT) await live.screenshot({path:process.env.ETYMAP_SCREENSHOT.replace(".png","-proto-"+item.code+".png")});
    }
    await live.close();
  }
  glErrors.push(...await page.evaluate(()=>__glErrors));
  assert.deepEqual(errors,[]);assert.deepEqual(glErrors,[]);
  console.log("Integrated map checks passed: combined real dictionaries, independent source controls, citations, lazy cache, retry/races, sense reset, Proto isolation/filter/return, map views/themes, lightweight glass and mobile.");
} finally {await browser.close();}
