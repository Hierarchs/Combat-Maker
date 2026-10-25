import { ID, SIZE_NAMES } from "./constants.mjs";
import { parseCR } from "./normalize.mjs";

export const EMPTY_REPAIRS = Object.freeze({ schema:1, actors:{}, replacements:{} });
const isUuid = value => typeof value === "string" && /^(Actor|Compendium|Scene)\.[^\s]+$/.test(value);
let writes = Promise.resolve();

export function repairState() {
  const data=game.settings.get(ID,"catalogRepairs");
  return data?.schema===1 ? {schema:1,actors:{...data.actors},replacements:{...data.replacements}} : structuredClone(EMPTY_REPAIRS);
}

export function resolveReplacement(uuid,replacements=repairState().replacements) {
  const visited=new Set();
  let current=uuid;
  while(replacements[current]) {
    if(visited.has(current)||visited.size>=32)throw new Error("These actor replacements form a loop or are too deeply linked. Remove a replacement in the Ledger.");
    visited.add(current);current=replacements[current];
  }
  return current;
}

function writeRepairs(edit) {
  if(!game.user.isGM)return Promise.reject(new Error("Only a GM can repair catalogue metadata."));
  const result=writes.catch(()=>{}).then(async()=> {
    const state=repairState();await edit(state);await game.settings.set(ID,"catalogRepairs",state);return state;
  });
  writes=result;return result;
}

export function cleanCorrection(values) {
  const result={};
  if(values.cr!==undefined && values.cr!=="") {
    const cr=parseCR(values.cr);if(cr===null)throw new Error("Use a valid CR: 0, 1/8, 1/4, 1/2, or a whole number from 1 to 30.");
    result.cr=cr;
  }
  for(const field of ["book","type"]) {
    if(String(values[field]??"").trim())result[field]=String(values[field]).trim().slice(0,180);
  }
  if(values.edition) {
    if(!["2014","2024"].includes(values.edition))throw new Error("Edition must be 2014 or 2024.");
    result.edition=values.edition;
  }
  if(values.size) {
    const size=SIZE_NAMES[String(values.size).toLowerCase()];
    if(!size)throw new Error("Choose a recognized creature size.");
    result.size=size;
  }
  const environments=Array.isArray(values.environments)?values.environments:String(values.environments??"").split(/[,;|]/);
  const clean=[...new Set(environments.map(v=>String(v).trim().slice(0,60)).filter(Boolean))].slice(0,30);
  if(clean.length)result.environments=clean;
  if(values.hidden)result.hidden=true;
  return result;
}

export function saveCorrection(uuid,values) {
  if(!isUuid(uuid))throw new Error("Cannot repair an actor without a valid UUID.");
  const correction=cleanCorrection(values);
  return writeRepairs(state=> {
    if(Object.keys(correction).length)state.actors[uuid]=correction;else delete state.actors[uuid];
  });
}

export function resetCorrection(uuid) {
  return writeRepairs(state=>{delete state.actors[uuid];});
}

export function setHidden(uuid,hidden) {
  if(!isUuid(uuid))throw new Error("Choose an actor with a valid UUID.");
  return writeRepairs(state=> {
    const correction={...state.actors[uuid]};
    if(hidden)correction.hidden=true;else delete correction.hidden;
    if(Object.keys(correction).length)state.actors[uuid]=correction;else delete state.actors[uuid];
  });
}

export function preferDuplicate(uuids,preferred) {
  if(!uuids.includes(preferred)||uuids.some(uuid=>!isUuid(uuid)))throw new Error("Choose a member of this duplicate group.");
  return writeRepairs(state=> {
    for(const uuid of uuids) {
      const correction={...state.actors[uuid]};
      if(uuid===preferred)delete correction.hidden;else correction.hidden=true;
      if(Object.keys(correction).length)state.actors[uuid]=correction;else delete state.actors[uuid];
    }
  });
}

export function saveReplacement(oldUuid,newUuid) {
  if(!isUuid(oldUuid)||!isUuid(newUuid)||oldUuid===newUuid)throw new Error("Choose a different, valid actor as the replacement.");
  return writeRepairs(async state=> {
    const replacements={...state.replacements,[oldUuid]:newUuid};
    const target=resolveReplacement(oldUuid,replacements);
    const actor=await foundry.utils.fromUuid(target);
    if(actor?.documentName!=="Actor"||actor.type!=="npc")throw new Error("The replacement must be an available D&D5e NPC actor.");
    state.replacements=replacements;
  });
}

export function removeReplacement(uuid) {
  return writeRepairs(state=>{delete state.replacements[uuid];});
}

/** Similar index metadata is only a review hint; never automatically merge actors. */
export function duplicateGroups(records) {
  const groups=new Map();
  for(const record of records) {
    const m=record.monster;if(!m || !record.listed || record.mappedTo)continue;
    const key=[m.name.trim().toLocaleLowerCase().replace(/\s+/g," "),m.cr,m.edition,m.type.toLowerCase(),m.size].join("|");
    const group=groups.get(key)??[];group.push(record);groups.set(key,group);
  }
  return [...groups.entries()].filter(([,items])=>items.length>1)
    .map(([key,items])=>({key,items,active:items.filter(item=>!item.hidden).length}))
    .sort((a,b)=>b.active-a.active||a.items[0].monster.name.localeCompare(b.items[0].monster.name));
}
