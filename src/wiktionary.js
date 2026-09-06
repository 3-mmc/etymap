import { LANGUAGES, languageName } from "./data.js";

const API = "https://en.wiktionary.org/w/api.php";
const ETYMOLOGY_TEMPLATES = new Set([
  "inh", "inh+", "inherited", "bor", "bor+", "borrowed", "der", "der+", "derived", "lbor", "learned borrowing",
  "slbor", "obor", "ubor", "abor", "cal", "clq", "calque", "pcal", "pclq", "sl", "semantic loan"
]);

function cleanTerm(value = "") {
  return value
    .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, "$2")
    .replace(/<!--.*?-->/gs, "")
    .replace(/'''?/g, "")
    .trim();
}

export async function fetchWikitexts(titles, { signal } = {}) {
  const unique = [...new Set(titles.map((title) => title.trim()).filter(Boolean))];
  if (unique.length > 50) {
    const pages = new Map();
    for (let index = 0; index < unique.length; index += 50) {
      for (const [title, page] of await fetchWikitexts(unique.slice(index, index + 50), {signal})) pages.set(title, page);
    }
    return pages;
  }
  if (!unique.length) return new Map();
  const params = new URLSearchParams({
    action: "query",
    prop: "revisions",
    titles: unique.join("|"),
    rvprop: "content|timestamp",
    rvslots: "main",
    redirects: "1",
    format: "json",
    formatversion: "2",
    origin: "*"
  });
  const response = await fetch(`${API}?${params}`, { signal });
  if (!response.ok) throw new Error(`Wiktionary returned ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error.info || "Wiktionary API error");
  const result = new Map();
  for (const page of data.query?.pages || []) {
    if (page.missing) continue;
    result.set(page.title, {
      text: page.revisions?.[0]?.slots?.main?.content || "",
      timestamp: page.revisions?.[0]?.timestamp || null
    });
  }
  for (const item of [...(data.query?.normalized || []), ...(data.query?.redirects || [])]) {
    const destination = result.get(item.to);
    if (destination) result.set(item.from, destination);
  }
  return result;
}

export async function fetchWikitext(title, options) {
  const pages = await fetchWikitexts([title], options);
  return pages.get(title) || [...pages.values()][0] || null;
}

export function getLanguageSection(wikitext, languageNameToFind) {
  const escaped = languageNameToFind.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const start = new RegExp(`^==${escaped}==\\s*$`, "m").exec(wikitext);
  if (!start) return "";
  const contentStart = start.index + start[0].length;
  const rest = wikitext.slice(contentStart);
  const next = /^==[^=].*?==\s*$/m.exec(rest);
  return rest.slice(0, next?.index ?? rest.length);
}

export function getEtymologySection(languageSection) {
  const start = /^={3,5}Etymology(?: \d+)?={3,5}\s*$/m.exec(languageSection);
  if (!start) return "";
  const contentStart = start.index + start[0].length;
  const rest = languageSection.slice(contentStart);
  const next = /^={3,5}[^=].*?={3,5}\s*$/m.exec(rest);
  return rest.slice(0, next?.index ?? rest.length);
}

function splitTemplate(raw) {
  const parts = raw.split("|").map((part) => part.trim());
  const named = {};
  const positional = [];
  for (const part of parts.slice(1)) {
    const equals = part.indexOf("=");
    if (equals > 0) named[part.slice(0, equals).trim()] = part.slice(equals + 1).trim();
    else positional.push(part);
  }
  return { name: parts[0].toLowerCase().replaceAll("_", " "), positional, named };
}

export function parseTranslations(wikitext) {
  return parseTranslationSenses(wikitext).sort((a, b) => b.entries.length - a.entries.length)[0]?.entries || [];
}

export function parseTranslationSenses(wikitext) {
  const english = getLanguageSection(wikitext, "English");
  const blocks = [...english.matchAll(/\{\{trans-top(?:-also)?(?:\|([^{}]*))?\}\}([\s\S]*?)\{\{trans-bottom\}\}/g)];
  const senses = blocks.map((match, index) => ({
    label: cleanTerm(splitTemplate("trans-top|" + (match[1] || "")).positional[0]) || `Meaning ${index + 1}`,
    entries: parseTranslationBlock(match[2])
  }));
  return (senses.length ? senses : [{label:"Translations", entries:parseTranslationBlock(english)}]).filter((sense) => sense.entries.length);
}

function parseTranslationBlock(block) {
  const translations = [];
  const seen = new Set();
  const regex = /\{\{([^{}]+)\}\}/g;
  for (const match of block.matchAll(regex)) {
    const template = splitTemplate(match[1]);
    if (!["t", "t+", "tt", "tt+", "t-check", "t-simple"].includes(template.name)) continue;
    const [code, rawTerm] = template.positional;
    const term = cleanTerm(rawTerm);
    const key = `${code}:${term}`;
    if (!code || !/^[a-z][a-z0-9-]+$/.test(code) || !term || term === "-" || seen.has(key)) continue;
    const label = translationLanguageLabel(block, match.index);
    if (!LANGUAGES[code]) LANGUAGES[code] = { name: label || code };
    if (label) LANGUAGES[code].wiktionaryName ||= label;
    seen.add(key);
    translations.push({ code, term, display:cleanTerm(template.named.alt || term), transliteration:template.named.tr || "", language: label || languageName(code) });
  }
  return translations;
}

function translationLanguageLabel(block, index) {
  const lineStart = block.lastIndexOf("\n", index) + 1;
  const linePrefix = block.slice(lineStart, index);
  const topLevel = /^\*\s+([^:*]+):/.exec(linePrefix)?.[1]?.trim();
  if (topLevel) return topLevel;
  const nested = /^\*:+\s*([^:*]+):/.exec(linePrefix)?.[1]?.trim();
  const parents = [...block.slice(0, lineStart).matchAll(/^\*\s+([^:*]+):/gm)];
  const parent = parents.at(-1)?.[1]?.trim();
  const presentationLabels = new Set(["Cyrillic", "Cyrillic script", "Latin", "Latin script", "Simplified", "Traditional"]);
  if (parent === "Chinese" || presentationLabels.has(nested)) return parent;
  return nested || parent;
}

export function parseEtymology(wikitext, languageCode) {
  const meta = LANGUAGES[languageCode];
  if (!meta) return [];
  const section = getEtymologySection(getLanguageSection(wikitext, meta.wiktionaryName || meta.name));
  if (!section) return [];
  const edges = [];
  const seen = new Set();
  const regex = /\{\{([^{}]+)\}\}/g;
  for (const match of section.matchAll(regex)) {
    const template = splitTemplate(match[1]);
    if (["etymon", "ety"].includes(template.name) && template.positional[0] === languageCode) {
      let type = "der";
      let uncertain = false;
      for (const parameter of template.positional.slice(1)) {
        if (parameter.startsWith(":")) {
          type = parameter.slice(1).split("<")[0];
          uncertain = parameter.includes("<unc>");
          continue;
        }
        // Only explicit immediate references; nested inline chains are not flattened.
        if (!ETYMOLOGY_TEMPLATES.has(type) && type !== "from") continue;
        const reference = /^([a-z][a-z0-9-]+):([^<]+)/.exec(parameter);
        if (!reference) continue;
        const [, source, rawTerm] = reference;
        const term = cleanTerm(rawTerm);
        if (!term || term === "-") continue;
        const edgeKey = `${source}:${term}:${type}`;
        if (seen.has(edgeKey)) continue;
        seen.add(edgeKey);
        edges.push({ type, target:languageCode, source, term, sourceName:languageName(source), uncertain:uncertain || parameter.includes("<unc>") });
      }
      continue;
    }
    if (!ETYMOLOGY_TEMPLATES.has(template.name)) continue;
    const [target, source, rawTerm] = template.positional;
    if (!source || target !== languageCode) continue;
    const term = cleanTerm(rawTerm || "");
    const key = `${source}:${term}:${template.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ type: template.name.replace(/\+$/, "").replaceAll(" ", "_"), target, source, term, sourceName: languageName(source) });
  }
  return edges;
}

export function chooseCluster(edges, languageCode) {
  const first = edges.find((edge) => edge.source && edge.source !== languageCode);
  return first ? { source: first.source, sourceName: first.sourceName, type: first.type } : { source: languageCode, sourceName: "No explicit source", type: "unknown" };
}

export async function enrichTranslations(translations, options) {
  const pages = await fetchWikitexts(translations.map((item) => item.term), options);
  const byLowerTitle = new Map([...pages.entries()].map(([title, value]) => [title.toLocaleLowerCase(), value]));
  return translations.map((item) => {
    const page = pages.get(item.term) || byLowerTitle.get(item.term.toLocaleLowerCase());
    const edges = page ? parseEtymology(page.text, item.code) : [];
    return { ...item, ...chooseCluster(edges, item.code), edges };
  });
}

export function buildJourney(word, languageCode, wikitext) {
  const edges = parseEtymology(wikitext, languageCode);
  const nodes = [{ code: languageCode, term: word, type: "current", era: LANGUAGES[languageCode]?.era || (LANGUAGES[languageCode]?.historical ? "Historical language" : "Selected entry"), point: LANGUAGES[languageCode]?.point }];
  let lastCode = languageCode;
  for (const edge of edges) {
    if (!edge.term || edge.source === lastCode) continue;
    nodes.push({
      code: edge.source,
      term: edge.term,
      type: edge.type,
      uncertain: edge.uncertain || false,
      era: LANGUAGES[edge.source]?.era || "Earlier form",
      point: LANGUAGES[edge.source]?.point
    });
    lastCode = edge.source;
  }
  return nodes;
}
