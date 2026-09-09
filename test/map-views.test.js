import test from "node:test";
import assert from "node:assert/strict";
import { MAP_VIEWS, viewBasemap } from "../src/map-views.js";
import { placeFamilyLabels } from "../src/map-model.js";

const base={version:8,sources:{base:{type:"vector",url:"https://example.org/tiles.json"}},layers:[
  {id:"background",type:"background"},
  {id:"water",source:"base","source-layer":"water",type:"fill"},
  {id:"road",source:"base","source-layer":"transportation",type:"line",paint:{"line-color":"#ddd"}},
  {id:"river",source:"base","source-layer":"waterway",type:"line",paint:{"line-color":"#abc"}},
  {id:"border",source:"base","source-layer":"boundary",type:"line"},
  {id:"label_state",source:"base","source-layer":"place",type:"symbol",layout:{"text-field":"{name}"}},
  {id:"label_country_1",source:"base","source-layer":"place",type:"symbol"}
]};
const layer=(style,id)=>style.layers.find(layer=>layer.id===id);
test("map views keep source tiles and projection unchanged, work in both themes, and do not mutate inputs",()=>{
  const original=structuredClone(base), sources=viewBasemap(base).sources;
  for(const theme of ["day","night"]) for(const view of Object.keys(MAP_VIEWS)) {
    const style=viewBasemap(base,theme,view);
    assert.deepEqual(style.sources,sources);
    assert.equal(style.terrain,undefined);
    assert.equal(style.projection,undefined);
    assert.equal(layer(style,"label_country_1"),undefined);
    assert.equal(layer(style,"border").layout.visibility,"none");
    assert.equal(layer(style,"water").paint["fill-color"],layer(style,"etymap-water-mask").paint["fill-color"]);
  }
  assert.deepEqual(base,original);
});
test("view-specific visibility respects relief/border options and minimal's quiet labels",()=>{
  const water=viewBasemap(base,"day","waterways");
  assert.equal(layer(water,"road").layout.visibility,"none");
  assert.equal(layer(water,"river").paint["line-color"],"#3a96af");
  const minimal=viewBasemap(base,"day","minimal",{borders:true,relief:true,labels:true});
  assert.equal(layer(minimal,"label_state").layout.visibility,"none");
  assert.equal(layer(minimal,"border").layout.visibility,"visible");
  assert.equal(layer(minimal,"etymap-relief").layout.visibility,"visible");
  assert.equal(layer(viewBasemap(base,"day","atlas"),"etymap-relief").layout.visibility,"none");
  assert.equal(layer(viewBasemap(base,"day","relief"),"road").layout.visibility,"visible");
});

test("Proto labels avoid collisions and the sidebar without moving graph points",()=>{
  const projected=Array.from({length:5},(_,i)=>({item:{id:i},point:{x:400+i*5,y:200}})),original=structuredClone(projected);
  const labels=placeFamilyLabels(projected,{width:140,height:76},{left:200,right:800,top:50,bottom:600});
  assert.equal(labels.get(projected[0].item),"right","Root gets first choice");
  assert.equal(labels.get(projected[1].item),"left");
  assert.equal(labels.size,2,"Other overlapping labels remain hover/focus-only");
  assert.deepEqual(projected,original,"Points and relationships are untouched");
  assert.equal(placeFamilyLabels(projected,{width:140,height:76},{left:500,right:800,top:50,bottom:600}).size,0);
});
