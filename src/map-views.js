import { prepareBasemap } from "./map-model.js";

export const MAP_VIEWS = {
  relief:{label:"Relief",description:"Shaded mountains and valleys. Geography is context, not evidence of contact.",relief:true},
  waterways:{label:"Waterways",description:"Rivers and coasts stand out; roads recede. These are modern geographic features, not reconstructed routes.",relief:true},
  atlas:{label:"Paper atlas",description:"Warm paper and ink, with regional labels. A cartographic style, not a historical basemap.",relief:false},
  minimal:{label:"Minimal",description:"Quiet land and water with fewer distractions. Ideal for following word-family connections.",relief:false}
};

export function viewBasemap(base,theme="day",view="relief",options={}) {
  const style=prepareBasemap(base,theme), night=theme==="night";
  if(!MAP_VIEWS[view]) view="relief";
  for(const layer of style.layers) {
    const source=layer["source-layer"] || "", water=/water/.test(source);
    layer.paint ||= {};
    let show=layer.layout?.visibility!=="none";
    if(source==="boundary") show=Boolean(options.borders);
    else if(layer.type==="symbol") show=options.labels!==false && view!=="minimal" && layer.layout?.visibility!=="none";
    else if(layer.id==="etymap-relief") show=options.relief ?? MAP_VIEWS[view].relief;
    if(view!=="relief" && /transportation|building|aeroway|poi/.test(source)) show=false;
    if(view==="minimal" && !["background","etymap-water-mask","water","etymap-relief"].includes(layer.id) && source!=="boundary") show=false;
    if(view==="waterways" && water) {
      if(layer.type==="fill") layer.paint["fill-color"]=night ? "#153d54":"#addbe3";
      if(layer.type==="line") {layer.paint["line-color"]=night ? "#78cce1":"#3a96af";layer.paint["line-opacity"]=1;}
      if(layer.type==="symbol") layer.paint["text-color"]=night ? "#a9e7f5":"#1c6682";
    }
    if(view==="atlas") {
      if(layer.type==="background") layer.paint["background-color"]=night ? "#302c25":"#eee4cb";
      if(layer.type==="fill") layer.paint["fill-color"]=water ? (night ? "#22383b":"#bdcfd0") : (night ? "#38392c":"#ded9b7");
      if(layer.type==="line") layer.paint["line-color"]=night ? "#807664":"#9e9278";
      if(layer.type==="symbol" && layer.layout?.["text-field"]) {
        layer.paint["text-color"]=night ? "#e0d2b5":"#635744";
        layer.paint["text-halo-color"]=night ? "#302c25":"#eee4cb";
      }
    }
    layer.layout={...layer.layout,visibility:show ? "visible":"none"};
  }
  return style;
}
