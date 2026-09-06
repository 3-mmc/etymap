// Screen-distance clusters shrink naturally into smaller groups as the user zooms.
// They never use political containment to assign a language to a country.
export function labelLayout(zoom) {
  if (zoom < 3.5) return {detail:"compact", width:104, height:34, radius:82};
  if (zoom < 6) return {detail:"medium", width:144, height:76, radius:115};
  return {detail:"close", width:174, height:86, radius:135};
}

export function clusterPoints(projected, radius = 75) {
  const groups = [];
  const cells = new Map();
  const cellKey = (point) => `${Math.floor(point.x/radius)},${Math.floor(point.y/radius)}`;
  const put = (group) => {
    const cell=cellKey(group.point);
    if(!cells.has(cell)) cells.set(cell,new Set());
    cells.get(cell).add(group);
  };
  for (const { item, point } of projected) {
    const x=Math.floor(point.x/radius), y=Math.floor(point.y/radius);
    let group;
    for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) {
      for(const candidate of cells.get(`${x+dx},${y+dy}`) || []) {
        if((!group || candidate.index<group.index) && Math.hypot(candidate.point.x-point.x,candidate.point.y-point.y)<radius) group=candidate;
      }
    }
    if (!group) {
      group={items:[item], members:[{item,point}], point:{x:point.x,y:point.y}, index:groups.length};
      groups.push(group); put(group);
    }
    else {
      const previous=cellKey(group.point);
      const count = group.items.length;
      group.point.x = (group.point.x*count + point.x)/(count+1);
      group.point.y = (group.point.y*count + point.y)/(count+1);
      group.items.push(item);
      group.members.push({item,point});
      if(previous!==cellKey(group.point)) { cells.get(previous).delete(group); put(group); }
    }
  }
  for(const group of groups) {
    // A geographic representative, not a claim that this is the "best" language.
    let best, distance=Infinity, bestKey="";
    for(const member of group.members) {
      const d=(member.point.x-group.point.x)**2+(member.point.y-group.point.y)**2;
      const id=member.item.code+":"+member.item.term;
      if(d<distance || (d===distance && id<bestKey)) {best=member.item;distance=d;bestKey=id;}
    }
    group.representative=best;
    delete group.members;
  }
  return groups;
}

export function colourForSource(source, label) {
  if (!source || source === "unresolved" || label === "No explicit source") return "#94a69b";
  let hash=0;
  for (const character of source) hash = ((hash << 5)-hash+character.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash)%360} 43% 45%)`;
}

export function prepareBasemap(input, theme = "day") {
  const style = structuredClone(input);
  style.layers = style.layers.filter((layer) => !layer.id.includes("label_country"));
  for (const layer of style.layers) {
    if (layer["source-layer"] === "boundary") layer.layout = {...layer.layout, visibility:"none"};
    if (layer.id === "background") layer.paint = {"background-color":"#eff1e8"};
    if (layer.id === "water") layer.paint = {...layer.paint, "fill-color":"#d3e4e6"};
    if (layer.id === "label_state") layer.minzoom = 3;
    if(theme === "night") layer.paint = nightPaint(layer);
  }
  return style;
}

export function nightPaint(layer) {
  const paint={...layer.paint};
  const source=layer["source-layer"] || "";
  if(layer.type === "background") paint["background-color"]="#182730";
  if(layer.type === "fill") {
    paint["fill-color"]=/water/.test(source) ? "#0d1d29":/park|landcover|landuse/.test(source) ? "#20332f":source === "building" ? "#2c3c48":"#1e2e38";
    if("fill-outline-color" in paint) paint["fill-outline-color"]="#354b56";
  }
  if(layer.type === "line") paint["line-color"]=/water/.test(source) ? "#284a5c":/boundary/.test(source) ? "#647985":"#354650";
  if(layer.type === "symbol" && layer.layout?.["text-field"]) {
    paint["text-color"]=/water/.test(source) ? "#91b7c9":"#c0d0d4";
    paint["text-halo-color"]="#182730";
    paint["text-halo-width"]=1.2;
  }
  if(layer.type === "fill-extrusion") paint["fill-extrusion-color"]="#2c3c48";
  if(layer.type === "raster") {paint["raster-brightness-max"]=.25;paint["raster-saturation"]=-.8;}
  return paint;
}
