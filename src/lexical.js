import { LANGUAGES, wiktionaryUrl } from "./data.js";

export const entryKey = item => item.id || item.code+":"+item.term;
export const entryUrl = item => item.lexical ? item.lexical.url : wiktionaryUrl(item.term,item.code);
export const entrySource = item => item.lexical?.dataset.toUpperCase() || "Wiktionary";

// Full CSV records, including quoted newlines, escaped quotes and empty cells.
export function parseCSV(text) {
  const rows=[]; let row=[],cell="",quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') { if(quoted && text[i+1]==='"') {cell+='"';i++;} else quoted=!quoted; }
    else if(c==="," && !quoted) {row.push(cell);cell="";}
    else if((c==="\n" || c==="\r") && !quoted) {
      if(c==="\r" && text[i+1]==="\n") i++;
      row.push(cell); if(row.some(Boolean)) rows.push(row);row=[];cell="";
    } else cell+=c;
  }
  if(quoted) throw new Error("Unclosed CSV quote");
  if(cell || row.length) {row.push(cell);rows.push(row);}
  const header=rows.shift() || [];
  return rows.map(values=>{
    if(values.length!==header.length) throw new Error("CSV column count mismatch");
    return Object.fromEntries(header.map((name,i)=>[name.replace(/^\uFEFF/,""),values[i]]));
  });
}

const normalize = value => value.normalize("NFC").toLocaleLowerCase("en").trim();
export function matchConcepts(concepts,query,dataset="all") {
  const q=normalize(query);
  return concepts.filter(c=>dataset==="all" || c.dataset===dataset).map(c=>{
    const name=normalize(c.name), gloss=normalize(c.gloss || "");
    const terms=q.split(/\s+/).filter(Boolean);
    const rank=!q ? 3 : name===q || gloss===q ? 0 : name.startsWith(q) ? 1 : terms.every(t=>(name+" "+gloss).includes(t)) ? 2 : 9;
    return {c,rank};
  }).filter(x=>x.rank<9).sort((a,b)=>a.rank-b.rank || b.c.forms-a.c.forms || a.c.name.localeCompare(b.c.name)).map(x=>x.c);
}

export function registerLexicalLanguages(datasets,registry=LANGUAGES) {
  const byGlotto=new Map();
  for(const [code,meta] of Object.entries(registry)) {
    if(code.includes(":")) continue;
    if(meta.glottocode) {
      const matches=byGlotto.get(meta.glottocode) || [];
      matches.push(meta);byGlotto.set(meta.glottocode,matches);
    }
  }
  for(const dataset of Object.values(datasets)) for(const [id,language] of Object.entries(dataset.languages)) {
    const matches=byGlotto.get(language.glottocode) || [];
    const exact=matches.length===1 ? matches[0] : null;
    // Never collapse dialects into an ISO macrolanguage or borrow its location.
    registry[dataset.id+":"+id]={...language,point:language.point || exact?.point,
      locationSource:language.point ? dataset.label+" CLDF reference coordinate" : exact?.point ? "Exact Glottocode match to language catalogue" : "Location unavailable",
      historical:exact?.historical,period:exact?.period,era:exact?.era,
      contemporary:exact?.contemporary || false,wals:exact?.wals || [],lexicalDataset:dataset.id};
  }
}

export function lexicalEntries(rows,concept) {
  return rows.map(row=>({id:concept.dataset+":"+row.ID,code:concept.dataset+":"+row.Language_ID,
    term:row.Form,source:"unresolved",sourceName:"Lexical evidence only · "+concept.dataset.toUpperCase(),
    lexical:{dataset:concept.dataset,concept,record:row,
      url:concept.dataset==="ids" ? "https://ids.clld.org/valuesets/"+encodeURIComponent(concept.localId+"-"+row.Language_ID) : "https://wold.clld.org/word/"+encodeURIComponent(row.Word_ID)}}));
}

let indexPromise;
const shards=new Map();
async function readGzip(url,signal) {
  const timeout=AbortSignal.timeout(20000);
  const response=await fetch(url,{signal:signal ? AbortSignal.any([signal,timeout]):timeout});
  if(!response.ok) throw new Error("Dictionary data unavailable ("+response.status+"). Retry this meaning.");
  return new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).json();
}
export function loadLexicalIndex() {
  return indexPromise ||= readGzip(new URL("../data/lexicon/index.json.gz",import.meta.url))
    .catch(error=>{indexPromise=null;throw error;});
}
export async function loadLexicalConcept(concept,{signal}={}) {
  signal?.throwIfAborted();
  const id=concept.dataset+":"+concept.localId;
  let rows=shards.get(id);
  if(!rows) {
    if(!/^[\w-]+$/.test(concept.dataset) || !/^[\w-]+$/.test(concept.localId)) throw new Error("Invalid dictionary identifier");
    rows=await readGzip(new URL("../data/lexicon/"+concept.dataset+"/"+concept.localId+".json.gz",import.meta.url),signal);
    if(signal?.aborted) throw signal.reason;
    shards.set(id,rows);
  }
  shards.delete(id);shards.set(id,rows);
  if(shards.size>12) shards.delete(shards.keys().next().value);
  return lexicalEntries(rows,concept);
}
