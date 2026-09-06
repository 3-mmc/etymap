// Optional browser regression suite: serve the site with npm start first.
// Use an installed Playwright, or provide ETYMAP_PLAYWRIGHT_MODULE and
// ETYMAP_CHROMIUM for an existing local installation; no production dependency.
import assert from "node:assert/strict";
const {chromium}=await import(process.env.ETYMAP_PLAYWRIGHT_MODULE || "playwright");
const browser=await chromium.launch({executablePath:process.env.ETYMAP_CHROMIUM || undefined,
  headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader"]});
const fixtures={
  water:`==English==\n===Noun===\n====Translations====\n{{trans-top|liquid}}\n* Russian: {{tt|ru|вода|tr=vodá}}\n* Polish: {{tt|pl|woda}}\n* French: {{tt|fr|eau}}\n* Unlocated test language: {{tt|qzx-test|unmapped}}\n{{trans-bottom}}`,
  "вода":`==Russian==\n===Etymology===\n{{inh|ru|orv|вода|tr=voda}}\n===Pronunciation===\n{{IPA|ru|[vɐˈda]}}\n===Noun===\n{{head|ru|noun|tr=vodá}}`,
  woda:`==Polish==\n===Etymology===\n{{inh|pl|zlw-opl|woda}}\n===Noun===\n{{head|pl|noun}}`,
  eau:`==French==\n===Etymology===\n{{inh|fr|la|aqua}}\n===Noun===\n{{head|fr|noun}}`,
  unmapped:`==Unlocated test language==\n===Noun===\nA fixture without coordinates.`,
  "𒀀":`==Sumerian==\n===Noun===\n{{head|sux|noun|tr=a}}`
};
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[]; page.on("pageerror",error=>errors.push(error.message));
  let failFrench=false;
  const requests=[];
  await page.route("**/src/app.js",async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text())+"\nwindow.__state=state;window.__select=selectWord;"});
  });
  await page.route("https://tiles.openfreemap.org/styles/positron",route=>route.fulfill({json:{version:8,sources:{},layers:[{id:"background",type:"background",paint:{"background-color":"#d3e4e6"}}]}}));
  await page.route("https://en.wiktionary.org/w/api.php?*",async route=>{
    const params=new URL(route.request().url()).searchParams;
    if(params.get("action")==="parse") return route.fulfill({json:{parse:{text:'<h2 id="Russian">Russian</h2><h3>Pronunciation</h3><span class="IPA">[vɐˈda]</span>'}}});
    const titles=params.get("titles").split("|"); requests.push(titles);
    if(titles.length===1 && titles[0]==="вода") await new Promise(resolve=>setTimeout(resolve,250));
    if(failFrench && titles.length===1 && titles[0]==="eau") return route.fulfill({status:503,body:"Try again"});
    await route.fulfill({json:{query:{pages:titles.map(title=>fixtures[title] ?
      {title,revisions:[{slots:{main:{content:fixtures[title]}}}]} : {title,missing:true})}}});
  });
  await page.goto(process.env.ETYMAP_URL || "http://127.0.0.1:4173");
  await page.waitForFunction(()=>window.__state?.entries.length===4 && __state.entries.every(item=>item.edges));
  assert.equal(await page.locator(".mode-tab").count(),0);
  assert.equal(await page.locator("[data-example]").count(),20);
  await page.locator('#entry-filter').fill("Russian");
  const before=await page.evaluate(()=>({center:__state.map.getCenter(),zoom:__state.map.getZoom(),query:__state.entryQuery,sense:document.querySelector('#sense-select').value}));
  await page.locator('[data-select-word^="ru:"]').click();
  await page.waitForFunction(()=>__state.selection?.status==="ready");
  assert.equal(await page.evaluate(()=>__state.mode),"compare");
  assert.match(await page.locator('#word-detail').innerText(),/Old East Slavic/);
  assert.match(await page.locator('#word-detail .selection-wiki').getAttribute('href'),/Russian/);
  await page.locator('#show-etymology-map').click();
  await page.waitForFunction(()=>__state.mode==="journey");
  assert.ok(await page.locator('#journey-lines path.journey-line').count());
  await page.locator('#show-etymology-map').click();
  await page.waitForFunction(()=>__state.mode==="compare" && !__state.mapSnapshot && !__state.moving);
  const after=await page.evaluate(()=>({center:__state.map.getCenter(),zoom:__state.map.getZoom(),query:__state.entryQuery,sense:document.querySelector('#sense-select').value}));
  assert.deepEqual(after,before);
  await page.locator('#close-word-detail').click();
  await page.locator('#entry-filter').fill("");
  // In-flight old selections cannot overwrite the newest selection.
  await page.evaluate(()=>{__state.selectionPages.clear();__select(__state.entries.find(item=>item.code==='ru'));__select(__state.entries.find(item=>item.code==='pl'));});
  await page.waitForFunction(()=>__state.selection?.status==="ready");
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>__state.selection.item.code),"pl");
  failFrench=true;
  await page.evaluate(()=>__select(__state.entries.find(item=>item.code==='fr')));
  await page.waitForFunction(()=>__state.selection?.status==="error");
  assert.ok(await page.locator('#retry-word-detail').isVisible());
  failFrench=false;
  await page.locator('#retry-word-detail').click();
  await page.waitForFunction(()=>__state.selection?.status==="ready");
  // Entries without points still have readable details and links.
  await page.evaluate(()=>__select(__state.entries.find(item=>item.code==='qzx-test')));
  await page.waitForFunction(()=>__state.selection?.status==="ready");
  assert.ok(await page.locator('#show-etymology-map').isDisabled());
  assert.match(await page.locator('#word-detail').innerText(),/No supported explicit source/);
  await page.locator('#close-word-detail').click();
  await page.locator('.direct-search summary').click();
  await page.locator('[data-language="sux"]').click();
  await page.waitForFunction(()=>__state.selection?.status==="ready");
  assert.equal(await page.evaluate(()=>__state.selection.item.code),"sux");
  assert.equal(await page.evaluate(()=>__state.entries.length),4);
  await page.locator('#close-word-detail').click();
  await page.evaluate(()=>__state.map.setView([50,20],2,{animate:false}));
  await page.waitForSelector('.cluster-word');
  await page.locator('.cluster-word').first().click();
  await page.waitForFunction(()=>__state.selection?.status==="ready");
  assert.equal(await page.evaluate(()=>__state.mode),"compare");
  await page.locator('.cluster-more').first().click();
  await page.waitForFunction(()=>Boolean(__state.region) && !__state.moving);
  const regional=await page.evaluate(()=>[...__state.region].sort());
  await page.locator('#show-etymology-map').click();
  await page.locator('#map-back').click();
  await page.waitForFunction(()=>__state.mode==="compare" && !__state.mapSnapshot && !__state.moving);
  assert.deepEqual(await page.evaluate(()=>[...__state.region].sort()),regional);
  await page.locator('#close-word-detail').click();
  await page.evaluate(()=>__state.map.setView([50,20],7,{animate:false}));
  await page.waitForSelector('.map-word-select');
  await page.locator('.map-word-select').first().click();
  await page.waitForFunction(()=>__state.selection?.status==="ready");
  assert.equal(await page.evaluate(()=>__state.mode),"compare");
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log("Explorer browser checks passed: list/cluster/single-label selection, map round-trip, filters and regional groups, races, retries, unlocated entries, direct historical lookup, mobile, and external links.");
} finally { await browser.close(); }
