import { LANGUAGES, languageName, wiktionaryUrl } from "./data.js";
import { getLanguageSection, getEtymologySection, parseEtymology, splitTemplate, cleanReading } from "./wiktionary.js";

export const familyKey = item => item.code+":"+item.term;
export const familyTitle = item => item.term.startsWith("*") ? "Reconstruction:"+(LANGUAGES[item.code]?.wiktionaryName || languageName(item.code))+"/"+item.term.slice(1) : item.term;
const normalized = value => value.normalize("NFC").replaceAll("_"," ").trim();

// Only explicit cog/cognate templates, never noncog, lookalikes, or translation matches.
export function parseCognates(wikitext,code) {
  const section=getEtymologySection(getLanguageSection(wikitext,LANGUAGES[code]?.wiktionaryName || languageName(code)));
  const items=new Map();
  for(const match of section.matchAll(/\{\{([^{}]+)\}\}/g)) {
    const t=splitTemplate(match[1]);
    if(!["cog","cognate"].includes(t.name)) continue;
    const term=cleanReading(t.positional[1]);
    if(!term) continue;
    for(const source of (t.positional[0] || "").split(",").map(value=>value.trim())) {
      if(!LANGUAGES[source]) continue;
      const item={code:source,term,display:cleanReading(t.named.alt || t.positional[2]) || term,
        transliteration:cleanReading(t.named.tr),qualifier:cleanReading(t.named.q || t.named.qq),
        relation:"listed cognate"};
      items.set(familyKey(item),item);
    }
  }
  return [...items.values()];
}

function headingContainer(node) { return node.parentElement?.classList.contains("mw-heading") ? node.parentElement : node; }
function sectionAfter(document,heading) {
  const range=document.createRange();
  range.setStartAfter(headingContainer(heading));
  const level=+heading.tagName.slice(1);
  const next=[...document.querySelectorAll("h2,h3,h4,h5,h6")].find(node=>(heading.compareDocumentPosition(node)&4) && +node.tagName.slice(1)<=level);
  if(next) range.setEndBefore(headingContainer(next));
  else range.setEndAfter(document.body.lastChild);
  return range.cloneContents();
}

// Extract vetted Wiktionary links and text, never render remote HTML/scripts/styles.
function linkedForm(anchor) {
  const span=anchor.closest("[lang]");
  if(!span || span.closest(".tr,.mention-gloss,.qualifier-content,.ib-content,sup")) return null;
  let url;
  try { url=new URL(anchor.getAttribute("href"),"https://en.wiktionary.org"); } catch { return null; }
  if(url.origin!=="https://en.wiktionary.org") return null;
  let title;
  try { title=url.pathname.startsWith("/wiki/") ? decodeURIComponent(url.pathname.slice(6)) : url.pathname==="/w/index.php" ? url.searchParams.get("title") : null; } catch { return null; }
  if(!title || (title.includes(":") && !title.startsWith("Reconstruction:"))) return null;
  title=normalized(title);
  let code=span.getAttribute("lang"), term=title;
  const reconstructed=/^Reconstruction:([^/]+)\/(.+)$/.exec(title);
  let name;
  try { name=reconstructed?.[1] || decodeURIComponent(url.hash.slice(1)).replaceAll("_"," "); } catch { return null; }
  if(name) {
    const exact=Object.entries(LANGUAGES).find(([key,meta])=>!key.includes("_") && (meta.wiktionaryName || meta.name)===name);
    if(exact) code=exact[0];
  }
  if(!LANGUAGES[code]) return null;
  if(reconstructed) term="*"+reconstructed[2];
  return {code,term,display:anchor.textContent.trim(),url:wiktionaryUrl(term,code),missing:anchor.classList.contains("new"),point:LANGUAGES[code]?.point};
}

export function parseRenderedFamily(html,wikitext,root) {
  const document=new DOMParser().parseFromString(html,"text/html");
  const name=LANGUAGES[root.code]?.wiktionaryName || languageName(root.code);
  const heading=[...document.querySelectorAll("h2")].find(node=>node.textContent.trim()===name || node.id===name.replaceAll(" ","_"));
  if(!heading) throw new Error("Wiktionary’s rendered page has no "+name+" section.");
  const section=sectionAfter(document,heading);
  const second=[...section.querySelectorAll("h3,h4")].find(node=>Number(/^Etymology\s+(\d+)\b/.exec(node.textContent.trim())?.[1])>1);
  if(second) {
    const range=document.createRange(); range.setStartBefore(headingContainer(second)); range.setEndAfter(section.lastChild); range.deleteContents();
  }
  const etymHeading=[...section.querySelectorAll("h3,h4,h5")].find(node=>/^Etymology(?:\s|$)/.test(node.textContent.trim()));
  // Clone just the etymology's siblings so normalized cognate/source links cannot
  // accidentally resolve against a different sense or a descendant's spelling.
  const etym=document.createElement("div");
  if(etymHeading) {
    for(let node=headingContainer(etymHeading).nextSibling;node;node=node.nextSibling) {
      if(node.nodeType===1 && (node.matches("h2,h3,h4,h5,h6") || node.querySelector("h2,h3,h4,h5,h6"))) break;
      etym.append(node.cloneNode(true));
    }
  }
  const etymLinks=[...etym.querySelectorAll("a[href]")].map(linkedForm).filter(Boolean);
  const canonical=item=>{
    const link=etymLinks.find(value=>value.code===item.code && [value.term,value.display].some(text=>normalized(text)===normalized(item.term) || normalized(text)===normalized(item.display || item.term)));
    return {...item,...link,point:LANGUAGES[item.code]?.point};
  };
  const ancestors=parseEtymology(wikitext,root.code).filter(edge=>edge.term && edge.term!=="-").map(edge=>canonical({code:edge.source,term:edge.term,transliteration:edge.transliteration,type:edge.type,uncertain:edge.uncertain,relation:edge.type}));
  const cognates=parseCognates(wikitext,root.code).map(canonical);
  const descendants=[];
  let skipped=0, hasDescendants=false;
  const descendantHeadings=[...section.querySelectorAll("h3,h4,h5,h6")].filter(node=>/^Descendants(?:\s|$)/.test(node.textContent.trim()));
  for(const descendantHeading of descendantHeadings) {
    hasDescendants=true;
    const content=document.createElement("div");
    const level=+descendantHeading.tagName.slice(1);
    for(let node=headingContainer(descendantHeading).nextSibling;node;node=node.nextSibling) {
      const nextHeading=node.nodeType===1 ? (node.matches("h2,h3,h4,h5,h6") ? node : node.querySelector("h2,h3,h4,h5,h6")) : null;
      if(nextHeading && +nextHeading.tagName.slice(1)<=level) break;
      content.append(node.cloneNode(true));
    }
    const parents=new Map();
    for(const line of content.querySelectorAll("li,dd")) {
      if(line.closest(".references,.reflist")) continue;
      const parentElement=line.parentElement.closest("li,dd");
      const parent=parents.get(parentElement);
      const own=line.cloneNode(true);
      own.querySelectorAll("ul,ol,dl,style,script,sup,.mw-editsection").forEach(node=>node.remove());
      const links=[...own.querySelectorAll("a[href]")];
      const forms=links.map(linkedForm).filter(Boolean);
      const unique=[...new Map(forms.map(item=>[familyKey(item),item])).values()];
      const flags=[...own.querySelectorAll(".desc-arr[title]")].map(node=>node.title);
      const inheritedFlags=parent?.groupFlags || [];
      const allFlags=[...new Set([...inheritedFlags,...flags])];
      const qualifier=[...own.querySelectorAll(".ib-content,.qualifier-content")].map(node=>node.textContent.trim()).join(" · ");
      const transliterations=[...own.querySelectorAll(".tr")].map(node=>node.textContent.trim());
      const groupText=own.textContent.replace(/\s+/g," ").trim().replace(/:$/,"" );
      const depth=parent ? parent.depth+1:0;
      const ancestor=parent?.item ? parent : parent?.ancestor;
      if(unique.length) {
        const rowItems=unique.map((item,index)=>{
          const row={id:"desc-"+descendants.length,depth,item:{...item,transliteration:unique.length===transliterations.length ? transliterations[index] : unique.length===1 ? transliterations[0] || "":""},
            parent:ancestor?.id || null,ambiguous:parent?.ambiguous || false,
            // Mixed per-form markers are preserved as a qualified list-level label;
            // never assign the first form's borrowing flag to every sibling.
            relation:unique.length>1 && flags.length ? "mixed relations — check entry" : allFlags.filter(flag=>flag!=="uncertain").join(" · ") || "listed descendant",
            uncertain:allFlags.includes("uncertain"),qualifier,grouped:Boolean(parent && !parent.item)};
          descendants.push(row); return row;
        });
        parents.set(line,rowItems.length===1 ? rowItems[0] : {depth,ambiguous:true,ancestor:null});
      } else {
        const unsupported=links.some(anchor=>anchor.closest("[lang]"));
        if(unsupported) skipped++;
        const row={id:"desc-"+descendants.length,depth,label:groupText || "Unparsed branch",ancestor:unsupported ? null:ancestor,
          ambiguous:unsupported || parent?.ambiguous || false,groupFlags:allFlags};
        if(groupText) descendants.push(row);
        parents.set(line,row);
      }
    }
    skipped+=content.querySelectorAll(".error,.scribunto-error").length;
  }
  return {root:{...root,point:LANGUAGES[root.code]?.point},ancestors,cognates,descendants,hasDescendants,skipped};
}

export function familyGraph(data) {
  const forms=new Map();
  const add=item=>{forms.set(familyKey(item),item);return familyKey(item);};
  const root=add(data.root), edges=[];
  for(const item of data.ancestors) edges.push({from:add(item),to:root,kind:/bor/.test(item.type) ? "borrowing":"source",label:item.type,uncertain:item.uncertain});
  const rows=new Map(data.descendants.map(row=>[row.id,row]));
  for(const row of data.descendants) {
    if(!row.item) continue;
    const to=add(row.item);
    if(row.ambiguous) continue;
    const parent=rows.get(row.parent)?.item || data.root;
    edges.push({from:familyKey(parent),to,kind:row.relation.includes("borrow") ? "borrowing":"descendant",label:row.relation,uncertain:row.uncertain});
  }
  for(const item of data.cognates) edges.push({from:root,to:add(item),kind:"cognate",label:"listed cognate"});
  return {nodes:[...forms.values()],edges:edges.filter(edge=>edge.from!==edge.to)};
}
