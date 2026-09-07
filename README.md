# Etymap

A full-page atlas of words, published at [3-mmc.github.io/etymap](https://3-mmc.github.io/etymap/).

The map fills the viewport. A floating left-hand card contains search, word data, Wiktionary links, WALS profiles, display options, and time controls. On phones it becomes a collapsible bottom card.

The BeOS-inspired SVG logo doubles as the favicon. Liquid-glass-inspired panels use lighter translucent tints, rounded rims, static edge highlights, and restrained blur, with solid fallbacks for reduced-transparency preferences. The moon/sun button switches the UI and basemap between day and night; the initial mode follows your system and an explicit choice is remembered. Changing themes recolours the existing map and relief without fetching a second tileset.

Map clusters show a representative **word +x**, where x counts the other forms, not languages. The representative is the form closest to the cluster's centre, with a stable record-key tie-break. Card-footprint collision handling accounts for right-aligned single labels and centered clusters, merging overlaps into stacks without dropping forms. Click the word to read its etymology or dictionary record in the sidebar. Hover the card to preview the other forms in a downward stack; click +x (or focus it and press Enter) to keep the stack open. Each form has a selection button, language, available readings, and a separate ↗ source link. Escape, clicking elsewhere, or moving the map dismisses the stack. Large groups scroll without zooming the map and render 30 additional rows at a time, with no new network requests just for hovering. This is a geographic representative, not an etymological-confidence ranking.

Labels use **semantic zoom**: compact words at world scale, then larger words, language names, romanisation and IPA at regional/close zoom. Hover or keyboard-focus a label for a readable preview; its width stays fixed and long text wraps downwards. Stacks open above the card only when there is too little room below, and stay clear of the mobile bottom panel. The side panel always exposes the full available readings. Denser clusters expand through +x, so labels do not need to become microscopic. Glass uses 16px desktop / 10px mobile sidebar blur, static highlights, and no per-label blur or refraction shaders. Only the single open word stack receives a small 6px blur.

Romanisation and IPA are separately labelled under word forms. Explicit IPA and headword romanisations are extracted during the existing etymology fetches. “Get pronunciation”, opening a word's location popup, or selecting a journey root retrieves Wiktionary's rendered pronunciation (including language-template-generated IPA). These lookups are cached and limited to two concurrent requests; panning never starts pronunciation requests. Unavailable readings are not invented. Only the requested language's first pronunciation section/first homograph is used; check Wiktionary for additional homographs, dialects, audio, and qualifications. A romanisation is not an IPA transcription. Historical-language pronunciations may be scholarly reconstructions.

Pan/zoom rendering reuses unchanged markers and speaker-area layers, coalesces marker work into animation frames, and uses a spatial grid to find neighbouring clusters. Clustering is cached per zoom, data, time range, and world-wrap anchor: panning changes viewport visibility without regrouping words at the viewport edge. Entry lookups use an index rather than repeatedly scanning the full result list. Speaker polygons and point circles use Canvas; decoded and rendered territory caches are bounded to 80 reusable records, and at most 48 nearby territories are requested/rendered at a time. The caption flags when zooming will reveal more. Geometry construction yields between downloaded areas, and pending territory work is invalidated as movement begins. Filter/slider rendering is coalesced into animation frames. Basemap loading no longer delays word searches. Tile downloads still depend on the map provider and connection; these changes do not promise a universal frame rate. **Lightweight glass** under Map & time offers a remembered solid-surface option for slower devices.

## Exploring

- **Across languages:** search an English concept. The app follows translation subpages and lets you choose a meaning. Every parsed form remains available, including alternate spellings and entries with no coordinates. Search the results by language, word, script, or code; use “Show more” to browse long lists.
- **Research dictionaries:** expand the section below search to browse IDS and WOLD. Search a gloss, optionally filter the collection, and choose an exact source meaning to map it. The import adds 502,191 source-attributed records across 3,124 source-specific meanings, with 319 IDS and 41 WOLD dictionary-variety records (overlapping, not 360 new unique languages). Selecting a form shows its original value, representation labels, annotations, credits, license, record ID, and source links. No Wiktionary match, IPA, or cognacy is guessed. Search above again to return to Wiktionary results.
- **Suggested words:** 20 ideas cover basic vocabulary, nature, animals, numbers, and kinship. The suggestions were checked against the largest parsed translation sense on 2026-09-06; distinct language-code counts are stored in `src/suggestions.js` and shown in button tooltips. These are dated coverage snapshots, not live guarantees or counts of mapped languages. Suggestions add no startup API requests.
- **Word details, without tabs:** select a word in the result list or on the map to open its etymological sources, readings, period information, Wiktionary links, and WALS profiles in the same sidebar. The language map stays put until you choose **View etymology on map**. **Back to language map** restores the previous centre and zoom without resetting the comparison sense, language filter, regional group, or result limit. Selecting a different word cancels the previous detail lookup; up to 64 fetched entry pages are cached for reuse. Background translation enrichment continues while viewing a word's sources.
- **Direct lookup:** expand **Look up a word in any language** to search a word in any supported script and choose a language by name or Wiktionary code. Historical languages are included. Try Sumerian **𒀀** or Akkadian **𒀀𒇉**. A standalone entry still appears if it has no supported etymology templates. Unlocated entries remain readable even when their map action is unavailable.
- **Word families:** select **Explore descendants & cognates** in a word's sidebar. Browse explicit earlier forms, nested descendant branches, and separately listed cognates. Follow an earlier form—including a starred reconstruction—to explore its other branches; **Previous family** retraces up to 12 steps without replacing the original comparison word. **View this family on map** plots the loaded family, using directional source/descendant links, orange dashed borrowing links, and dotted undirected cognate links. Map return preserves the comparison view. Large descendant lists render 60 rows at a time; maps with more than 40 visible family forms show labels on hover/focus. Unlocated and time-filtered forms remain in the sidebar.
- **Regional exploration:** open a +x stack and choose **Zoom to this group** to focus nearby language locations; counts split into smaller groups as you zoom. Clusters follow distance, not country membership. Regional and local basemap labels replace country names. Political outlines are off by default.
- **Speaker areas:** the existing 4,062 per-language Glottography polygons load on demand at regional zoom. They show contemporary documented areas, with points as fallback.
- **Relief:** shaded mountains and valleys provide geographic context beneath language layers, while seas remain flat and regional labels stay legible. **Terrain relief** under **Map & time** turns shading on/off. The flat hillshade uses Mapzen's public elevation tiles, capped at source zoom 12 and reused at closer zoom; no 3D terrain mesh is generated. Elevation is geographic context, not evidence of a particular historical contact or migration. [Terrain credits and source details](data/TERRAIN_SOURCES.md).
- **Time:** adjust From/To under Map & time. All periods includes undated languages. A restricted range filters approximate language periods, with an explicit option for undated records. Contemporary polygons are hidden for past-only ranges. The slider does not date individual words or reconstruct historical territorial change.
- **Entry links:** words select their sidebar details; adjacent ↗ links open the relevant Wiktionary language section or actual dictionary source. Locate buttons select the word and focus the map; WALS links open exact matched language profiles.

## Data

The generated catalogue joins 8,243 Wiktionary codes to Glottolog and WALS: 7,490 records have source-matched coordinates and 2,353 have WALS links in the current snapshot. Curated historical context and built-in fallback points supplement this. The code/name join corrects ISO 639-1 versus ISO 639-3 mismatches without guessing fuzzy matches.

[Language sources, licenses, dating conventions, and limitations](data/LANGUAGE_SOURCES.md) · [Speaker-area attribution](data/SPEAKER_AREAS.md)

[Imported dictionary sources, licenses, measured counts, and accuracy limitations](data/LEXICAL_SOURCES.md). IDS and WOLD are available as separate source-specific meaning maps, alongside Wiktionary. Per-meaning gzip shards are under 15 KB each; only the index and selected meanings are downloaded. All nonempty original CLDF fields and bibliographies are retained. Missing word-level citations and empty bibliography entries are explicitly disclosed. [Further coverage candidates and integration requirements](data/COVERAGE_PLAN.md) covers additional Lexibank collections and structured Wiktionary extraction, which remain future work.

Wiktionary etymologies are read progressively in API-sized batches, without the former 49-entry sample or 180-form map cap. Long result lists render in batches of 60 for responsiveness; the search always covers all results. Grey means unresolved or no explicit source. Other colours group the first explicit source language, which is not a full cognacy analysis.

Journey arrows point from each explicit source reference to the selected word. They do not assume a chronological chain between source references. Only the first etymology section is parsed; ambiguity and multiple homographs should be checked in Wiktionary.

Family exploration combines explicit source and `cog`/`cognate` templates with Wiktionary's rendered Descendants sections, including subtrees Wiktionary expands. It preserves list nesting, script alternatives, normalized entry titles, romanisations, borrowing markers and uncertainty where supported. A starred form links to the Reconstruction namespace; it is not presented as attested. Plain grouping headings are not invented proto-words. Ambiguous multiple-parent branches remain readable without a guessed parent edge; mixed per-form relation flags are qualified rather than assigned to every variant. Unknown-language links and template errors are flagged as incomplete coverage. Source/cognate wording may need context from the full entry, and `noncog` templates are excluded.

This is an explorer of **documented, first-etymology relationships**, not a claim to retrieve every descendant or prove cognacy. Only explicitly listed cognates are labelled as such; sharing an ancestor or a meaning does not automatically colour every descendant as a cognate, especially across borrowing edges. Additional branches can be followed entry by entry; no unbounded recursive crawl runs in the browser. Family lookups are on demand, share a two-request concurrency limit and a 16-page rendered cache with pronunciation lookups, reuse raw entry pages, and cannot overwrite a newer/closed selection. The app extracts text and validated Wiktionary links rather than inserting remote HTML.

## Local development

Requires Node.js for tests/data preparation and Python 3 for the preview server. The static site itself needs no application server or API key.

```sh
npm start
npm test
```

Open http://localhost:4173. Leaflet 1.9.4, MapLibre GL 5.6.2 and its Leaflet adapter 0.1.0 are version-pinned CDN dependencies. The basemap is OpenFreeMap Positron, customized in `src/map-model.js`. Current browsers must support gzip `DecompressionStream` for compressed data.

Optional browser regressions: with the preview running and Playwright installed, run `node scripts/check-explorer.mjs`. It uses deterministic Wiktionary fixtures to check selections, map round-trips, stale requests, retries, unlocated words, and mobile overflow. Existing Playwright/Chromium installations can be supplied through `ETYMAP_PLAYWRIGHT_MODULE` and `ETYMAP_CHROMIUM`; `ETYMAP_URL` overrides the preview URL.

`node scripts/check-family.mjs` additionally checks descendant hierarchy, normalized proto links, borrowing and uncertainty, undirected cognacy, first-language/first-homograph boundaries, family history, retries and map return. `ETYMAP_SCREENSHOT` optionally saves a test screenshot.

`node scripts/check-relief.mjs` uses the real public map/elevation tiles with small lexical fixtures to check relief rendering, its toggle, shared day/night sources, reduced-transparency support and mobile layout.

`node scripts/check-lexicon.mjs` uses the real imported dictionary shards to check source attribution, variety separation, lazy loading, cached panning, stale requests, retries, and lightweight glass. `ETYMAP_REAL_MAP=1` enables the real basemap/relief instead of a deterministic blank map. `ETYMAP_SCREENSHOT` saves desktop, night, and mobile views. Reported overlay timings are headless-test measurements, not hardware-independent FPS claims.

To reproduce the dictionary import: `npm run build:lexicon`. Versions and commits are pinned in `scripts/build-lexicon.mjs`; hashes, original licenses, metadata, and bibliographies are retained in each dataset directory. Tests validate all 502,191 records. Future user-supplied dictionaries should retain permissions, contributors, variety IDs, meaning definitions, original forms, and representation labels; see the source notes above.

To refresh the language catalogue:

```sh
npm run build:languages
```

The builder records source hashes and counts in `data/language-catalog.json`. To rebuild speaker-area files, see `scripts/build-speaker-areas.mjs` and `data/SPEAKER_AREAS.md`.

GitHub Pages publishes the repository root of `main`. All local assets use relative paths, including the compressed data, so the app works under `/etymap/`.
