import { ID } from "./constants.mjs";
import { normalizeEncounter, textField } from "./encounters.mjs";

export const validateEncounter=normalizeEncounter;
const parentId=doc=>typeof doc.folder==="string"?doc.folder:doc.folder?.id;
function requireGM(){if(!game.user.isGM)throw new Error("Only a GM can save or organize encounters.");}
export function vaultFolders(){return [...game.folders].filter(f=>f.type==="JournalEntry"&&f.getFlag(ID,"vaultFolder")).sort((a,b)=>a.name.localeCompare(b.name));}
async function rootFolder(){return game.folders.find(f=>f.type==="JournalEntry"&&f.getFlag(ID,"vault"))??await foundry.documents.Folder.implementation.create({name:"Combat Forge — The Vault",type:"JournalEntry",color:"#aa8950",flags:{[ID]:{vault:true}}});}
export async function createVaultFolder(value){
  requireGM();const name=textField(value,80,"Folder name");if(!name||name==="*"||/[\r\n\t]/.test(name))throw new Error("Give the folder a name without control characters or a lone asterisk.");
  const existing=vaultFolders().find(f=>f.name.toLowerCase()===name.toLowerCase());if(existing)return existing;
  const root=await rootFolder();return foundry.documents.Folder.implementation.create({name,type:"JournalEntry",folder:root.id,color:"#aa8950",flags:{[ID]:{vaultFolder:true}}});
}
export async function renameVaultFolder(id,value){
  requireGM();const folder=vaultFolders().find(f=>f.id===id),name=textField(value,80,"Folder name");
  if(!folder||!name||name==="*"||/[\r\n\t]/.test(name))throw new Error("Choose an existing folder and a valid new name.");
  if(vaultFolders().some(f=>f.id!==id&&f.name.toLowerCase()===name.toLowerCase()))throw new Error("A Vault folder already has that name.");
  return folder.update({name});
}
export async function deleteVaultFolder(id){
  requireGM();const folder=vaultFolders().find(f=>f.id===id);if(!folder)throw new Error("This Vault folder no longer exists.");
  if([...game.folders].some(f=>parentId(f)===id)||[...game.journal].some(j=>parentId(j)===id&&!j.getFlag(ID,"encounter")))throw new Error("Move other journals or subfolders out before deleting this Vault folder.");
  const root=await rootFolder();for(const journal of game.journal)if(parentId(journal)===id)await journal.update({folder:root.id});
  return folder.delete();
}

export function vaultEntries() {
  const entries=[];
  for(const journal of game.journal){
    const raw=journal.getFlag(ID,"encounter");if(![1,2].includes(raw?.schema))continue;
    try{const data=normalizeEncounter(raw),folder=game.folders.get(parentId(journal));data.folder=folder?.getFlag(ID,"vaultFolder")?folder.name:"";entries.push({id:journal.id,name:journal.name,data});}
    catch(error){console.warn(`${ID} | Cannot read saved encounter ${journal.name}`,error);}
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
  if(journal) return journal.update({name,folder:folder.id,[`flags.${ID}.encounter`]:encounter});
  return foundry.documents.JournalEntry.implementation.create({name,folder:folder.id,ownership:{default:0},flags:{[ID]:{encounter}}});
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
    if(cleanup.some(r=>r.status==="rejected"))throw new Error(`Import failed and some imported encounters could not be removed: ${error.message}`);
    throw new Error(`Import failed; imported encounters were rolled back. ${error.message}`);
  }
}
