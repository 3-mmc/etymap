import test from "node:test";
import assert from "node:assert/strict";
import { clusterPoints, prepareBasemap,layoutClusters,labelBounds,labelLayout } from "../src/map-model.js";
import { gzipSync } from "node:zlib";

function bruteClusters(points,radius) {
  const groups=[];
  for(const {item,point} of points) {
    const g=groups.find(g=>Math.hypot(g.point.x-point.x,g.point.y-point.y)<radius);
    if(!g) groups.push({items:[item],point:{...point}});
    else {const n=g.items.length;g.point.x=(g.point.x*n+point.x)/(n+1);g.point.y=(g.point.y*n+point.y)/(n+1);g.items.push(item);}
  }
  return groups;
}

test("spatial index preserves membership across cell edges, negative coordinates, and moving centroids",()=>{
  let seed=47;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
  const points=Array.from({length:1500},(_,i)=>({item:{code:"lang"+i,term:String(i)},point:{x:random()*2400-1200,y:random()*1800-900}}));
  for(const radius of [45,75,105]) {
    assert.deepEqual(clusterPoints(points,radius).map(g=>g.items),bruteClusters(points,radius).map(g=>g.items));
  }
});

test("representative word is closest to centre, with a deterministic tie break",()=>{
  const points=[{item:{code:"c",term:"far"},point:{x:0,y:0}},{item:{code:"b",term:"near"},point:{x:20,y:0}},{item:{code:"a",term:"centre"},point:{x:21,y:0}}];
  assert.equal(clusterPoints(points)[0].representative.term,"near");
  const tie=[{item:{code:"z",term:"last"},point:{x:0,y:0}},{item:{code:"a",term:"first"},point:{x:0,y:0}}];
  assert.equal(clusterPoints(tie)[0].representative.term,"first");
  assert.equal(clusterPoints(tie.toReversed())[0].representative.term,"first");
});

test("night style changes colours without changing tile sources or reintroducing country labels",()=>{
  const source={version:8,sources:{map:{type:"vector",url:"https://example.org/tiles"}},layers:[
    {id:"background",type:"background",paint:{"background-color":"white"}},
    {id:"water",type:"fill","source-layer":"water",paint:{"fill-color":"blue"}},
    {id:"label_state",type:"symbol",layout:{"text-field":"{name}"},paint:{"text-color":"black"}},
    {id:"label_country_1",type:"symbol"},
    {id:"boundary",type:"line","source-layer":"boundary",paint:{"line-color":"grey"}}
  ]};
  const day=prepareBasemap(source), night=prepareBasemap(source,"night");
  assert.deepEqual(night.sources,day.sources);
  assert.equal(night.layers.some(l=>l.id.includes("label_country")),false);
  assert.equal(night.layers.find(l=>l.id==="boundary").layout.visibility,"none");
  assert.notEqual(night.layers[1].paint["fill-color"],day.layers[1].paint["fill-color"]);
  assert.equal(night.layers.find(layer=>layer.id==="label_state").paint["text-color"],"#c0d0d4");
  assert.equal(source.layers[0].paint["background-color"],"white");
});

test("speaker-area failures can retry, and successful geometry is fetched only once",async(t)=>{
  const {loadSpeakerArea}=await import("../src/geography.js?retry-test");
  let downloads=0;
  const feature={type:"Feature",properties:{},geometry:{type:"Polygon",coordinates:[]}};
  t.mock.method(globalThis,"fetch",async(url)=>{
    if(String(url).endsWith("index.json")) return Response.json({test1234:true});
    downloads++;
    return downloads===1 ? new Response("Unavailable",{status:503}):new Response(gzipSync(JSON.stringify(feature)));
  });
  await assert.rejects(loadSpeakerArea("test1234"),/503/);
  assert.deepEqual(await loadSpeakerArea("test1234"),feature);
  assert.deepEqual(await loadSpeakerArea("test1234"),feature);
  assert.equal(downloads,2);
});

test("label collision resolution keeps every form without overlapping card footprints",()=>{
  let seed=43;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
  const points=Array.from({length:800},(_,i)=>({item:{id:"fixture:"+i,code:"code"+i,term:"word"},point:{x:random()*2400-1200,y:random()*1800-900}}));
  for(const zoom of [2,4,7]) {
    const layout=labelLayout(zoom),groups=layoutClusters(points,layout);
    assert.equal(groups.flatMap(g=>g.items).length,points.length);
    assert.equal(new Set(groups.flatMap(g=>g.items)).size,points.length);
    for(let i=0;i<groups.length;i++) {
      const a=labelBounds(groups[i],layout);
      for(let j=i+1;j<groups.length;j++) {
        const b=labelBounds(groups[j],layout);
        assert.ok(a.right+6<=b.left || b.right+6<=a.left || a.bottom+6<=b.top || b.bottom+6<=a.top);
      }
      assert.ok(groups[i].items.includes(groups[i].representative));
    }
  }
});

test("decoded speaker areas use a bounded least-recently-used cache",async(t)=>{
  const {loadSpeakerArea}=await import("../src/geography.js?bounded-test");
  const counts=new Map();
  t.mock.method(globalThis,"fetch",async(url)=>{
    if(String(url).endsWith("index.json")) return Response.json(Object.fromEntries(Array.from({length:82},(_,i)=>["area"+i,true])));
    const path=String(url);counts.set(path,(counts.get(path)||0)+1);
    return new Response(gzipSync(JSON.stringify({type:"Feature",properties:{},geometry:null})));
  });
  for(let i=0;i<80;i++) await loadSpeakerArea("area"+i);
  await loadSpeakerArea("area0"); // refresh, so area1 is the oldest
  await loadSpeakerArea("area80");
  await loadSpeakerArea("area0");
  await loadSpeakerArea("area1");
  assert.equal([...counts].find(([path])=>path.endsWith("/area0.json.gz"))[1],1);
  assert.equal([...counts].find(([path])=>path.endsWith("/area1.json.gz"))[1],2);
});
