# Language catalogue and historical context

The catalogue is a local, reproducible join of public datasets. `language-catalog.json` records the retrieval time, counts, source URLs, and SHA-256 hashes. Run `npm run build:languages` to refresh it. The app fetches the compressed catalogue once; it does not download the entire Glottolog CSV on each search.

## Attribution and joins

- **Wiktionary contributors**, [Module:languages/code_to_canonical_name](https://en.wiktionary.org/wiki/Module:languages/code_to_canonical_name), CC BY-SA 4.0. Supplies the canonical language codes and language-section names. Live word data comes from Wiktionary's revision API; all displayed forms link back to the original entries. The derived catalogue is provided under CC BY-SA 4.0, with the constituent attributions retained.
- **Glottolog contributors**, [Glottolog CLDF](https://github.com/glottolog/glottolog-cldf), CC BY 4.0. Supplies Glottocodes, representative coordinates, and macroareas. Matching uses ISO codes or an exact canonical-name match, never a fuzzy match. Blank coordinates are not interpreted as zero. The catalogue's matched points do not claim the full extent of a language's territory.
- **Dryer, Matthew S. & Haspelmath, Martin (eds.)**, [WALS Online](https://wals.info), [CLDF dataset](https://github.com/cldf-datasets/wals), CC BY 4.0. Adds links to WALS language profiles, family/genus context, and representative coordinates where Glottolog has none. Profiles match by Glottocode, with ISO fallback only when no Glottocode is available. Multiple WALS varieties are retained as separate links. WALS is a typological atlas, not an etymology or language-boundary dataset.
- **SIL International**, [ISO 639-3 code tables](https://iso639-3.sil.org/code_tables/download_tables). Supplies the ISO 639-1/639-3 crosswalk and language-type flags. These flags help distinguish contemporary, historical, ancient, and extinct languages; they do not provide dates of extinction or dates of word use.
- **Glottography / Asher & Moseley (2007)**, [contemporary language areas](https://doi.org/10.5281/zenodo.15287258), CC BY 4.0. Existing per-language polygons remain unchanged. They appear on demand at regional zoom and only when the selected period includes the present. They are not historical boundaries. See [SPEAKER_AREAS.md](./SPEAKER_AREAS.md).
- **OpenFreeMap / OpenMapTiles / OpenStreetMap contributors**, [OpenFreeMap](https://openfreemap.org). The Positron vector basemap is restyled to omit country-name layers and hide political outlines by default. Regional, settlement, and water labels remain. Political outlines are an optional reference layer, not language territories. The simplified fallback uses [Natural Earth](https://www.naturalearthdata.com), public domain.

## Time controls

The default is **all periods**, including undated languages. Narrowing the range retains languages whose curated periods overlap it. ISO living-language records can appear at the present endpoint; no date of origin is inferred for them. Languages without dated ranges are excluded from a restricted period unless “Include undated languages” is enabled. This is a language-context filter, not a historical linguistic census. It neither dates a Wiktionary form nor interpolates a language's geographic movement.

`src/languages.js` contains deliberately broad, editorial ranges for a small set of historical languages. Ancient Near Eastern ranges include written/scribal usage where stated. Start and end dates are approximate, and early proto-cuneiform cannot always be assigned a language securely. The cuneiform examples are languages written with a script, not a language called “Cuneiform.”

| Language | Approximate filter range | Representative context |
| --- | --- | --- |
| Sumerian | 3200 BCE–100 CE | Southern Mesopotamia; includes scribal survival |
| Akkadian | 2500 BCE–100 CE | Mesopotamia; includes scribal survival |
| Hittite | 1650–1180 BCE | Central Anatolia |
| Hurrian | 2300–1000 BCE | Upper Mesopotamia |
| Urartian | 900–600 BCE | Armenian Highlands |
| Ugaritic | 1400–1180 BCE | Northern Levant |
| Old Persian | 525–300 BCE | Fars |

Reference context: [Oracc, Introduction to Cuneiform Sign Lists](https://oracc.museum.upenn.edu/dcclt/signlists/signlists/); [The Metropolitan Museum, early Sumerian writing](https://www.metmuseum.org/art/collection/search/327385); [Cambridge, Hurrian](https://www.cambridge.org/core/books/abs/ancient-languages-of-asia-minor/hurrian/190C6E806AD18A753663423855472264); [Encyclopaedia Iranica, Urartian](https://www.iranicaonline.org/articles/iran-vii4-urartian/); [Iranica, Iranian language documentation](https://www.iranicaonline.org/articles/iran-vi2-documentation/); [Iranica, first dated Old Persian text](https://www.iranicaonline.org/articles/iran-viii1-persian-literature-pre-islamic/). These sources contextualize the editorial periods; the UI's rounded endpoints are not claimed as exact source quotations.

Existing Latin, Ancient Greek, Old/Middle English, Old High German, Old French, Old Polish and reconstructed Germanic/Slavic preview periods are retained as approximate context. Reconstructed language periods and locations are hypotheses, not attestations. Other historical and extinct languages remain searchable without inventing missing dates. Latin, Sanskrit, and liturgical languages in particular cannot be completely represented by a single historical interval.

## Coverage limits

8,243 catalogue codes do not mean 8,243 translations for every concept. Coverage depends on the selected English translation table and sense, supported templates, and available coordinates. The app follows translation subpages, offers separate sense selection, preserves alternate forms and unlocated results, and fetches etymologies in API-sized batches. It does not infer translations from definitions, mine the entire Wiktionary dump, or conflate unrelated senses. Source references are taken from the first etymology section of the selected language; a page with multiple homographic etymologies needs that context checked in Wiktionary.

For a journey, arrows go from each explicit source reference to the selected entry. References within one etymology paragraph are not silently converted into a chain of direct borrowings between the cited source languages. Orthographic borrowing is identified separately from lexical borrowing. Entries without a supported etymology still display and link normally.
