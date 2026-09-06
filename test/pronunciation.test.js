import test from "node:test";
import assert from "node:assert/strict";
import { parsePronunciation, parseTranslations, buildJourney } from "../src/wiktionary.js";
import { labelLayout, clusterPoints } from "../src/map-model.js";

test("explicit IPA stays within its language, first pronunciation and first homograph", () => {
  const text=`==English==
===Pronunciation===
{{IPA|en|/foreign/}}
==Russian==
===Etymology 1===
{{bor|ru|en|word|tr=not the headword}}
{{IPA|ru|/etymology quotation/}}
====Pronunciation====
{{IPA|ru|/one/|;|[two]|a1=regional|q2=careful speech}}
{{IPA|en|/wrong language/}}
====Noun====
{{ru-noun|tr=slóvo}}
===Etymology 2===
====Pronunciation====
{{IPA|ru|/different homograph/}}
====Noun====
{{ru-noun|tr=wrong}}
==French==
===Pronunciation===
{{IPA|fr|/foreign/}}`;
  assert.deepEqual(parsePronunciation(text,"ru"), {transliteration:"slóvo", ipa:[
    {text:"/one/",qualifier:"regional"}, {text:"[two]",qualifier:"careful speech"}
  ]});
});

test("generated IPA template inputs are not mistaken for transcriptions", () => {
  assert.deepEqual(parsePronunciation(`==French==
===Pronunciation===
{{fr-IPA|église}}
===Noun===
{{head|fr|noun}}`, "fr"), {transliteration:"",ipa:[]});
});

test("line-level accent qualifications stay attached to explicit IPA", () => {
  assert.deepEqual(parsePronunciation("==English==\n===Pronunciation===\n* {{a|UK}} {{IPA|en|/test/}}", "en").ipa,
    [{text:"/test/",qualifier:"UK"}]);
});

test("suppressed romanisation and unsupported nested markup are not displayed", () => {
  const text=`==English==
===Translations===
{{trans-top|word}}
* Russian: {{tt|ru|слово|tr=-}}
{{trans-bottom}}`;
  assert.equal(parseTranslations(text)[0].transliteration, "");
  assert.equal(parsePronunciation("==Russian==\n===Noun===\n{{head|ru|noun|tr=-}}", "ru").transliteration, "");
  assert.deepEqual(parsePronunciation("==English==\n===Pronunciation===\n{{IPA|en|[word]|q1=<bad>}}", "en").ipa,[{text:"[word]",qualifier:""}]);
});

test("journeys keep selected and source romanisations separate", () => {
  const nodes=buildJourney("слово","ru",`==Russian==
===Etymology===
{{bor|ru|cu|слово|tr=slovo-source}}
===Pronunciation===
{{IPA|ru|/slovo/}}
===Noun===
{{head|ru|noun|tr=slovo-root}}`);
  assert.equal(nodes[0].transliteration,"slovo-root");
  assert.equal(nodes[1].transliteration,"slovo-source");
  assert.deepEqual(nodes[0].ipa,[{text:"/slovo/",qualifier:""}]);
});

test("semantic zoom has bounded sizes and shows more world-scale representatives", () => {
  assert.equal(labelLayout(2).detail,"compact");
  assert.equal(labelLayout(3.5).detail,"medium");
  assert.equal(labelLayout(6).detail,"close");
  assert.ok(labelLayout(2).width < labelLayout(4).width);
  assert.ok(labelLayout(4).width < labelLayout(8).width);
  const points=Array.from({length:10},(_,i)=>({item:{code:"en",term:String(i)},point:{x:i*90,y:0}}));
  assert.ok(clusterPoints(points,labelLayout(2).radius).length > clusterPoints(points,105).length);
});
