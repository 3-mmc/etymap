import test from "node:test";
import assert from "node:assert/strict";
import {parseCognates,familyGraph,familyTitle} from "../src/family.js";

test("cognates are explicit, first-etymology-only, and not noncognates or translations",()=>{
  const items=parseCognates(`==English==
===Etymology 1===
{{cog|de,nl|water|alt=wáter|tr=water}}; {{cognate|ru|вода|tr=vodá|q=possibly}}.
{{noncog|fr|eau}} {{l|es|agua}} {{cog|de|-}} {{cog|de|{{unknown}}}}
===Noun===
{{t|fr|eau}}
===Etymology 2===
{{cog|it|acqua}}
==French==
===Etymology===
{{cog|pt|água}}`,"en");
  assert.deepEqual(items.map(item=>item.code),["de","nl","ru"]);
  assert.equal(items[0].display,"wáter");
  assert.equal(items[2].qualifier,"possibly");
  assert.equal(items[2].transliteration,"vodá");
});

test("family graphs preserve branch parents and keep cognacy undirected in kind",()=>{
  const root={code:"la",term:"aqua"};
  const data={root,ancestors:[{code:"ine-pro",term:"*h₂ekʷeh₂",type:"inh"}],
    descendants:[{id:"a",item:{code:"fr",term:"eau"},relation:"listed descendant"},
      {id:"b",parent:"a",item:{code:"en",term:"eau"},relation:"borrowed",uncertain:true},
      {id:"c",item:{code:"de",term:"test"},ambiguous:true}],
    cognates:[{code:"sa",term:"अप्"}]};
  const graph=familyGraph(data);
  assert.equal(graph.nodes.length,6);
  assert.ok(graph.edges.some(edge=>edge.from==="fr:eau" && edge.to==="en:eau" && edge.kind==="borrowing" && edge.uncertain));
  assert.ok(graph.edges.some(edge=>edge.kind==="cognate" && edge.to==="sa:अप्"));
  assert.ok(!graph.edges.some(edge=>edge.to==="de:test"));
  assert.ok(!graph.edges.some(edge=>edge.from==="la:aqua" && edge.to==="en:eau"));
});

test("reconstructed family lookups use Wiktionary's Reconstruction namespace",()=>{
  assert.equal(familyTitle({code:"sla-pro",term:"*voda"}),"Reconstruction:Proto-Slavic/voda");
  assert.equal(familyTitle({code:"pl",term:"woda"}),"woda");
});
