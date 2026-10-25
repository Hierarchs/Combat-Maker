import { MAX_MONSTERS, clamp } from "./constants.mjs";
import { assessEncounter, encounterTotals, rulesConfig } from "./difficulty.mjs";
import { parseCR } from "./normalize.mjs";

export const MAX_WAVES=10;
export const MAX_TOTAL_MONSTERS=500;
export const uuidValid=value=>typeof value==="string"&&/^(Actor|Compendium|Scene)\.[^\s]+$/.test(value);
export const newWave=(name="Opening force")=>({id:crypto.randomUUID(),name,trigger:"",notes:"",lines:[]});
export const textField=(value,max,label)=>{
  if(value===undefined||value===null)return "";
  if(typeof value!=="string"||value.length>max)throw new Error(`${label} must be text of at most ${max.toLocaleString()} characters.`);
  return value.trim();
};

export function parseTags(value=[]){
  const tags=typeof value==="string"?value.split(","):value;
  if(!Array.isArray(tags)||tags.length>20)throw new Error("Use at most 20 tags, separated by commas.");
  const unique=new Map();for(const tag of tags){const clean=textField(tag,32,"Each tag");if(clean)unique.set(clean.toLowerCase(),clean);}
  return [...unique.values()];
}

export function cleanLines(lines){
  if(!Array.isArray(lines)||lines.length>MAX_MONSTERS)throw new Error("A wave must contain a monster list with at most 100 entries.");
  let count=0;
  return lines.map(line=>{
    const m=line?.monster;
    if(!m||!uuidValid(m.uuid)||parseCR(m.cr)===null||!Number.isFinite(m.xp)||m.xp<0||m.xp>10000000||!Number.isInteger(line.quantity)||line.quantity<1)throw new Error("An encounter contains invalid monster data.");
    count+=line.quantity;if(count>MAX_MONSTERS)throw new Error(`Each wave can contain at most ${MAX_MONSTERS} monsters.`);
    const monster={uuid:m.uuid,cr:parseCR(m.cr),xp:m.xp};
    for(const key of ["name","type","size","subtype","book","edition","alignment","pack","packLabel"])monster[key]=textField(m[key],240,`Monster ${key}`);
    monster.name||="Unnamed creature";monster.img=textField(m.img,4096,"Monster image")||"icons/svg/mystery-man.svg";
    if(m.environments!==undefined&&(!Array.isArray(m.environments)||m.environments.length>30))throw new Error("Invalid monster environments.");
    monster.environments=(m.environments||[]).map(v=>textField(v,80,"Environment"));monster.legendary=Boolean(m.legendary);monster.swarm=Boolean(m.swarm);
    return {monster,quantity:line.quantity,...(line.missing?{missing:true}:{})};
  });
}

export function flattenWaves(waves){
  const lines=new Map();
  for(const wave of waves)for(const line of wave.lines){const existing=lines.get(line.monster.uuid);if(existing)existing.quantity+=line.quantity;else lines.set(line.monster.uuid,{monster:structuredClone(line.monster),quantity:line.quantity});}
  return [...lines.values()];
}

export function summarizeWaves(waves,party,rules){
  const reports=waves.map(w=>({id:w.id,name:w.name,...assessEncounter(w.lines,party,rules)}));
  const peak=[...reports].sort((a,b)=>(b.shown.rank??-1)-(a.shown.rank??-1)||b.adjustedXP-a.adjustedXP)[0]??assessEncounter([],party,rules);
  const totals=reports.reduce((t,r)=>({count:t.count+r.count,xp:t.xp+r.xp,cr:t.cr+r.cr}),{count:0,xp:0,cr:0});
  return {...peak,...totals,waveCount:waves.length,peakWave:peak.name||"Opening force",waves:reports};
}

function cleanParty(party){
  if(!Array.isArray(party)||party.length>50)throw new Error("An encounter must contain a party list of at most 50 characters.");
  return party.map(p=>{
    if(!p||!uuidValid(p.uuid))throw new Error("A party member has an invalid actor reference.");
    const value={uuid:p.uuid,name:textField(p.name,180,"Character name")||"Missing character",img:textField(p.img,4096,"Character image"),level:clamp(Math.round(Number(p.level)||1),1,20),classes:textField(p.classes,500,"Classes"),notes:[]};
    for(const key of ["hp","maxHP","tempHP","hpRatio","slotRatio","resourceRatio","exhaustion","readiness"]){const n=Number(p[key]);value[key]=p[key]===null?null:Number.isFinite(n)?Math.max(0,n):key==="readiness"||key==="hpRatio"?1:0;}
    for(const key of ["hp","maxHP","tempHP"])value[key]=clamp(value[key]??0,0,10000000);
    for(const key of ["hpRatio","slotRatio","resourceRatio","readiness"])if(value[key]!==null)value[key]=clamp(value[key],0,1);
    value.exhaustion=clamp(value.exhaustion??0,0,6);value.readiness=clamp(value.readiness??1,0,1);value.unavailable=Boolean(p.unavailable);return value;
  });
}

/** Upgrade v1 snapshots without writing their original journals. Ratings are derived. */
export function normalizeEncounter(data){
  if(!data||![1,2].includes(data.schema))throw new Error("Unsupported encounter data version.");
  if(data.rules!==undefined&&(typeof data.rules!=="object"||data.rules===null||Array.isArray(data.rules)
    ||data.rules.edition!==undefined&&!["2014","2024"].includes(data.rules.edition)
    ||data.rules.mode!==undefined&&!["official","swarm"].includes(data.rules.mode)
    ||data.rules.dynamic!==undefined&&typeof data.rules.dynamic!=="boolean"))throw new Error("Encounter rules must use a supported edition, mode, and boolean dynamic setting.");
  const folder=textField(data.folder,80,"Folder name");
  if(folder==="*"||/[\r\n\t]/.test(folder))throw new Error("Folder names cannot contain control characters or a lone asterisk.");
  const rawWaves=data.schema===1?[{id:"opening",name:"Opening force",lines:data.lines}]:data.waves;
  if(!Array.isArray(rawWaves)||!rawWaves.length||rawWaves.length>MAX_WAVES)throw new Error(`Use between 1 and ${MAX_WAVES} waves.`);
  const ids=new Set();let total=0;
  const waves=rawWaves.map((wave,i)=>{
    const id=textField(wave?.id,64,"Wave ID")||`wave-${i+1}`;if(ids.has(id))throw new Error("Each wave must have a unique ID.");ids.add(id);
    const lines=cleanLines(wave.lines);total+=encounterTotals(lines).count;
    return {id,name:textField(wave.name,80,"Wave name")||`Wave ${i+1}`,trigger:textField(wave.trigger,240,"Wave trigger"),notes:textField(wave.notes,4000,"Wave notes"),lines};
  });
  if(total>MAX_TOTAL_MONSTERS)throw new Error(`An encounter can contain at most ${MAX_TOTAL_MONSTERS} monsters across its waves.`);
  const party=cleanParty(data.party),rules=rulesConfig(data.rules);
  return {schema:2,waves,activeWaveId:ids.has(data.activeWaveId)?data.activeWaveId:waves[0].id,lines:flattenWaves(waves),party,rules,tags:parseTags(data.tags),folder,notes:textField(data.notes,20000,"Encounter notes"),updatedAt:Number.isFinite(data.updatedAt)?data.updatedAt:0,report:summarizeWaves(waves,party,rules)};
}

export function filterVault(entries,{search="",folder="*",tag="",sort="recent"}={}){
  const terms=search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return entries.filter(entry=>{
    const data=entry.data;
    if(folder!=="*"&&data.folder!==folder||tag&&!data.tags.some(t=>t.toLowerCase()===tag.toLowerCase()))return false;
    if(!terms.length)return true;
    const haystack=[entry.name,data.notes,data.folder,...data.tags,...data.waves.flatMap(w=>[w.name,w.trigger,w.notes,...w.lines.map(l=>l.monster.name)])].join(" ").toLowerCase();
    return terms.every(term=>haystack.includes(term));
  }).sort((a,b)=>sort==="name"?a.name.localeCompare(b.name):sort==="xp"?b.data.report.xp-a.data.report.xp:b.data.updatedAt-a.data.updatedAt);
}

export const IMPORT_LIMIT=5*1024*1024;
export function exportVault(entries){
  return JSON.stringify({format:"combat-forge-vault",version:1,exportedAt:new Date().toISOString(),encounters:entries.map(entry=>({name:entry.name,data:normalizeEncounter(entry.data)}))},null,2);
}
export function parseVaultImport(json){
  if(typeof json!=="string"||json.length>IMPORT_LIMIT)throw new Error("Import a JSON file no larger than 5 MB.");
  let file;try{file=JSON.parse(json);}catch{throw new Error("This is not valid JSON. Select a Combat Forge export.");}
  if(file?.format!=="combat-forge-vault"||file.version!==1||!Array.isArray(file.encounters)||!file.encounters.length||file.encounters.length>100)throw new Error("Use a Combat Forge Vault export containing between 1 and 100 encounters.");
  return file.encounters.map((entry,i)=>{const name=textField(entry?.name,120,`Encounter ${i+1} name`);if(!name)throw new Error(`Encounter ${i+1} needs a name.`);return {name,data:normalizeEncounter(entry.data)};});
}
