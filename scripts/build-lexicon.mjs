// Reproducible, source-preserving CLDF import. No fuzzy sense/language merging.
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {gzipSync} from "node:zlib";
import {fileURLToPath} from "node:url";
import {parseCSV} from "../src/lexical.js";

const sources=[
  {id:"ids",label:"Intercontinental Dictionary Series",repo:"intercontinental-dictionary-series/ids",version:"v4.3",commit:"4a8810a09b064a42327b884492e7f7ef827add19",doi:"https://doi.org/10.5281/zenodo.7701635"},
  {id:"wold",label:"World Loanword Database",repo:"lexibank/wold",version:"v4.2",commit:"1df62b9bdc7292b35982aea49b4d5bd1951f6f3e",doi:"https://doi.org/10.5281/zenodo.21415389"}
];
const root=new URL("../data/lexicon/",import.meta.url);
const index={schema:1,datasets:{},concepts:[]};
const missing=new Set(["?","∅","-","--","- -","––","???","","-666","666","—","ʼ"]);
const hash = value => createHash("sha256").update(value).digest("hex");
for(const source of sources) {
  const directory=new URL(source.id+"/",root);
  await mkdir(directory,{recursive:true});
  const hashes={};
  async function get(path) {
    // Contents are checked against the lock on subsequent builds rather than
    // trusting mutable release tags.
    const url=`https://raw.githubusercontent.com/${source.repo}/${source.commit}/${path}`;
    const response=await fetch(url,{signal:AbortSignal.timeout(120000)});
    if(!response.ok) throw new Error(url+" returned "+response.status);
    const bytes=Buffer.from(await response.arrayBuffer());hashes[path]=hash(bytes);
    return bytes.toString("utf8");
  }
  const [metadataText,languageText,parameterText,bib,license,formsText]=await Promise.all(
    ["cldf/cldf-metadata.json","cldf/languages.csv","cldf/parameters.csv","cldf/sources.bib","LICENSE","cldf/forms.csv"].map(get));
  const lockPath=new URL("lock.json",directory);
  try {
    const old=JSON.parse(await readFile(lockPath,"utf8"));
    if(old.commit===source.commit && Object.entries(hashes).some(([path,value])=>old.hashes[path]!==value)) throw new Error("Source hashes changed for a pinned commit");
  } catch(error) {if(error.code!=="ENOENT") throw error;}
  const metadata=JSON.parse(metadataText);
  if(metadata["dc:license"]!=="https://creativecommons.org/licenses/by/4.0/") throw new Error("Unreviewed license");
  const languages=Object.fromEntries(parseCSV(languageText).map(row=>{
    const lat=Number(row.Latitude),lon=Number(row.Longitude);
    const point=row.Latitude.trim() && row.Longitude.trim() && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat)<=90 && Math.abs(lon)<=180 ? [lat,lon] : undefined;
    return [row.ID,{name:row.Name,glottocode:row.Glottocode,iso:row.ISO639P3code,point,macroarea:row.Macroarea,family:row.Family,
      authors:row.Authors,consultants:row.Consultants,dataEntry:row.DataEntry,representations:row.Representations,date:row.date,
      url:source.id==="ids" ? "https://ids.clld.org/contributions/"+row.ID : "https://wold.clld.org/vocabulary/"+row.WOLD_ID}];
  }));
  const parameters=new Map(parseCSV(parameterText).map(row=>[row.ID,row]));
  const groups=new Map(), ids=new Set();
  let input=0,skipped=0,withoutWordCitation=0;
  for(const row of parseCSV(formsText)) {
    input++;
    if(ids.has(row.ID)) throw new Error("Duplicate record: "+row.ID);
    ids.add(row.ID);
    if(!languages[row.Language_ID] || !parameters.has(row.Parameter_ID)) throw new Error("Broken CLDF foreign key: "+row.ID);
    if(missing.has(row.Form.trim())) {skipped++;continue;}
    if(source.id==="wold" && !/^\d+$/.test(row.Word_ID)) throw new Error("Missing WOLD word link");
    if(!row.Source) withoutWordCitation++;
    // Preserve all nonempty fields, including original value, annotations,
    // alternative representations, qualifiers and scoped source identifiers.
    const group=groups.get(row.Parameter_ID) || [];
    group.push(Object.fromEntries(Object.entries(row).filter(([,v])=>v!=="")));
    groups.set(row.Parameter_ID,group);
  }
  const expected=metadata.tables.find(table=>table.url==="forms.csv")["dc:extent"];
  if(expected!==input) throw new Error("Unexpected row count: "+input+" / "+expected);
  let bytes=0,maxShard=0;
  for(const [id,rows] of groups) {
    const parameter=parameters.get(id);
    const encoded=gzipSync(JSON.stringify(rows),{level:9});
    bytes+=encoded.length;maxShard=Math.max(maxShard,encoded.length);
    await writeFile(new URL(id+".json.gz",directory),encoded);
    index.concepts.push({dataset:source.id,localId:id,name:parameter.Name,concepticon:parameter.Concepticon_ID,gloss:parameter.Concepticon_Gloss,
      forms:rows.length,varieties:new Set(rows.map(r=>r.Language_ID)).size});
  }
  const stats={input,forms:input-skipped,skipped,withoutWordCitation,varieties:Object.keys(languages).length,
    locatedVarieties:Object.values(languages).filter(l=>l.point).length,glottocodes:new Set(Object.values(languages).map(l=>l.glottocode).filter(Boolean)).size,
    concepts:groups.size,compressedBytes:bytes,maxShardBytes:maxShard};
  const emptyBibliography=[...bib.matchAll(/@\w+\s*\{\s*([^,\s}]+)\s*\}/g)].map(m=>m[1]);
  index.datasets[source.id]={...source,citation:metadata["dc:bibliographicCitation"],license:metadata["dc:license"],languages,stats,emptyBibliography};
  await writeFile(new URL("sources.bib",directory),bib);
  await writeFile(new URL("LICENSE",directory),license);
  await writeFile(new URL("metadata.json",directory),metadataText);
  const lock={...source,hashes,stats};
  await writeFile(lockPath,JSON.stringify(lock,null,2)+"\n");
  console.log(source.id,stats);
}
await writeFile(new URL("index.json.gz",root),gzipSync(JSON.stringify(index),{level:9}));
console.log("Wrote",fileURLToPath(root),index.concepts.length,"source-specific meanings.");
