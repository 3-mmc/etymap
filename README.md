# Etymap

A full-page atlas of words, published at [3-mmc.github.io/etymap](https://3-mmc.github.io/etymap/).

The map fills the viewport. A floating left-hand card contains search, word data, Wiktionary links, WALS profiles, display options, and time controls. On phones it becomes a collapsible bottom card.

The BeOS-inspired SVG logo doubles as the favicon. Aero Glass panels have translucent tint, a glossy highlight, and restrained blur, with solid fallbacks for reduced-transparency preferences. The moon/sun button switches the UI and basemap between day and night; the initial mode follows your system and an explicit choice is remembered. Changing themes recolours the existing map without fetching a second tileset.

Map clusters show a representative **word +x**, where x counts the other forms, not languages. The representative is the form closest to the cluster's centre, with a stable code/term tie-break. Click the word to open Wiktionary or +x to explore the group. This is a geographic representative, not an etymological-confidence ranking.

Pan/zoom rendering reuses unchanged markers and speaker-area layers, coalesces marker work into animation frames, and uses a spatial grid to find neighbouring clusters. Speaker polygons share a Canvas renderer; inactive rendered layers have a bounded reuse cache. Pending territory work is invalidated as movement begins, and network failures can be retried. Basemap loading no longer delays word searches. Tile downloads still depend on the map provider and connection.

## Exploring

- **Across languages:** search an English concept. The app follows translation subpages and lets you choose a meaning. Every parsed form remains available, including alternate spellings and entries with no coordinates. Search the results by language, word, script, or code; use “Show more” to browse long lists.
- **Word journey:** search a word in any supported script and choose a language by name or Wiktionary code. Historical languages are included. Try Sumerian **𒀀** or Akkadian **𒀀𒇉**. A standalone entry still appears if it has no supported etymology templates.
- **Regional exploration:** click a count to zoom into nearby language locations; counts split into smaller groups as you zoom. Clusters follow distance, not country membership. Regional and local basemap labels replace country names. Political outlines are off by default.
- **Speaker areas:** the existing 4,062 per-language Glottography polygons load on demand at regional zoom. They show contemporary documented areas, with points as fallback.
- **Time:** adjust From/To under Map & time. All periods includes undated languages. A restricted range filters approximate language periods, with an explicit option for undated records. Contemporary polygons are hidden for past-only ranges. The slider does not date individual words or reconstruct historical territorial change.
- **Entry links:** every word opens the relevant Wiktionary language section. Locate buttons focus the map; WALS links open exact matched language profiles.

## Data

The generated catalogue joins 8,243 Wiktionary codes to Glottolog and WALS: 7,490 records have source-matched coordinates and 2,353 have WALS links in the current snapshot. Curated historical context and built-in fallback points supplement this. The code/name join corrects ISO 639-1 versus ISO 639-3 mismatches without guessing fuzzy matches.

[Language sources, licenses, dating conventions, and limitations](data/LANGUAGE_SOURCES.md) · [Speaker-area attribution](data/SPEAKER_AREAS.md)

Wiktionary etymologies are read progressively in API-sized batches, without the former 49-entry sample or 180-form map cap. Long result lists render in batches of 60 for responsiveness; the search always covers all results. Grey means unresolved or no explicit source. Other colours group the first explicit source language, which is not a full cognacy analysis.

Journey arrows point from each explicit source reference to the selected word. They do not assume a chronological chain between source references. Only the first etymology section is parsed; ambiguity and multiple homographs should be checked in Wiktionary.

## Local development

Requires Node.js for tests/data preparation and Python 3 for the preview server. The static site itself needs no application server or API key.

```sh
npm start
npm test
```

Open http://localhost:4173. Leaflet 1.9.4, MapLibre GL 5.6.2 and its Leaflet adapter 0.1.0 are version-pinned CDN dependencies. The basemap is OpenFreeMap Positron, customized in `src/map-model.js`. Current browsers must support gzip `DecompressionStream` for compressed data.

To refresh the language catalogue:

```sh
npm run build:languages
```

The builder records source hashes and counts in `data/language-catalog.json`. To rebuild speaker-area files, see `scripts/build-speaker-areas.mjs` and `data/SPEAKER_AREAS.md`.

GitHub Pages publishes the repository root of `main`. All local assets use relative paths, including the compressed data, so the app works under `/etymap/`.
