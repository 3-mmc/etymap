import test from "node:test";
import { combinedEntries } from "../src/lexical.js";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {gunzipSync,gzipSync} from "node:zlib";
import {parseCSV,matchConcepts,registerLexicalLanguages,lexicalEntries,entryKey,entryUrl} from "../src/lexical.js";
import {LANGUAGES} from "../src/data.js";
import {resolveLanguage} from "../src/languages.js";

test("CLDF CSV preserves quoted newlines, commas, escaped quotes, Unicode and empty fields",()=>{
  assert.deepEqual(parseCSV('\uFEFFID,Form,Comment\r\n1,"a,b","A ""quote""\nnext line"\r\n2,𒀀,\r\n'),[
    {ID:"1",Form:"a,b",Comment:'A "quote"\nnext line'}, {ID:"2",Form:"𒀀",Comment:""}
  ]);
  assert.throws(()=>parseCSV('ID,Form\n1,"bad'),/quote/);
  assert.throws(()=>parseCSV('ID,Form\n1,bad,extra'),/count/);
});

test("meaning search ranks but does not merge source senses or glosses",()=>{
  const concepts=[
    {dataset:"ids",localId:"a",name:"earth, land",gloss:"LAND",forms:100},
    {dataset:"ids",localId:"b",name:"earth=ground, soil",gloss:"EARTH (SOIL)",forms:300},
    {dataset:"wold",localId:"c",name:"the earth",gloss:"EARTH (SOIL)",forms:20}
  ];
  assert.equal(matchConcepts(concepts,"land")[0].localId,"a");
  assert.equal(matchConcepts(concepts,"earth").length,3);
  assert.equal(matchConcepts(concepts,"earth","wold").length,1);
  assert.equal(matchConcepts(concepts,"astronaut").length,0);
});

test("dictionary varieties retain scoped identities and never borrow ISO parent coordinates",()=>{
  const registry={av:{name:"Avar",iso:"ava",glottocode:"avar1234",point:[42,46],contemporary:true},x:{name:"Exact",glottocode:"same1234",point:[5,6]}};
  registerLexicalLanguages({ids:{id:"ids",label:"IDS",languages:{26:{name:"Avar (Batlukh)",iso:"ava",glottocode:"batl1238"},27:{name:"Another variety",glottocode:"same1234"},28:{name:"Own coordinate",point:[0,0]}}}},registry);
  assert.equal(registry["ids:26"].point,undefined);
  assert.equal(registry["ids:26"].contemporary,false);
  assert.deepEqual(registry["ids:27"].point,[5,6]);
  assert.deepEqual(registry["ids:28"].point,[0,0]);
  assert.equal(registry.av.name,"Avar");
});

test("lexical keys preserve identical forms in separate records, source links and uncertainty",()=>{
  const c={dataset:"ids",localId:"1-100",name:"world"};
  const rows=[{ID:"26-1-100-1",Language_ID:"26",Form:"дуниял",Value:"дуниял",AlternativeValues:"duniyal"},{ID:"26-1-100-2",Language_ID:"26",Form:"дуниял"}];
  const entries=lexicalEntries(rows,c);
  assert.notEqual(entryKey(entries[0]),entryKey(entries[1]));
  assert.equal(entryUrl(entries[0]),"https://ids.clld.org/valuesets/1-100-26");
  assert.deepEqual(entries[0].lexical.record,rows[0]);
  assert.equal(entries[0].source,"unresolved");
  assert.equal(entries[0].ipa,undefined);
  const wold=lexicalEntries([{ID:"a",Language_ID:"Swahili",Form:"dunia",Word_ID:"72141734767181903",Borrowed:"1. clearly borrowed"}],{dataset:"wold",localId:"1-1"})[0];
  assert.equal(entryUrl(wold),"https://wold.clld.org/word/72141734767181903");
  assert.equal(wold.edges,undefined);
});

test("dictionary variety codes cannot masquerade as Wiktionary languages in direct lookup",()=>{
  LANGUAGES["ids:test"]={name:"A dataset-only variety",lexicalDataset:"ids"};
  assert.equal(resolveLanguage("ids:test"),undefined);
  assert.equal(resolveLanguage("A dataset-only variety"),undefined);
  assert.equal(resolveLanguage("Polish"),"pl");
  delete LANGUAGES["ids:test"];
});

test("published dictionary shards validate every record, meaning, source and measured count",async()=>{
  const root=new URL("../data/lexicon/",import.meta.url);
  const index=JSON.parse(gunzipSync(await readFile(new URL("index.json.gz",root))));
  assert.equal(index.schema,1);
  assert.equal(index.concepts.length,3124);
  let total=0;
  for(const dataset of Object.values(index.datasets)) {
    const concepts=index.concepts.filter(c=>c.dataset===dataset.id), ids=new Set();
    const bibliography=await readFile(new URL(dataset.id+"/sources.bib",root),"utf8");
    const sourceIds=new Set([...bibliography.matchAll(/@\w+\s*\{\s*([^,\s}]+)(?=\s*[,}])/g)].map(m=>m[1]));
    const actualFiles=(await readdir(new URL(dataset.id+"/",root))).filter(f=>f.endsWith(".json.gz"));
    assert.equal(actualFiles.length,concepts.length);
    assert.equal(dataset.license,"https://creativecommons.org/licenses/by/4.0/");
    let count=0,withoutCitation=0;
    for(const concept of concepts) {
      const bytes=await readFile(new URL(dataset.id+"/"+concept.localId+".json.gz",root));
      assert.ok(bytes.length<=15000,"Per-meaning payload stays small");
      const rows=JSON.parse(gunzipSync(bytes));
      assert.equal(rows.length,concept.forms);
      assert.equal(new Set(rows.map(r=>r.Language_ID)).size,concept.varieties);
      for(const row of rows) {
        assert.ok(!ids.has(row.ID));ids.add(row.ID);
        assert.equal(row.Parameter_ID,concept.localId);
        assert.ok(dataset.languages[row.Language_ID]);
        assert.ok(row.Form.trim());
        if(row.Source) for(const source of row.Source.split(";")) assert.ok(sourceIds.has(source.split("[")[0].trim()),source);
        else withoutCitation++;
        if(dataset.id==="wold") assert.match(row.Word_ID,/^\d+$/);
      }
      count+=rows.length;
    }
    assert.equal(count,dataset.stats.forms);
    assert.equal(withoutCitation,dataset.stats.withoutWordCitation);
    total+=count;
  }
  assert.equal(total,502191);
});

test("dictionary shards are on-demand, cached, abortable, bounded and retryable",async(t)=>{
  const {loadLexicalConcept}=await import("../src/lexical.js?cache-tests");
  const requests=[];let fail=true;
  t.mock.method(globalThis,"fetch",async(url,options)=>{
    requests.push(String(url));
    if(options?.signal?.aborted) throw options.signal.reason;
    if(fail) return new Response("Unavailable",{status:503});
    return new Response(gzipSync(JSON.stringify([{ID:"1",Language_ID:"26",Form:"word"}])));
  });
  const concept={dataset:"ids",localId:"1-100"};
  await assert.rejects(loadLexicalConcept(concept),/503/);
  fail=false;
  await loadLexicalConcept(concept);await loadLexicalConcept(concept);
  assert.equal(requests.length,2);
  for(let i=0;i<13;i++) await loadLexicalConcept({...concept,localId:"test-"+i});
  await loadLexicalConcept(concept);
  assert.equal(requests.length,16,"Old meanings evict from the 12-shard LRU");
  const controller=new AbortController();controller.abort();
  await assert.rejects(loadLexicalConcept({...concept,localId:"cancelled"},{signal:controller.signal}),{name:"AbortError"});
  await assert.rejects(loadLexicalConcept({...concept,localId:"../invalid"}),/identifier/);
});
test("co-displayed sources preserve duplicate spellings, source identities, and independently hidden or failed layers",()=>{
  const wiki=[{code:"en",term:"water"}], ids={id:"ids:1",code:"ids:en",term:"water"}, wold={id:"wold:1",code:"wold:en",term:"water"};
  const layers=new Map([["ids",{status:"ready",enabled:true,entries:[ids]}],["wold",{status:"ready",enabled:true,entries:[wold]}],["failed",{status:"error",enabled:true,entries:[{}]}]]);
  assert.deepEqual(combinedEntries(wiki,layers),[...wiki,ids,wold]);
  layers.get("ids").enabled=false;
  assert.deepEqual(combinedEntries(wiki,layers,false),[wold]);
  layers.get("wold").status="loading";
  assert.deepEqual(combinedEntries(wiki,layers,false),[]);
  assert.equal(wiki.length,1);
});
