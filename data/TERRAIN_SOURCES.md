# Terrain relief

Etymap shades terrain from [Mapzen Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/), accessed 2026-09-06. Terrarium-encoded elevation tiles are rendered as a flat MapLibre hillshade layer. They are not a historical terrain reconstruction, a migration model, or evidence of a particular language-contact event.

The tile source combines several elevation datasets. See the provider's [full attribution and license notices](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) and [Mapzen data rights](https://www.mapzen.com/rights/) for the applicable credits, conditions, and geographic coverage.

Contributors include ArcticDEM (DigitalGlobe imagery and US National Science Foundation funding); Geoscience Australia; Austria's open-data elevation programme; Canadian open-government data; European Union Copernicus EU-DEM; NOAA ETOPO1; Mexico's INEGI; New Zealand's LINZ and Crown data; Norway's Kartverket; the UK's Environment Agency; and USGS 3DEP, GMTED2010 and SRTM. This summary does not replace the linked full provider notices.

Relief is on by default and can be disabled under **Map & time → Terrain relief**. Tiles load only as needed, with source zoom capped at 12; closer views reuse that resolution. Day/night switches recolour the same elevation source. Political boundaries remain optional and country labels remain hidden. The language and word data remain available if relief tiles fail to load.
