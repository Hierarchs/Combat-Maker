import { ID } from "./constants.mjs";
import { normalizeEncounter, textField } from "./encounters.mjs";

export const validateEncounter=normalizeEncounter;
const parentId=doc=>typeof doc.folder==="string"?doc.folder:doc.folder?.id;
// A document hook invalidates in-place flag edits; identity also catches replaced flags.
// Weak keys release cached snapshots when Foundry releases their Journal documents.
const snapshots=new WeakMap();
export function invalidateVaultEntry(journal){return snapshots.delete(journal);}
function freezeSnapshot(value){
  if(value&&typeof value==="object"&&!Object.isFrozen(value)){for(const child of Object.values(value))freezeSnapshot(child);Object.freeze(value);}
  return value;
}
function requireGM(){if(!game.user.isGM)throw new Error("Only a GM can save or organize encounters.");}
export function vaultFolders(){return [...game.folders].filter(f=>f.type==="JournalEntry"&&f.getFlag(ID,"vaultFolder")).sort((a,b)=>a.name.localeCompare(b.name));}
async function rootFolder(){
  const existing=game.folders.find(f=>f.type==="JournalEntry"&&f.getFlag(ID,"vault"));if(existing)return existing;
  const created=await foundry.documents.Folder.implementation.create({name:"Combat Forge — The Vault",type:"JournalEntry",color:"#aa8950",flags:{[ID]:{vault:true}}});
  if(!created)throw new Error("Foundry did not create the Vault folder.");return created;
}
export async function createVaultFolder(value){
  requireGM();const name=textField(value,80,"Folder name");if(!name||name==="*"||/[\r\n\t]/.test(name))throw new Error("Give the folder a name without control characters or a lone asterisk.");
  const existing=vaultFolders().find(f=>f.name.toLowerCase()===name.toLowerCase());if(existing)return existing;
  const root=await rootFolder(),created=await foundry.documents.Folder.implementation.create({name,type:"JournalEntry",folder:root.id,color:"#aa8950",flags:{[ID]:{vaultFolder:true}}});
  if(!created)throw new Error("Foundry did not create the requested Vault folder.");return created;
}
export async function renameVaultFolder(id,value){
  requireGM();const folder=vaultFolders().find(f=>f.id===id),name=textField(value,80,"Folder name");
  if(!folder||!name||name==="*"||/[\r\n\t]/.test(name))throw new Error("Choose an existing folder and a valid new name.");
  if(vaultFolders().some(f=>f.id!==id&&f.name.toLowerCase()===name.toLowerCase()))throw new Error("A Vault folder already has that name.");
  const updated=await folder.update({name});if(!updated)throw new Error("Foundry did not rename the Vault folder.");return updated;
}
export async function deleteVaultFolder(id){
  requireGM();const folder=vaultFolders().find(f=>f.id===id);if(!folder)throw new Error("This Vault folder no longer exists.");
  if([...game.folders].some(f=>parentId(f)===id)||[...game.journal].some(j=>parentId(j)===id&&!j.getFlag(ID,"encounter")))throw new Error("Move other journals or subfolders out before deleting this Vault folder.");
  const root=await rootFolder();
  for(const journal of game.journal)if(parentId(journal)===id){const moved=await journal.update({folder:root.id});if(!moved||parentId(journal)===id)throw new Error("An encounter could not be moved to Unfiled. The folder was kept.");}
  const deleted=await folder.delete();if(!deleted)throw new Error("Foundry kept the folder. Its encounters remain in Unfiled.");return deleted;
}

export function vaultEntries() {
  const entries=[];
  for(const journal of game.journal){
    const raw=journal.getFlag(ID,"encounter");if(![1,2].includes(raw?.schema))continue;
    let cached=snapshots.get(journal);
    if(!cached||cached.raw!==raw){
      cached={raw};snapshots.set(journal,cached);
      try{cached.data=freezeSnapshot(normalizeEncounter(raw));}
      catch(error){console.warn(`${ID} | Cannot read saved encounter ${journal.name}`,error);}
    }
    if(!cached.data)continue;
    const folder=game.folders.get(parentId(journal)),name=folder?.getFlag(ID,"vaultFolder")?folder.name:"";
    if(!cached.entry||cached.entry.name!==journal.name||cached.entry.data.folder!==name){
      cached.entry=Object.freeze({id:journal.id,name:journal.name,data:Object.freeze({...cached.data,folder:name})});
    }
    entries.push(cached.entry);
  }
  return entries.sort((a,b)=>b.data.updatedAt-a.data.updatedAt);
}

export async function saveEncounter(name,data,id=null) {
  requireGM();const encounter=normalizeEncounter({...data,updatedAt:Date.now()});
  const journal=id ? game.journal.get(id) : null;
  if(id && !journal?.getFlag(ID,"encounter")) throw new Error("This encounter no longer exists. Save a new copy.");
  name=textField(name,120,"Encounter name");
  if(!name) throw new Error("Give your encounter a name.");
  const folder=encounter.folder?await createVaultFolder(encounter.folder):await rootFolder();
  const saved=journal?await journal.update({name,folder:folder.id,[`flags.${ID}.encounter`]:encounter})
    :await foundry.documents.JournalEntry.implementation.create({name,folder:folder.id,ownership:{default:0},flags:{[ID]:{encounter}}});
  if(!saved)throw new Error("Foundry did not save the encounter. The operation may have been canceled.");invalidateVaultEntry(saved);return saved;
}

export async function importVault(entries){
  requireGM();const validated=entries.map(entry=>({name:textField(entry.name,120,"Encounter name"),data:normalizeEncounter(entry.data)}));
  if(!validated.length||validated.length>100||validated.some(e=>!e.name))throw new Error("Import between 1 and 100 named encounters.");
  const names=new Set([...game.journal].map(j=>j.name.toLowerCase())),created=[];
  try{
    for(const entry of validated){let name=entry.name,n=1;while(names.has(name.toLowerCase()))name=`${entry.name.slice(0,100)} (imported ${n++})`;names.add(name.toLowerCase());created.push(await saveEncounter(name,entry.data));}
    return created;
  }catch(error){
    const cleanup=await Promise.allSettled(created.map(j=>j.delete()));
    if(cleanup.some((r,i)=>r.status==="rejected"||game.journal.has(created[i].id)))throw new Error(`Import failed and some imported encounters could not be removed: ${error.message}`);
    throw new Error(`Import failed; imported encounters were rolled back. ${error.message}`);
  }
}
