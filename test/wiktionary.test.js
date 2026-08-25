import test from "node:test";
import assert from "node:assert/strict";
import { LANGUAGES } from "../src/data.js";
import { buildJourney, getLanguageSection, parseEtymology, parseTranslations } from "../src/wiktionary.js";

const fixture = `==English==
===Noun===
# a building
====Translations====
{{trans-top|building for worship}}
* French: {{t+|fr|église|f}}
* German: {{t+|de|Kirche|f}}
* Serbo-Croatian:
*: Cyrillic: {{tt|sr|црква|f}}
{{trans-bottom}}
{{trans-top|to conduct a service}}
* German: {{t+|de|kirchlich begleiten}}
{{trans-bottom}}
==Polish==
===Etymology===
From {{inh+|pl|zlw-opl|cьrky}}, ultimately from {{bor|pl|cu|црькꙑ}}.
===Noun===
{{pl-noun|f}}
`;

test("extracts one language without leaking into the next", () => {
  const section = getLanguageSection(fixture, "English");
  assert.match(section, /Translations/);
  assert.doesNotMatch(section, /Polish/);
});

test("parses supported translation templates", () => {
  assert.deepEqual(parseTranslations(fixture).map(({ code, term }) => ({ code, term })), [
    { code: "fr", term: "église" },
    { code: "de", term: "Kirche" },
    { code: "sr", term: "црква" }
  ]);
});

test("uses a parent language heading for script-only translation labels", () => {
  parseTranslations(fixture);
  assert.equal(LANGUAGES.sr.wiktionaryName, "Serbo-Croatian");
});

test("keeps the largest translation table as one coherent sense", () => {
  assert.equal(parseTranslations(fixture).find((item) => item.code === "de").term, "Kirche");
});

test("turns explicit etymology templates into edges and journey nodes", () => {
  const edges = parseEtymology(fixture, "pl");
  assert.equal(edges[0].source, "zlw-opl");
  assert.equal(edges[1].type, "bor");
  const nodes = buildJourney("cerkiew", "pl", fixture);
  assert.deepEqual(nodes.map((node) => node.code), ["pl", "zlw-opl", "cu"]);
});
