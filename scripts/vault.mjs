import { ID, MAX_MONSTERS } from "./constants.mjs";
import { rulesConfig } from "./difficulty.mjs";
import { parseCR } from "./normalize.mjs";

export function validateEncounter(data) {
  if (!data || data.schema !== 1 || !Array.isArray(data.lines) || !Array.isArray(data.party)) throw new Error("Unsupported encounter data.");
  let count=0;
  for(const line of data.lines) {
    if(!line.monster || typeof line.monster.uuid!=="string" || !/^(Actor|Compendium|Scene)\./.test(line.monster.uuid)
      || parseCR(line.monster.cr)===null || !Number.isFinite(line.monster.xp) || line.monster.xp<0
      || !Number.isInteger(line.quantity) || line.quantity<1) throw new Error("An encounter contains invalid monster data.");
    count+=line.quantity;
  }
  if(count>MAX_MONSTERS) throw new Error(`An encounter can contain at most ${MAX_MONSTERS} monsters.`);
  return {...structuredClone(data),rules:rulesConfig(data.rules)};
}

export function vaultEntries() {
  return [...game.journal].filter(j=>j.getFlag(ID,"encounter")?.schema===1)
    .map(j=>({id:j.id,name:j.name,data:j.getFlag(ID,"encounter")}))
    .sort((a,b)=>(b.data.updatedAt||0)-(a.data.updatedAt||0));
}

export async function saveEncounter(name,data,id=null) {
  if(!game.user.isGM) throw new Error("Only a GM can save encounters.");
  const encounter=validateEncounter({...data,schema:1,updatedAt:Date.now()});
  const journal=id ? game.journal.get(id) : null;
  if(id && !journal?.getFlag(ID,"encounter")) throw new Error("This encounter no longer exists. Save a new copy.");
  name=String(name).trim().slice(0,120);
  if(!name) throw new Error("Give your encounter a name.");
  if(journal) return journal.update({name,[`flags.${ID}.encounter`]:encounter});
  let folder=game.folders.find(f=>f.type==="JournalEntry" && f.getFlag(ID,"vault"));
  if(!folder) folder=await foundry.documents.Folder.implementation.create({name:"Combat Forge — The Vault",type:"JournalEntry",color:"#e68a2e",flags:{[ID]:{vault:true}}});
  return foundry.documents.JournalEntry.implementation.create({name,folder:folder.id,ownership:{default:0},flags:{[ID]:{encounter}}});
}
