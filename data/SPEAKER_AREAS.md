# Speaker-area vectors

The generated files in `speaker-areas/` are per-Glottocode gzip-compressed GeoJSON shards derived from the contemporary speaker areas in:

> Asher, R. E. & Christopher J. Moseley (eds.). 2007. *Atlas of the World's Languages*, 2nd edition. Routledge.

Derived dataset: Glottography `asher2007world`, CC BY 4.0. Release DOI: <https://doi.org/10.5281/zenodo.15287258>.

Source repository: <https://github.com/Glottography/asher2007world>

Rebuild from the upstream `cldf/contemporary/languages.geojson` file with:

```bash
node scripts/build-speaker-areas.mjs languages.geojson data/speaker-areas 0.01
```

The default build applies a 0.01-degree display simplification before compression. The runtime downloads `index.json`, resolves each Wiktionary language through its Glottolog Glottocode, and requests only the speaker-area shards needed for the selected region. The polygons represent the source atlas and should not be interpreted as timeless, exclusive, or politically authoritative boundaries.
