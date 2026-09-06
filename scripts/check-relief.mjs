// Integration check against the real basemap/elevation tiles; lexical fixtures
// keep this check small and deterministic. Requires the optional Playwright setup.
import assert from "node:assert/strict";
const {chromium}=await import(process.env.ETYMAP_PLAYWRIGHT_MODULE || "playwright");
const browser=await chromium.launch({executablePath:process.env.ETYMAP_CHROMIUM || undefined,headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader"]});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],terrain=[];
  page.setDefaultTimeout(30000);
  page.on("pageerror",error=>errors.push(error.message));
  page.on("console",entry=>{if(entry.type()==="error") console.warn(entry.text());});
  page.on("response",response=>{if(response.url().includes("elevation-tiles-prod/terrarium/")) terrain.push(response.status());});
  await page.route("**/src/app.js",async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+"\nwindow.__state=state;"});});
  await page.route("https://en.wiktionary.org/w/api.php?*",async route=>{
    const params=new URL(route.request().url()).searchParams;
    if(params.get("action")==="parse") return route.fulfill({json:{parse:{text:"<h2>English</h2>"}}});
    const text="==English==\n===Noun===\n====Translations====\n{{trans-top|liquid}}\n* French: {{t|fr|eau}}\n* German: {{t|de|Wasser}}\n* Italian: {{t|it|acqua}}\n* Slovene: {{t|sl|voda}}\n{{trans-bottom}}";
    await route.fulfill({json:{query:{pages:params.get("titles").split("|").map(title=>title==="water" ? {title,revisions:[{slots:{main:{content:text}}}]}:{title,missing:true})}}});
  });
  await page.goto(process.env.ETYMAP_URL || "http://127.0.0.1:4173");
  await page.waitForFunction(()=>__state?.entries.length===4 && __state.basemap?.getMaplibreMap().getLayer("etymap-relief"));
  await page.evaluate(()=>{__state.map.setView([46,12],5.5,{animate:false});});
  await page.waitForFunction(()=>!__state.moving && __state.basemap.getMaplibreMap().isSourceLoaded("etymap-elevation"),{},{timeout:45000});
  assert.ok(terrain.some(status=>status===200),"Real elevation tiles arrived");
  assert.ok(terrain.every(status=>status===200),"Elevation tile requests succeeded");
  const day=await page.evaluate(()=>{
    const gl=__state.basemap.getMaplibreMap();
    return {sources:gl.getStyle().sources,colour:gl.getPaintProperty("etymap-relief","hillshade-highlight-color"),countries:gl.getStyle().layers.filter(l=>l.id.includes("label_country")).length,error:__state.reliefError};
  });
  assert.equal(day.countries,0); assert.equal(day.error,false);
  await page.waitForTimeout(500);
  if(process.env.ETYMAP_SCREENSHOT) await page.screenshot({path:process.env.ETYMAP_SCREENSHOT});
  console.log("Relief day rendering verified.");
  await page.locator(".map-options summary").click();
  await page.locator("#relief-toggle").uncheck();
  assert.equal(await page.evaluate(()=>__state.basemap.getMaplibreMap().getLayoutProperty("etymap-relief","visibility")),"none");
  await page.locator("#relief-toggle").check();
  await page.locator(".map-options summary").click();
  await page.locator("#theme-toggle").click();
  const night=await page.evaluate(()=>({sources:__state.basemap.getMaplibreMap().getStyle().sources,colour:__state.basemap.getMaplibreMap().getPaintProperty("etymap-relief","hillshade-highlight-color")}));
  assert.deepEqual(night.sources,day.sources);
  assert.notEqual(night.colour,day.colour);
  await page.waitForTimeout(400);
  if(process.env.ETYMAP_SCREENSHOT) await page.screenshot({path:process.env.ETYMAP_SCREENSHOT.replace(".png","-night.png")});
  console.log("Relief night rendering verified.");
  const session=await page.context().newCDPSession(page);
  await session.send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-transparency",value:"reduce"}]});
  console.log("Reduced-transparency preference applied.");
  assert.equal(await page.locator(".info-card").evaluate(node=>getComputedStyle(node).backdropFilter),"none");
  await session.send("Emulation.setEmulatedMedia",{features:[]});
  console.log("Glass accessibility fallback verified.");
  await page.setViewportSize({width:390,height:844});
  console.log("Mobile viewport applied.");
  await page.locator("#collapse-card").click();
  console.log("Mobile sidebar collapsed.");
  await page.evaluate(()=>{__state.map.setView([46,12],5,{animate:false});});
  console.log("Mobile camera positioned.");
  await page.waitForFunction(()=>__state.basemap.getMaplibreMap().isSourceLoaded("etymap-elevation"),{},{timeout:45000});
  const alignment=await page.evaluate(()=>{
    const gl=__state.basemap.getMaplibreMap(), rect=gl.getContainer().getBoundingClientRect();
    const point=gl.project([12,46]), expected=__state.map.latLngToContainerPoint([46,12]);
    return {dx:Math.abs(point.x+rect.left-expected.x),dy:Math.abs(point.y+rect.top-expected.y),width:gl.getContainer().clientWidth};
  });
  assert.ok(alignment.dx<2 && alignment.dy<2,"Relief and language coordinates stay aligned after resize: "+JSON.stringify(alignment));
  assert.ok(alignment.width<500,"The basemap drawing surface resized for mobile");
  console.log("Mobile alignment verified:",alignment);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(process.env.ETYMAP_SCREENSHOT) await page.screenshot({path:process.env.ETYMAP_SCREENSHOT.replace(".png","-mobile.png")});
  assert.deepEqual(errors,[]);
  console.log("Relief checks passed: real DEM tiles, terrain toggle, no country labels, shared night/day sources, glass accessibility fallback, and mobile layout.");
} catch(error) { console.error(error); throw error; }
finally { await browser.close(); }
