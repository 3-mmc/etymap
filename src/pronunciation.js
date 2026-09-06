import { LANGUAGES, languageName } from "./data.js";

function headingContainer(heading) {
  return heading.parentElement?.classList.contains("mw-heading") ? heading.parentElement : heading;
}

function sectionAfter(document, heading, lastLevel) {
  const range = document.createRange();
  range.setStartAfter(headingContainer(heading));
  const next = [...document.querySelectorAll("h2,h3,h4,h5,h6")].find(candidate =>
    (heading.compareDocumentPosition(candidate) & 4) && Number(candidate.tagName.slice(1)) <= lastLevel);
  if (next) range.setEndBefore(headingContainer(next));
  else range.setEndAfter(document.body.lastChild);
  return range.cloneContents();
}

// Read text only from the requested language and first homograph. Never inject
// Wiktionary HTML into the interface, or use foreign IPA from its etymology.
export function parseRenderedPronunciation(html, name) {
  const document = new DOMParser().parseFromString(html, "text/html");
  const heading = [...document.querySelectorAll("h2")].find(node =>
    node.id === name.replaceAll(" ", "_") || node.querySelector("[id]")?.id === name.replaceAll(" ", "_") || node.textContent.trim() === name);
  if (!heading) return {transliteration:"", ipa:[]};
  const section = sectionAfter(document, heading, 2);
  const second = [...section.querySelectorAll("h3,h4")].find(node => /^Etymology 2\b/.test(node.textContent.trim()));
  const beforeSecond = node => !second || Boolean(node.compareDocumentPosition(second) & 4);
  const headword = [...section.querySelectorAll(".headword-line")].find(beforeSecond);
  const transliteration = headword?.querySelector(".tr")?.textContent.trim() || "";
  const pronunciation = [...section.querySelectorAll("h3,h4,h5")].find(node => /^Pronunciation(?:\s|$)/.test(node.textContent.trim()) && beforeSecond(node));
  const ipa = [];
  if (pronunciation) {
    const level = Number(pronunciation.tagName.slice(1));
    const following = [...section.querySelectorAll("h3,h4,h5,h6")].find(node =>
      (pronunciation.compareDocumentPosition(node) & 4) && Number(node.tagName.slice(1)) <= level);
    for (const node of section.querySelectorAll(".IPA")) {
      if (!(pronunciation.compareDocumentPosition(node) & 4) || (following && !(node.compareDocumentPosition(following) & 4)) || !beforeSecond(node)) continue;
      const text = node.textContent.trim();
      if (!/^(\/.*\/|\[.*\])$/.test(text)) continue;
      const line = node.closest("li");
      const qualifier = [...(line?.querySelectorAll(".ib-content, .qualifier-content") || [])]
        .filter(label => label.closest("li") === line).map(label => label.textContent.trim()).join(" · ");
      if (!ipa.some(item => item.text === text && item.qualifier === qualifier)) ipa.push({text, qualifier});
    }
  }
  return {transliteration:transliteration === "-" ? "" : transliteration, ipa};
}

const cache = new Map();
const waiting = [];
let active = 0;
async function limited(task) {
  if (active >= 2) await new Promise(resolve => waiting.push(resolve));
  else active++;
  try { return await task(); }
  finally { const next = waiting.shift(); if (next) next(); else active--; }
}

export function fetchPronunciation(term, code) {
  const name = LANGUAGES[code]?.wiktionaryName || languageName(code);
  const title = term.startsWith("*") ? "Reconstruction:"+name+"/"+term.slice(1) : term;
  const key = code+":"+title;
  if (cache.has(key)) return cache.get(key);
  const promise = limited(async () => {
    const params = new URLSearchParams({action:"parse", page:title, prop:"text", redirects:"1", format:"json", formatversion:"2", origin:"*"});
    const response = await fetch("https://en.wiktionary.org/w/api.php?"+params, {signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error("Pronunciation lookup failed");
    const data = await response.json();
    if (data.error) throw new Error(data.error.info || "Pronunciation unavailable");
    return parseRenderedPronunciation(data.parse?.text || "", name);
  }).catch(error => {cache.delete(key); throw error;});
  cache.set(key, promise);
  if (cache.size > 128) cache.delete(cache.keys().next().value);
  return promise;
}
