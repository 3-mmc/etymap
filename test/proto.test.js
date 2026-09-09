import test from "node:test";
import assert from "node:assert/strict";
import { protoGraph, protoWord, isReconstructed } from "../src/proto.js";

test("proto search accepts only catalogue proto languages and canonical reconstructed forms",()=>{
  const registry={pro:{name:"Proto-Test"},en:{name:"English"},ids:{name:"Proto-Test",lexicalDataset:"ids"}};
  assert.deepEqual(protoWord(" word ","pro",registry),{code:"pro",term:"*word"});
  assert.deepEqual(protoWord("*wódr̥","pro",registry),{code:"pro",term:"*wódr̥"});
  for(const code of ["en","ids","missing"]) assert.throws(()=>protoWord("word",code,registry));
  for(const word of ["*","https://example.org","Reconstruction:Proto-Test/word"]) assert.throws(()=>protoWord(word,"pro",registry));
  assert.equal(isReconstructed({term:"*word",lexical:{dataset:"ids"}}),false);
});
test("proto maps isolate reconstructed root and descendants, preserving borrowing/ambiguity and no shortcut edges",()=>{
  const data={root:{code:"a-pro",term:"*root"},ancestors:[{code:"earlier-pro",term:"*earlier",type:"inh"}],cognates:[{code:"sibling",term:"cognate"}],descendants:[
    {id:"1",item:{code:"b-pro",term:"*child"},relation:"listed descendant"},
    {id:"2",parent:"1",item:{code:"att",term:"child"},relation:"borrowed",uncertain:true},
    {id:"3",parent:"2",item:{code:"c-pro",term:"*later"},relation:"listed descendant"},
    {id:"4",item:{code:"d-pro",term:"*unknown-parent"},ambiguous:true,relation:"listed descendant"}
  ]};
  const graph=protoGraph(data);
  assert.equal(graph.nodes.length,5);
  assert.ok(!graph.nodes.some(node=>["earlier-pro","sibling"].includes(node.code)));
  assert.ok(graph.edges.some(edge=>edge.kind==="borrowing" && edge.uncertain));
  const proto=protoGraph(data,true);
  assert.equal(proto.nodes.length,4);
  assert.equal(proto.edges.length,1);
  assert.equal(proto.edges[0].to,"b-pro:*child");
  assert.equal(protoGraph({...data,root:{code:"en",term:"word"}}).nodes.length,0);
});
