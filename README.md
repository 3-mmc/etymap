# Etymon

Etymon is a browser prototype for turning Wiktionary translation and etymology templates into two geographic views:

1. **Across languages** maps a concept's translation table. Each word links to its English Wiktionary entry and colours group the first explicit source-language template found in that word's etymology.
2. **One word's journey** reads a selected language section and draws the sequence expressed by templates such as `{{inh}}`, `{{bor}}`, and `{{der}}`.

At world scale, the comparative view groups located entries by country. Clicking a numbered country loads open ADM1 boundaries and the matching contemporary Glottography speaker-area vectors; numbered subregions can continue to ADM2 and ADM3 before revealing individual language locations. Every visible word label and every entry in the details panel links directly to the matching Wiktionary language section.

## Run it

The app has no package dependencies. It needs an internet connection for Wiktionary, Glottolog, geoBoundaries, Leaflet, fonts, and boundary GeoJSON.

```bash
npm start
```

Open <http://localhost:4173>. Run the parser tests with:

```bash
npm test
```

## How the data works

The browser calls the [MediaWiki revisions API](https://www.mediawiki.org/wiki/API:Revisions) with anonymous CORS enabled and reads raw entry wikitext. The parser deliberately uses explicit templates instead of attempting to infer etymology from prose:

- Translation tables: `t`, `t+`, compact `tt`/`tt+`, `t-check`, `t-simple`
- Relationships: `inh`, `bor`, `der`, learned borrowings, calques, and semantic loans

Common-language coordinates and broad historical dates live in [`src/data.js`](./src/data.js). The comparative map extends this registry at runtime from [Glottolog's CLDF LanguageTable](https://github.com/glottolog/glottolog-cldf), whose representative points make minority and endangered languages far less likely to disappear behind national-language metadata. Country polygons come from the Natural Earth-derived [`world.geo.json`](https://github.com/johan/world.geo.json) dataset. Subnational ADM1–ADM3 boundaries are loaded on demand from the CC BY 4.0 [geoBoundaries gbOpen API](https://www.geoboundaries.org/api.html).

## Prototype limitations

- Wiktionary is semi-structured. Prose-only, nested, or language-specific etymologies may not produce a chain.
- Similar-colour words share the **first explicit source language in their own entries**. This is a conservative grouping, not proof of an ultimate common root.
- Language territories are many-to-many, change over time, and rarely align with administrative borders. Glottolog coordinates are representative points, **not speaker-area polygons**. Administrative drill-down says where that point falls; it does not claim the language is confined to that unit.
- Contemporary speaker-area polygons come from the CC BY 4.0 [Glottography Atlas dataset](https://github.com/Glottography/asher2007world). Its roughly 89 MB global GeoJSON is preprocessed by `scripts/build-speaker-areas.mjs` into 4,062 per-Glottocode compressed vector shards. A drill-down requests only the languages needed for that region.
- This client-side prototype is good for exploration. A production service should ingest Wikimedia dumps, parse templates with a real wikitext parser, cache normalized etymology graphs, and expose provenance/revision IDs for every edge.

Wiktionary text is available under CC BY-SA; attribution and compatible downstream licensing must be preserved in a deployed product.
