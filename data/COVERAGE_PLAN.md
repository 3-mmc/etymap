# Adding lexical sources

Research checked 2026-09-06. These sources are candidates, **not currently imported**. The production app still uses Wiktionary for word forms and etymologies.

## Recommended order

1. **[Lexibank](https://lexibank.clld.org/)** for broad lexical coverage. The current website aggregates 134 datasets and reports 5,477 language records, 3,205 concepts, and 1,734,794 words. These are the source's counts, not additional unique languages Etymap would gain. Start with a pinned release of selected CLDF wordlists, preserving their original dataset citations, language varieties, orthography/transcription distinctions, and provenance. The website lists CC BY 4.0; verify each underlying dataset's release and attribution requirements before redistribution.
2. **[Intercontinental Dictionary Series](https://ids.clld.org/)** for structured comparative vocabulary and less-documented languages. Its 1,310-entry concept outline and explicitly CC BY wordlists fit concept-based search. Preserve the contributor and dictionary citation, not only the IDS name. Check overlap with the selected Lexibank datasets before counting additions.
3. **[World Loanword Database](https://wold.clld.org/)** for expert-annotated borrowing evidence: 41 recipient-language vocabularies with loanword status, source words, and donor languages. Its website lists CC BY 3.0 Germany and requests citations to the individual vocabularies. Retain uncertainty and borrowability annotations; do not reduce every record to an unqualified arrow.

**[Kaikki](https://kaikki.org/dictionary/)** is a complementary extraction route, not an independent dictionary: its machine-readable Wiktionary entries can help find forms absent from English translation tables. Other Wiktionary editions may supply additional material, but glosses, senses, and duplicate records still need alignment. See the [Wiktextract paper](https://aclanthology.org/2022.lrec-1.140/) for the extraction approach.

## Integration requirements

- Match meanings through explicit concept identifiers where available. [Concepticon](https://concepticon.clld.org/) links elicitation glosses to defined concept sets; an English query such as “earth” must not silently merge soil, land, and the planet. Wiktionary senses need a reviewed mapping or an explicit separate-source view, not fuzzy gloss equality.
- Join language varieties by documented identifiers, including Glottocodes, without collapsing distinct varieties into a single ISO code. Preserve dataset-local language and form IDs. The current `code:term` key is insufficient for cross-dataset provenance and needs migration before imports.
- Keep original form, transcription, romanisation, IPA, gloss, source URL, bibliographic citation, license, dataset version, and mapping confidence separate. A wordlist transcription is not automatically IPA, and a wordlist record should link to its actual source, not an assumed Wiktionary entry.
- Deduplicate display records conservatively while retaining every contributing source. Publish measured additional forms and located language varieties for each concept, rather than adding source totals together.
- Separate lexical evidence from etymological evidence. A matching meaning, spelling, or language family does not establish cognacy or a borrowing. Grey/unresolved remains valid; only explicitly supported relationships should colour etymological groups or draw arrows. Keep cognate-set IDs scoped to their dataset.
- Build compressed, per-concept shards offline and load only the selected concept. Avoid making pan, zoom, hover, or initial page load download whole dictionaries. A source filter and visible provenance badges should accompany the first import.
- Respect access restrictions and community conditions for any future community dictionary or archive. Public readability alone does not authorize republication.

A bounded first pilot would import a small set of clearly matched basic concepts, measure the gain over Wiktionary, and verify minority-language identifiers, source links, and transcriptions before expanding to a full collection.
