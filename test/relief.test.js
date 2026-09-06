import test from "node:test";
import assert from "node:assert/strict";
import {prepareBasemap} from "../src/map-model.js";

test("relief is idempotent, beneath labels, masked over water, and shares day/night tiles",()=>{
  const input={version:8,sources:{base:{type:"vector",url:"https://example.com/tiles.json"}},layers:[
    {id:"background",type:"background"},
    {id:"water",type:"fill",source:"base","source-layer":"water",paint:{"fill-color":"blue"}},
    {id:"wood",type:"fill",source:"base","source-layer":"landcover"},
    {id:"rivers",type:"line",source:"base","source-layer":"waterway"},
    {id:"label_state",type:"symbol",layout:{"text-field":"{name}"}},
    {id:"label_country_1",type:"symbol"}
  ]};
  const day=prepareBasemap(input),night=prepareBasemap(day,"night");
  assert.equal(input.layers.length,6,"Input is not mutated");
  assert.equal(night.layers.filter(layer=>layer.id==="etymap-relief").length,1);
  assert.equal(night.layers.filter(layer=>layer.id==="etymap-water-mask").length,1);
  const ids=day.layers.map(layer=>layer.id);
  assert.ok(ids.indexOf("wood")<ids.indexOf("etymap-relief"));
  assert.ok(ids.indexOf("etymap-relief")<ids.indexOf("etymap-water-mask"));
  assert.ok(ids.indexOf("etymap-water-mask")<ids.indexOf("rivers"));
  assert.ok(!ids.includes("label_country_1"));
  assert.deepEqual(day.sources,night.sources);
  assert.equal(day.sources["etymap-elevation"].encoding,"terrarium");
  assert.equal(day.sources["etymap-elevation"].maxzoom,12);
  assert.notEqual(day.layers.find(layer=>layer.id==="etymap-relief").paint["hillshade-highlight-color"],night.layers.find(layer=>layer.id==="etymap-relief").paint["hillshade-highlight-color"]);
  assert.equal(day.layers.find(layer=>layer.id==="water").paint["fill-color"],day.layers.find(layer=>layer.id==="etymap-water-mask").paint["fill-color"]);
});
