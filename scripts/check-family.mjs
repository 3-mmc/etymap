// Optional browser regressions: serve with npm start; see check-explorer.mjs.
import assert from "node:assert/strict";
const {chromium}=await import(process.env.ETYMAP_PLAYWRIGHT_MODULE || "playwright");
const browser=await chromium.launch({executablePath:process.env.ETYMAP_CHROMIUM || undefined,headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader"]});
const raw={
  water:'==English==\n===Noun===\n====Translations====\n{{trans-top|liquid}}\n* Polish: {{t|pl|woda}}\n{{trans-bottom}}',
  woda:'==Polish==\n===Etymology===\n{{inh|pl|sla-pro|*vodà}} {{cog|ru|вода|tr=voda}}\n===Noun===\n==Old Polish==\n===Noun===',
  'Reconstruction:Proto-Slavic/voda':'==Proto-Slavic==\n===Etymology===\n{{inh|sla-pro|ine-pro|*wódr̥}} {{cog|la|unda}}\n===Noun===',
  'вода':'==Russian==\n===Noun===',
  'unda':'==Latin==\n===Noun==='
};
const span=(code,term,name,display=term)=>'<span lang="'+code+'"><a href="/wiki/'+encodeURIComponent(term)+'#'+name.replaceAll(' ','_')+'">'+display+'</a></span>';
const rendered={
  woda:'<h2 id="Polish">Polish</h2><h3>Etymology</h3><p>'+span('sla-pro','Reconstruction:Proto-Slavic/voda','Proto-Slavic','*vodà')+' '+span('ru','вода','Russian')+'</p><h3>Noun</h3><h4>Descendants</h4><ul><li><span class="desc-arr" title="borrowed">→</span> German: '+span('de','Wodka','German')+'</li></ul><h2>Old Polish</h2><h3>Noun</h3><h4>Descendants</h4><ul><li>'+span('en','wrong-language','English')+'</li></ul>',
  'Reconstruction:Proto-Slavic/voda':'<div class="mw-heading"><h2>Proto-Slavic</h2></div><div class="mw-heading"><h3>Etymology</h3></div><p>'+span('ine-pro','Reconstruction:Proto-Indo-European/wódr̥','Proto-Indo-European','*wódr̥')+' '+span('la','unda','Latin')+'</p><h3>Noun</h3><h4>Descendants</h4><ul><li>West Slavic:<ul><li>Old Polish: '+span('zlw-opl','woda','Old Polish')+'<ul><li>Polish: '+span('pl','woda','Polish')+'</li></ul></li></ul></li><li>East Slavic:<ul><li>Russian: '+span('ru','вода','Russian','вода́')+' <span class="tr">vodá</span></li></ul></li><li><span class="desc-arr" title="uncertain">?</span><span class="desc-arr" title="borrowed">→</span> French: '+span('fr','voda','French')+'</li><li>Unlocated: '+span('qzx-test','unmapped','Unlocated test language')+'</li></ul><h3>References</h3><ul><li>'+span('en','not-a-descendant','English')+'</li></ul><h3>Etymology 2</h3><h4>Descendants</h4><ul><li>'+span('en','wrong-homograph','English')+'</li></ul>',
  'вода':'<h2>Russian</h2><h3>Noun</h3>',
  unda:'<h2>Latin</h2><h3>Noun</h3>'
};
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  let failLatin=false;
  await page.route('**/src/app.js',async route=>{
    const response=await route.fetch();
    // Terrain rendering is exercised separately by check-relief.mjs.
    const source=(await response.text()).replace('const style=prepareBasemap(state.dayStyle,state.theme);','const style=prepareBasemap(state.dayStyle,state.theme); style.layers=style.layers.filter(layer=>layer.id!=="etymap-relief"); delete style.sources["etymap-elevation"];');
    await route.fulfill({response,body:source+'\nwindow.__state=state;window.__select=selectWord;'});
  });
  await page.route('https://tiles.openfreemap.org/styles/positron',route=>route.fulfill({json:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#d3e4e6'}}]}}));
  await page.route('https://en.wiktionary.org/w/api.php?*',async route=>{
    const params=new URL(route.request().url()).searchParams;
    if(params.get('action')==='parse') {
      if(params.get('page')==='Reconstruction:Proto-Slavic/voda') await new Promise(resolve=>setTimeout(resolve,150));
      return route.fulfill({json:{parse:{text:rendered[params.get('page')] || '<h2>English</h2>'}}});
    }
    const titles=params.get('titles').split('|');
    if(failLatin && titles.includes('unda')) return route.fulfill({status:503,body:'Retry'});
    await route.fulfill({json:{query:{pages:titles.map(title=>raw[title] ? {title,revisions:[{slots:{main:{content:raw[title]}}}]} : {title,missing:true})}}});
  });
  await page.goto(process.env.ETYMAP_URL || 'http://127.0.0.1:4173');
  await page.waitForSelector('[data-select-word="pl:woda"]');
  await page.evaluate(async()=>{
    const {LANGUAGES}=await import('./src/data.js');
    LANGUAGES['qzx-test']={name:'Unlocated test language'};
  });
  await page.locator('[data-select-word="pl:woda"]').click();
  await page.waitForSelector('#load-word-family');
  const before=await page.evaluate(()=>({center:__state.map.getCenter(),zoom:__state.map.getZoom(),concept:__state.concept}));
  await page.locator('#load-word-family').click();
  await page.waitForFunction(()=>__state.selection?.family?.status==='ready');
  assert.match(await page.locator('#family-panel').innerText(),/1 descendant forms · 1 listed cognates/);
  assert.equal(await page.locator('[data-family-word="sla-pro:*voda"]').count(),1,'Reconstruction uses the normalized title, not accented display');
  assert.equal(await page.locator('[data-family-word="en:wrong-language"]').count(),0);
  await page.locator('[data-family-word="sla-pro:*voda"]').click();
  await page.waitForFunction(()=>__state.selection?.family?.status==='ready');
  assert.equal(await page.evaluate(()=>__state.selection.item.code),'pl','Family exploration does not replace the selected comparison word');
  const family=await page.evaluate(()=>__state.selection.family);
  assert.equal(family.data.descendants.filter(row=>row.item).length,5);
  assert.ok(family.graph.edges.some(edge=>edge.from==='zlw-opl:woda' && edge.to==='pl:woda'));
  assert.ok(!family.graph.edges.some(edge=>edge.from==='sla-pro:*voda' && edge.to==='pl:woda'));
  assert.ok(!family.graph.nodes.some(item=>item.term==='wrong-homograph' || item.term==='not-a-descendant'));
  assert.equal(family.graph.nodes.find(item=>item.code==='ru').transliteration,'vodá');
  assert.ok(family.graph.nodes.find(item=>item.code==='qzx-test' && !item.point));
  await page.locator('#show-family-map').click();
  await page.waitForFunction(()=>__state.mode==='journey' && !__state.moving);
  assert.ok(await page.locator('path.family-descendant').count());
  assert.ok(await page.locator('path.family-borrowing.uncertain').count());
  assert.ok(await page.locator('path.family-cognate').count());
  assert.equal(await page.locator('path.family-cognate').first().getAttribute('marker-end'),null);
  assert.ok(await page.locator('.journey-node.reconstructed').count());
  if(process.env.ETYMAP_SCREENSHOT) await page.screenshot({path:process.env.ETYMAP_SCREENSHOT});
  await page.locator('#map-back').click();
  await page.waitForFunction(()=>__state.mode==='compare' && !__state.moving && !__state.mapSnapshot);
  assert.deepEqual(await page.evaluate(()=>({center:__state.map.getCenter(),zoom:__state.map.getZoom(),concept:__state.concept})),before);
  failLatin=true;
  await page.locator('[data-family-word="la:unda"]').click();
  await page.waitForFunction(()=>__state.selection.family.status==='error');
  failLatin=false;
  await page.locator('#retry-family').click();
  await page.waitForFunction(()=>__state.selection.family.status==='ready');
  assert.match(await page.locator('#family-panel').innerText(),/does not prove/);
  await page.locator('#family-back').click();
  assert.equal(await page.evaluate(()=>__state.selection.family.item.code),'sla-pro');
  await page.locator('#family-back').click();
  assert.equal(await page.evaluate(()=>__state.selection.family.item.code),'pl');
  // Stale family requests cannot repopulate a closed or replaced selection.
  await page.locator('[data-family-word="sla-pro:*voda"]').click();
  await page.locator('#close-word-detail').click();
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>__state.selection),null);
  await page.locator('[data-select-word="pl:woda"]').click();
  await page.waitForSelector('#load-word-family');
  await page.locator('#load-word-family').click();
  await page.waitForFunction(()=>__state.selection.family.status==='ready');
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log('Family browser checks passed: normalized proto links, nested branches, borrowing/uncertainty, undirected cognates, unlocated forms, language/homograph boundaries, history, retries, stale requests, map round-trip and mobile.');
} finally { await browser.close(); }
