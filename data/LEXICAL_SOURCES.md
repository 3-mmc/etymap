# Research dictionaries in Etymap

Imported 2026-09-07 from immutable CLDF commits. These are published lexical
records, not AI-generated translations, independent verification of each word,
or additional proven etymologies.

| Collection | Pinned release | Imported records | Dictionary varieties | Source-specific meanings |
| --- | --- | ---: | ---: | ---: |
| Intercontinental Dictionary Series (IDS) | [v4.3](https://doi.org/10.5281/zenodo.7701635) | 437,902 | 319 | 1,310 |
| World Loanword Database (WOLD) | [v4.2](https://doi.org/10.5281/zenodo.21415389) | 64,289 | 41 | 1,814 |

The total is **502,191 records**, not that many unique words. The 360
dataset-variety records overlap across collections; they are not 360 new or
distinct languages. Synonyms, polysemous words, and dialects are retained.
WOLD's CLDF meanings include distinctions beyond its familiar 1,460-item outline.
All 3,124 dataset-local meaning IDs are kept separate, even when they share a
Concepticon ID. No source rows in these releases were removed as missing-form
placeholders. Counts are checked against the source metadata and generated shards.

## Attribution and rights

**IDS:** Key, Mary Ritchie & Comrie, Bernard (eds.) 2023. *The Intercontinental
Dictionary Series*. Leipzig: Max Planck Institute for Evolutionary Anthropology.
[Original collection](https://ids.clld.org/) ·
[Pinned CLDF source](https://github.com/intercontinental-dictionary-series/ids/tree/4a8810a09b064a42327b884492e7f7ef827add19).
Use the linked dictionary's individual authors, consultants, and data-entry
credits when citing a vocabulary. Those fields, original source IDs, and the
[unaltered bibliography](lexicon/ids/sources.bib) are retained here.

**WOLD:** Haspelmath, Martin & Tadmor, Uri (eds.) 2009. *World Loanword Database*.
Leipzig: Max Planck Institute for Evolutionary Anthropology.
[Original collection](https://wold.clld.org/) ·
[Pinned CLDF source](https://github.com/lexibank/wold/tree/1df62b9bdc7292b35982aea49b4d5bd1951f6f3e).
Cite the corresponding expert-contributed vocabulary, not only the editors.
Each form links to its original word record and vocabulary page; the CLDF
[bibliography](lexicon/wold/sources.bib) and scoped source IDs are preserved.

Both imported CLDF releases explicitly specify
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Copies of their license
texts, original metadata, citations, release DOIs, commit identifiers, and SHA-256
input hashes live in `data/lexicon/ids/` and `data/lexicon/wold/`.
The original WOLD website may describe a different license for its own
publication; this import redistributes the explicitly licensed CLDF release.

Etymap's changes: conversion from CSV into compressed per-meaning JSON, removal
of empty fields (not nonempty annotations), source-aware keys, and derived search
and coverage counts. Form strings, original values, comments, transcriptions,
borrowing assessments, and remaining nonempty CLDF fields are retained without
rewriting. The sidebar exposes all retained original fields for inspection.

## Accuracy boundaries

- A search ranks possible meanings, but the user chooses an exact source meaning.
  Soil, land, and the planet are not silently merged. Wiktionary and dictionary
  results have separate meaning selections; the import does not guess sense links.
- Dictionary-local variety IDs are preserved. ISO codes do not collapse dialects.
  Source coordinates are used where available (277 IDS and 41 WOLD varieties).
  An absent coordinate can use an unambiguous **exact Glottocode** match in the
  existing catalogue; no parent-language centroid or fuzzy name match is used.
  Unlocated varieties remain in the sidebar.
- Periods are inherited only from an unambiguous exact catalogue match. Other
  records are undated, not assumed contemporary because their dictionary is
  recent. A dictionary's record date is not the date of its words. All-period
  browsing includes undated records; restricted periods require the undated option.
- IDS has 352,262 records without separate word-level source IDs. Dictionary
  contributors remain credited, and the sidebar explicitly identifies this
  limitation. A nonempty source ID is not proof of stronger linguistic evidence.
- WOLD includes seven empty bibliography entries (`6`, `11`, `15`, `16`, `23`,
  `31`, `40`) in this release. Related words retain their source IDs and show a
  warning to consult the linked vocabulary. These entries are not filled with
  invented citations.
- Publisher-specific, phonemic, or alternative representations retain their
  source labels. They are **not automatically IPA or romanisation**. CLDF
  normalization may differ from a dictionary's displayed orthography; both `Form`
  and original `Value` are available.
- Grey dictionary markers mean lexical evidence only. WOLD's graded borrowing
  assessments and notes remain qualified text. No donor, cognate, family, or
  reconstruction arrows are inferred from these imports. No unverified
  Wiktionary entry or pronunciation API call is made for dictionary forms.
- IDS links open the exact language/meaning set containing the form. Its website
  does not expose CLDF form IDs as working individual record URLs. WOLD links
  use the actual `Word_ID`, not the CLDF row ID.

## Loading and rebuilding

Only the compressed index loads initially. Selecting a meaning fetches one gzip
shard: at most 14,983 bytes for IDS and 8,413 bytes for WOLD in this snapshot.
The total compressed shard payload is 17,972,106 bytes on disk; the browser does
not fetch it as a bundle. The 12-meaning LRU cache is bounded. Panning, zooming,
hovering, selecting a word, and changing themes never download dictionary shards.

Run `npm run build:lexicon` to regenerate the pinned sources. It checks licenses,
row IDs, foreign keys, source row counts, and existing input hash locks. `npm test`
also reads every shard and validates meaning IDs, bibliography references,
counts, link identifiers, and payload limits. `scripts/check-lexicon.mjs` checks
real local imports in the browser, including stale requests and retries.

## Your future dictionaries

Keep a stable source ID, version, permission/license, contributor credit,
language-variety identifier (preferably Glottocode), meaning ID or definition,
original form, representation label, and source citation for each record.
Explicitly mark IPA, romanisation, uncertainty, and any community/access
conditions. CSV or CLDF is convenient; unstructured dictionaries need a reviewed
extraction before integration. Public availability alone is not redistribution
permission. The same source-specific identity and shard pattern can accommodate
future approved imports without mixing them into unsupported etymologies.
