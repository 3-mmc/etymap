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
      const id=member.item.id || member.item.code+":"+member.item.term;
      if(d<distance || (d===distance && id<bestKey)) {best=member.item;distance=d;bestKey=id;}
    }
    group.representative=best;
    delete group.members;
  }
  return groups;
}

export function labelBounds(group,layout) {
  // Single tooltips sit to the right of their dot; cluster cards are centred.
  const left=group.point.x+(group.items.length===1 ? 14 : -layout.width/2);
  return {left,right:left+layout.width,top:group.point.y-layout.height/2,bottom:group.point.y+layout.height/2};
}

export function layoutClusters(projected,layout) {
  const groups=clusterPoints(projected,layout.radius);
  const positions=new Map(projected.map(member=>[member.item,member.point]));
  // Only on layout changes, never pan. Merge collisions into +x stacks rather
  // than hiding forms. Each pass removes a group, so this always terminates.
  let changed=true;
  while(changed) {
    changed=false;
    outer: for(let i=0;i<groups.length;i++) {
      const a=labelBounds(groups[i],layout);
      for(let j=i+1;j<groups.length;j++) {
        const b=labelBounds(groups[j],layout);
        if(a.left<b.right+6 && a.right+6>b.left && a.top<b.bottom+6 && a.bottom+6>b.top) {
          const target=groups[i],other=groups[j],n=target.items.length,m=other.items.length;
          target.point={x:(target.point.x*n+other.point.x*m)/(n+m),y:(target.point.y*n+other.point.y*m)/(n+m)};
          target.items.push(...other.items);groups.splice(j,1);changed=true;break outer;
        }
      }
    }
  }
  for(const group of groups) {
    let best,distance=Infinity,id="";
    for(const item of group.items) {
      const p=positions.get(item),d=(p.x-group.point.x)**2+(p.y-group.point.y)**2,k=item.id || item.code+":"+item.term;
      if(d<distance || (d===distance && k<id)) {best=item;distance=d;id=k;}
    }
    group.representative=best;
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
  // A flat shaded-relief layer, not an extruded 3D mesh: language points and
  // relationship arrows keep their geographic alignment with Leaflet.
  if(!style.layers.some(layer=>layer.id==="etymap-relief")) {
    style.sources ||= {};
    style.sources["etymap-elevation"]={type:"raster-dem",tiles:["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],encoding:"terrarium",tileSize:256,maxzoom:12,
      attribution:'Terrain: <a href="https://www.mapzen.com/rights/">Mapzen</a> · <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">terrain data sources</a>'};
    const relief={id:"etymap-relief",type:"hillshade",source:"etymap-elevation",paint:{
      "hillshade-illumination-direction":315,"hillshade-illumination-anchor":"map",
      "hillshade-exaggeration":["interpolate",["linear"],["zoom"],0,.3,4,.55,8,.65],
      "hillshade-shadow-color":"#526653","hillshade-highlight-color":"#fffef3","hillshade-accent-color":"#83926d"}};
    const water=style.layers.find(layer=>layer.id==="water" && layer.type==="fill");
    // Shade above landcover, then mask bathymetry so seas stay visually quiet.
    const index=style.layers.findIndex(layer=>["line","symbol"].includes(layer.type));
    style.layers.splice(index<0 ? style.layers.length:index,0,relief,...(water ? [{...structuredClone(water),id:"etymap-water-mask"}]:[]));
  }
  for (const layer of style.layers) {
    if (layer["source-layer"] === "boundary") layer.layout = {...layer.layout, visibility:"none"};
    if (layer.id === "background") layer.paint = {"background-color":"#eff1e8"};
    if (["water","etymap-water-mask"].includes(layer.id)) layer.paint = {...layer.paint, "fill-color":"#d3e4e6"};
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
  if(layer.type === "hillshade") {
    paint["hillshade-shadow-color"]="#060f18";
    paint["hillshade-highlight-color"]="#73948f";
    paint["hillshade-accent-color"]="#24474a";
  }
  return paint;
}
