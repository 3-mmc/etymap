# Map rendering choices

Assessed 2026-09-09 against the projects' own documentation.

Etymap uses MapLibre GL JS 5.6.2 for its vector/DEM basemap and Leaflet 1.9.4 for
interaction, word cards, territories, and geographic projection of SVG arrows.
The four map presets change paint and visibility through MapLibre's public APIs;
they do not replace the map, reload styles, or add external dependencies.

- **Relief:** the existing flat hillshade and regional labels.
- **Waterways:** stronger water colours with roads/buildings removed. Modern
  river data supplies geographic context, not evidence of historical navigation
  or language contact; it is not a palaeohydrological reconstruction.
- **Paper atlas:** warm paper and ink. A visual theme, not historical borders.
- **Minimal:** quiet land/water for word networks; no place labels. Relief and
  optional political outlines remain explicit controls.

Every preset works in day/night mode and preserves geographic alignment. All
share OpenFreeMap vector tiles and Mapzen DEM data, with existing source credits.
They can use fewer visible layers, but are not claimed to improve total FPS on
all devices. Cached pan measurements in tests measure overlay work only.

## GeoLibre and forge3d

[GeoLibre](https://geolibre.app/) is a GIS application built with MapLibre,
React/TypeScript, DuckDB-WASM Spatial, and deck.gl. Its
[repository](https://github.com/opengeos/GeoLibre) also exposes a headless map
package for loading/synchronizing GIS layers and styling. Those capabilities
could be useful for future user-supplied spatial datasets or an export workflow;
Etymap's current source/meaning layers do not need the extra GIS stack.

[forge3d](https://github.com/milos-agathon/forge3d) is Python-first terrain/scene
rendering on Rust and WebGPU, with native interactive/offscreen rendering and
notebook workflows. It is a potential tool for pre-rendered terrain illustrations,
not a drop-in replacement for this static site's JavaScript map interface.

[MapLibre](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/) itself can
support terrain and globe views. However, enabling pitch, elevated terrain, or
globe projection only on Etymap's basemap would misalign Leaflet's flat word
locations, territories, and SVG arrows. A proper implementation needs a unified
MapLibre camera/projection and migrated overlays, including selection, keyboard,
touch, clustering, resize, and return-view tests. This change intentionally adds
four aligned 2D cartographic views, not an untested 3D/globe mode. Neither GeoLibre
nor forge3d is bundled or required.
