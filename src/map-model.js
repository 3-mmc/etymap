// Screen-distance clusters shrink naturally into smaller groups as the user zooms.
// They never use political containment to assign a language to a country.
export function clusterPoints(projected, radius = 75) {
  const groups = [];
  for (const { item, point } of projected) {
    const group = groups.find((g) => Math.hypot(g.point.x-point.x, g.point.y-point.y) < radius);
    if (!group) groups.push({items:[item], point:{x:point.x,y:point.y}});
    else {
      const count = group.items.length;
      group.point.x = (group.point.x*count + point.x)/(count+1);
      group.point.y = (group.point.y*count + point.y)/(count+1);
      group.items.push(item);
    }
  }
  return groups;
}

export function colourForSource(source, label) {
  if (!source || source === "unresolved" || label === "No explicit source") return "#94a69b";
  let hash=0;
  for (const character of source) hash = ((hash << 5)-hash+character.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash)%360} 43% 45%)`;
}

export function prepareBasemap(input) {
  const style = structuredClone(input);
  style.layers = style.layers.filter((layer) => !layer.id.includes("label_country"));
  for (const layer of style.layers) {
    if (layer["source-layer"] === "boundary") layer.layout = {...layer.layout, visibility:"none"};
    if (layer.id === "background") layer.paint = {"background-color":"#eff1e8"};
    if (layer.id === "water") layer.paint = {...layer.paint, "fill-color":"#d3e4e6"};
    if (layer.id === "label_state") layer.minzoom = 3;
  }
  return style;
}
