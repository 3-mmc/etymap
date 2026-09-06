import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { LANGUAGES, wiktionaryUrl } from "../src/data.js";
import { EARLIEST, PRESENT, inPeriod, resolveLanguage } from "../src/languages.js";
import { clusterPoints, prepareBasemap } from "../src/map-model.js";
import { parseTranslationSenses, parseEtymology, buildJourney, fetchWikitexts } from "../src/wiktionary.js";
import { registerGlottologCSV } from "../src/geography.js";

test("catalogue bridges Wiktionary two-letter codes to Glottolog and WALS", () => {
  const data=JSON.parse(gunzipSync(readFileSync(new URL("../data/languages.json.gz",import.meta.url))));
  assert.ok(Object.keys(data).length>8000);
  assert.equal(data.pl.iso,"pol");
  assert.equal(data.pl.glottocode,"poli1260");
  assert.equal(data.pl.wals[0].id,"pol");
  assert.equal(data.sux.historical,true);
  assert.equal(data.akk.historical,true);
  assert.ok(Object.values(data).every(m=>!m.point || m.point.every(Number.isFinite)));
});

test("historical periods overlap, contemporary data is not projected into antiquity, unknowns stay explicit", () => {
  assert.equal(inPeriod("sux",-2500,-2000),true);
  assert.equal(inPeriod("sux",1500,PRESENT),false);
  assert.equal(inPeriod("unmapped",EARLIEST,PRESENT),true);
  assert.equal(inPeriod("unmapped",-2500,-2000),false);
  assert.equal(inPeriod("unmapped",-2500,-2000,true),true);
  const registry={en:{contemporary:true}};
  assert.equal(inPeriod("en",-2500,-2000,false,registry),false);
  assert.equal(inPeriod("en",2000,PRESENT,false,registry),true);
});

test("translation senses retain cuneiform, alternate forms, unlocated languages, and correct link targets", () => {
  const senses=parseTranslationSenses(`==English==
{{trans-top|id=Q283|inorganic compound H₂O}}
* Sumerian: {{tt|sux|𒀀|tr=a}}, {{t|sux|𒇉|tr=id₂}}
* Unmapped test: {{t|qzz-test|actual title|alt=display form}}
{{trans-bottom}}
{{trans-top|body of water}}
* Polish: {{t|pl|woda}}
{{trans-bottom}}`);
  assert.equal(senses.length,2);
  assert.equal(senses[0].label,"inorganic compound H₂O");
  assert.equal(senses[0].entries.length,3);
  assert.equal(senses[0].entries[0].transliteration,"a");
  const alternate=senses[0].entries[2];
  assert.equal(alternate.term,"actual title");
  assert.equal(alternate.display,"display form");
  assert.match(wiktionaryUrl(alternate.term,alternate.code),/actual%20title/);
  assert.equal(LANGUAGES[alternate.code].point,undefined);
});

test("cuneiform can be the starting entry, even without an etymology chain", () => {
  assert.equal(resolveLanguage("Sumerian"),"sux");
  const nodes=buildJourney("𒀀𒇉","akk","==Akkadian==\n===Etymology===\n{{obor|akk|sux|𒀀𒇉|tr=id₂}}\n===Logogram===\n# river");
  assert.deepEqual(nodes.map(n=>n.code),["akk","sux"]);
  assert.equal(nodes[1].type,"obor");
  assert.ok(nodes.every(n=>n.point));
  assert.doesNotMatch(nodes[0].era,/Modern/);
  assert.equal(buildJourney("𒀀","sux","==Sumerian==\n===Noun===\n# water").length,1);
});

test("blank Glottolog coordinates never turn into a false location at zero", () => {
  const registry={};
  registerGlottologCSV("ISO639P3code,Level,Latitude,Longitude,Name\nqzz,language,,,Missing\nabc,language,0,0,Real zero",registry);
  assert.equal(registry.qzz,undefined);
  assert.deepEqual(registry.abc.point,[0,0]);
});

test("basemap removes country names but keeps regional labels and optional outlines", () => {
  const original={layers:[{id:"label_country_1",type:"symbol"},{id:"label_state",type:"symbol",minzoom:5},{id:"boundary_2","source-layer":"boundary"}]};
  const style=prepareBasemap(original);
  assert.equal(style.layers.length,3);
  assert.ok(!style.layers.some(layer=>layer.id.includes("label_country")));
  assert.equal(style.layers.find(layer=>layer.id==="label_state").minzoom,3);
  assert.equal(style.layers.find(layer=>layer.id==="boundary_2").layout.visibility,"none");
  assert.equal(original.layers.length,3);
});

test("nearby language clusters split on zoom and preserve every entry", () => {
  const points=[0,20,150].map((x,i)=>({point:{x,y:0},item:{code:String(i)}}));
  const wide=clusterPoints(points,75);
  assert.equal(wide.length,2);
  assert.equal(wide.flatMap(g=>g.items).length,3);
  const close=clusterPoints(points.map(p=>({...p,point:{x:p.point.x*10,y:0}})),75);
  assert.equal(close.length,3);
});

test("new etymon references retain explicit relationships and uncertainty", () => {
  const edges=parseEtymology("==Polish==\n===Etymology===\n{{etymon|pl|id=church|:inh|zlw-opl:kościół|:bor<unc>|la:castellum<id:fort>|tree=1}}\n===Noun===", "pl");
  assert.equal(edges.length,2);
  assert.equal(edges[0].source,"zlw-opl");
  assert.equal(edges[0].type,"inh");
  assert.equal(edges[1].term,"castellum");
  assert.equal(edges[1].uncertain,true);
});

test("API batches do not silently discard entries beyond fifty", async (t) => {
  const calls=[];
  t.mock.method(globalThis,"fetch",async (url)=>{
    const titles=new URL(url).searchParams.get("titles").split("|");
    calls.push(titles);
    return new Response(JSON.stringify({query:{pages:titles.map(title=>({title,revisions:[{slots:{main:{content:"==English=="}}}]}))}}));
  });
  const pages=await fetchWikitexts(Array.from({length:121},(_,i)=>"word"+i));
  assert.deepEqual(calls.map(c=>c.length),[50,50,21]);
  assert.equal(pages.size,121);
  assert.ok(pages.has("word120"));
});
