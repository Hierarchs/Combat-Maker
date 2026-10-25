import { INDEX_FIELDS } from "./constants.mjs";

const catalogueFields=["name","img",...INDEX_FIELDS];
function changedPaths(value,prefix="",paths=[]){
  for(const [key,child]of Object.entries(value??{})){
    const path=(prefix?`${prefix}.`:"")+key.replaceAll("-=","");
    if(child&&typeof child==="object"&&!Array.isArray(child)&&Object.keys(child).length)changedPaths(child,path,paths);
    else paths.push(path);
  }
  return paths;
}

/** Accept both nested and flattened Foundry differential updates, including removals. */
export function catalogueMetadataChanged(changes){
  if(!changes)return true;
  return changedPaths(changes).some(path=>catalogueFields.some(field=>path===field||path.startsWith(field+".")||field.startsWith(path+".")));
}

/** Embedded items/effects and synthetic token actors only affect their selected PC. */
export function affectsParty(document,uuids){
  for(let current=document;current;current=current.parent){
    if(uuids.includes(current.uuid)||current.actor&&(uuids.includes(current.actor.uuid)||uuids.some(uuid=>uuid.startsWith(current.uuid+".Actor."))))return true;
  }
  return false;
}

export function tokenResourcesChanged(changes){
  return !changes||changedPaths(changes).some(path=>["actorId","actorData","delta"].some(field=>path===field||path.startsWith(field+".")));
}
