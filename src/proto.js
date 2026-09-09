import { LANGUAGES } from "./data.js";
import { familyGraph, familyKey } from "./family.js";

export const PROTO_EXAMPLES = [
  {code:"sla-pro",term:"*voda",label:"Slavic · water"},
  {code:"ine-pro",term:"*wódr̥",label:"Indo-European · water"},
  {code:"map-pro",term:"*daNum",label:"Austronesian · water"}
];
export const isReconstructed = item => !item.lexical && item.term?.startsWith("*");
export function protoWord(term, code, registry=LANGUAGES) {
  const meta=registry[code], clean=term.trim().replace(/^\*/,"");
  if(!meta || meta.lexicalDataset || !/^Proto-/.test(meta.wiktionaryName || meta.name)) throw new Error("Choose a Proto- language from the suggestions.");
  if(!clean || clean.includes(":") || clean.includes("/")) throw new Error("Enter a reconstructed form, not a page URL. An initial * is optional.");
  return {code,term:"*"+clean};
}
// Only this reconstructed root and its explicitly listed descendant subtree.
// Earlier sources and sibling cognates belong to the broader family view.
export function protoGraph(data, onlyReconstructed=false) {
  if(!isReconstructed(data.root)) return {nodes:[],edges:[]};
  const graph=familyGraph({...data,ancestors:[],cognates:[]});
  if(!onlyReconstructed) return graph;
  const nodes=graph.nodes.filter(isReconstructed), ids=new Set(nodes.map(familyKey));
  // Never bridge over a hidden attested stage with an invented direct edge.
  return {nodes,edges:graph.edges.filter(edge=>ids.has(edge.from) && ids.has(edge.to))};
}
