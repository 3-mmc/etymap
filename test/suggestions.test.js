import test from "node:test";
import assert from "node:assert/strict";
import {COVERAGE_DATE,SUGGESTED_WORDS} from "../src/suggestions.js";

test("suggestions have distinct searchable words and explicit dated language coverage",()=>{
  assert.match(COVERAGE_DATE,/^\d{4}-\d{2}-\d{2}$/);
  assert.equal(SUGGESTED_WORDS.length,20);
  assert.equal(new Set(SUGGESTED_WORDS.map(item=>item.word)).size,SUGGESTED_WORDS.length);
  for(const item of SUGGESTED_WORDS) {
    assert.match(item.word,/^[a-z]+$/);
    assert.ok(Number.isInteger(item.languages) && item.languages>=200);
  }
  for(const word of ["water","dog","fish","eye","fire","mother","star","church"]) {
    assert.ok(SUGGESTED_WORDS.some(item=>item.word===word));
  }
});
