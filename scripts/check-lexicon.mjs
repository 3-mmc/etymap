// Real local dictionary data; deterministic Wiktionary bootstrap. Optional real
// terrain with ETYMAP_REAL_MAP=1. No Playwright dependency in the production app.
import assert from "node:assert/strict";
const {chromium}=await import(process.env.ETYMAP_PLAYWRIGHT_MODULE || "playwright");
const browser=await chromium.launch({executablePath:process.env.ETYMAP_CHROMIUM || undefined,headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader"]});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000},hasTouch:true});
  const errors=[],requests=[],wiki=[];
  page.setDefaultTimeout(30000);
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",request=>{
    if(request.url().includes("/data/lexicon/")) requests.push(request.url());
    if(request.url().includes("en.wiktionary.org/w/api.php")) wiki.push(request.url());
  });
  await page.route("**/src/app.js",async route=>{
    const response=await route.fetch();let source=await response.text();
    if(!process.env.ETYMAP_REAL_MAP) source=source.replace('const style=prepareBasemap(state.dayStyle,state.theme);','const style=prepareBasemap(state.dayStyle,state.theme);style.layers=style.layers.filter(layer=>layer.id!=="etymap-relief");delete style.sources["etymap-elevation"];');
    await route.fulfill({response,body:source+"\nwindow.__state=state;window.__select=selectWord;window.__dictionary=selectDictionaryConcept;window.__renderGeography=renderGeography;"});
  });
  if(!process.env.ETYMAP_REAL_MAP) await page.route("https://tiles.openfreemap.org/styles/positron",route=>route.fulfill({json:{version:8,sources:{},layers:[{id:"background",type:"background",paint:{"background-color":"#d3e4e6"}}]}}));
  await page.route("https://en.wiktionary.org/w/api.php?*",async route=>{
    const params=new URL(route.request().url()).searchParams;
    if(params.get("action")==="parse") return route.fulfill({json:{parse:{text:"<h2>English</h2>"}}});
    const text="==English==\n===Noun===\n====Translations====\n{{trans-top|liquid}}\n* French: {{t|fr|eau}}\n* German: {{t|de|Wasser}}\n{{trans-bottom}}";
    await route.fulfill({json:{query:{pages:params.get("titles").split("|").map(title=>title==="water" ? {title,revisions:[{slots:{main:{content:text}}}]}:{title,missing:true})}}});
  });
  await page.goto(process.env.ETYMAP_URL || "http://127.0.0.1:4173");
  await page.waitForFunction(()=>window.__state?.lexicalIndex && __state.entries.length===2 && !document.querySelector("#live-status").classList.contains("loading"));
  assert.equal(requests.length,1,"Bootstrap downloads only the index, not whole dictionaries");
  const wikiBaseline=wiki.length;
  await page.locator("#dictionary-browser summary").click();
  await page.locator("#dictionary-query").fill("water");
  const idsWater=await page.evaluate(()=>__state.lexicalIndex.concepts.find(c=>c.dataset==="ids" && c.gloss==="WATER"));
  const woldWater=await page.evaluate(()=>__state.lexicalIndex.concepts.find(c=>c.dataset==="wold" && c.gloss==="WATER"));
  await page.locator('[data-dictionary-concept="ids:'+idsWater.localId+'"]').click();
  await page.waitForFunction(count=>__state.entries.length===count && __state.entries[0].lexical,idsWater.forms);
  await page.waitForFunction(()=>!__state.moving && __state.markerCache.size>0);
  assert.equal(requests.length,2);
  assert.equal(await page.locator("#entry-list .entry-row").count(),60);
  assert.equal(await page.locator("#entry-list [data-pronunciation]").count(),0);
  await page.locator("#entry-filter").fill("Batlukh");
  await page.locator("#entry-list [data-select-word]").first().click();
  assert.match(await page.locator("#word-detail").innerText(),/Avar \(Batlukh dialect\)/);
  assert.match(await page.locator("#word-detail").innerText(),/Madzhid Khalilov/);
  assert.match(await page.locator("#word-detail").innerText(),/dictionary-level attribution only/);
  assert.equal(await page.locator("#load-word-family").count(),0);
  assert.match(await page.locator("#word-detail .selection-wiki").getAttribute("href"),/ids.clld.org\/valuesets\//);
  await page.locator("#close-word-detail").click();
  await page.locator("#entry-filter").fill("");
  assert.equal(wiki.length,wikiBaseline,"Dictionary selection does not guess a Wiktionary entry");

  // Actual map moves reuse the same cluster layout within a zoom tier and world
  // wrap; check the cache identity and absence of dictionary I/O during panning.
  const performance=await page.evaluate(async()=>{
    __state.map.setView([20,10],4,{animate:false});
    await new Promise(requestAnimationFrame);
    __renderGeography();
    const layout=__state.clusterLayout;let reused=true;const times=[];
    for(let i=0;i<30;i++) {
      __state.map.panBy([i%2 ? -8:8,0],{animate:false});
      const start=window.performance.now();__renderGeography();times.push(window.performance.now()-start);
      reused &&= __state.clusterLayout===layout;
      await new Promise(requestAnimationFrame);
    }
    times.sort((a,b)=>a-b);
    return {reused,median:times[15],p95:times[28],markers:__state.markerCache.size,forms:__state.entries.length};
  });
  assert.equal(performance.reused,true);
  assert.equal(requests.length,2,"Panning does not download dictionary shards");
  console.log("Pan overlay work (ms, headless browser):",performance);
  await page.evaluate(()=>{__state.map.setView([46,12],5,{animate:false});});
  await page.waitForFunction(()=>!__state.moving);
  if(process.env.ETYMAP_REAL_MAP) await page.waitForFunction(()=>__state.basemap?.getMaplibreMap().isSourceLoaded("etymap-elevation"),{},{timeout:45000});
  await page.mouse.move(1400,900);
  await page.waitForTimeout(350);
  const overlaps=await page.evaluate(()=>{
    const boxes=[...document.querySelectorAll(".cluster-card,.word-chip")].filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect());
    let count=0;
    for(let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++) {
      const a=boxes[i],b=boxes[j];if(a.left<b.right && b.left<a.right && a.top<b.bottom && b.top<a.bottom) count++;
    }
    return count;
  });
  assert.equal(overlaps,0,"Resting map card footprints do not collide");
  assert.ok(await page.evaluate(()=>__state.areas.getLayers().length<=48));
  if(process.env.ETYMAP_SCREENSHOT) await page.screenshot({path:process.env.ETYMAP_SCREENSHOT});

  await page.locator("#dictionary-browser summary").click();
  await page.locator("#dictionary-source").selectOption("wold");
  await page.locator('[data-dictionary-concept="wold:'+woldWater.localId+'"]').click();
  await page.waitForFunction(()=>__state.entries[0]?.lexical?.dataset==="wold");
  await page.locator("#entry-list [data-select-word]").first().click();
  assert.match(await page.locator("#word-detail").innerText(),/Borrowing assessment/);
  assert.match(await page.locator("#word-detail .selection-wiki").getAttribute("href"),/wold.clld.org\/word\/\d+/);
  assert.equal(await page.locator("#show-etymology-map").count(),0);
  assert.equal(wiki.length,wikiBaseline);
  await page.locator("#close-word-detail").click();
  // Cached return, then a stale slow response and a real retryable failure.
  await page.evaluate(id=>{__dictionary(id);},"ids:"+idsWater.localId);
  await page.waitForFunction(()=>__state.entries[0]?.lexical?.dataset==="ids");
  assert.equal(requests.length,3);
  const another=await page.evaluate(()=>__state.lexicalIndex.concepts.find(c=>c.dataset==="ids" && c.gloss==="FIRE"));
  const shard="**/data/lexicon/ids/"+another.localId+".json.gz";
  await page.route(shard,async route=>{await new Promise(resolve=>setTimeout(resolve,350));await route.continue();});
  await page.evaluate(({old,next})=>{__dictionary(old);__dictionary(next);},{old:"ids:"+another.localId,next:"wold:"+woldWater.localId});
  await page.waitForTimeout(450);
  assert.equal(await page.evaluate(()=>__state.entries[0].lexical.dataset),"wold");
  await page.unroute(shard);
  await page.route(shard,route=>route.fulfill({status:503,body:"Retry later"}));
  await page.evaluate(id=>{__dictionary(id);},"ids:"+another.localId);
  await page.waitForFunction(()=>document.querySelector("#live-status").classList.contains("error"));
  await page.unroute(shard);
  await page.evaluate(id=>{__dictionary(id);},"ids:"+another.localId);
  await page.waitForFunction(count=>__state.entries.length===count,another.forms);
  assert.equal(await page.locator("#map-message").isVisible(),false,"Retry clears the old error message");

  await page.locator("#theme-toggle").click();
  await page.locator(".map-options summary").click();
  await page.locator("#lightweight-toggle").check();
  assert.equal(await page.locator(".info-card").evaluate(node=>getComputedStyle(node).backdropFilter),"none");
  await page.locator("#lightweight-toggle").uncheck();
  await page.locator(".map-options summary").click();
  if(process.env.ETYMAP_SCREENSHOT) await page.screenshot({path:process.env.ETYMAP_SCREENSHOT.replace(".png","-night.png")});
  await page.setViewportSize({width:390,height:844});
  await page.locator("#dictionary-browser summary").click();
  await page.locator("#dictionary-query").fill("earth");
  assert.ok(await page.locator(".dictionary-choice").count()>0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(process.env.ETYMAP_SCREENSHOT) await page.screenshot({path:process.env.ETYMAP_SCREENSHOT.replace(".png","-mobile.png")});
  assert.deepEqual(errors,[]);
  console.log("Dictionary browser checks passed: real imports, source attribution, separate senses/varieties, no guessed IPA/etymology, lazy loading, pan caching, races, retry, themes, lightweight glass and mobile.");
} finally {await browser.close();}
