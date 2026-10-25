import { ID, INDEX_FIELDS } from "./constants.mjs";
import { describeMonster, facets } from "./normalize.mjs";
import { repairState, resolveReplacement, duplicateGroups } from "./repairs.mjs";

export function actorPacks() {
  return [...game.packs].filter(p=>p.documentName==="Actor" && p.visible !== false)
    .sort((a,b)=>a.metadata.label.localeCompare(b.metadata.label));
}

export function actorPack(actor) {
  return actor?.compendium ?? (actor?.pack ? game.packs.get(actor.pack) : null);
}

export class MonsterCatalog {
  monsters = [];
  errors = [];
  skipped = 0;
  running = null;
  records = [];
  byUuid = new Map();
  references = [];
  auditedAt = null;
  repairs = {actors:{},replacements:{}};
  revision = 0;
  _duplicates = null;
  _issueCount = null;
  _facets = null;

  get duplicates() {return this._duplicates ??= duplicateGroups(this.records);}
  get issueCount() {return this._issueCount ??= this.records.reduce((n,r)=>n+Number(r.issues.length>0&&!r.hidden),0);}
  get facets() {return this._facets ??= facets(this.monsters);}
  get referenceCount() {return this.references.filter(r=>r.status!=="mapped").length;}
  get(uuid) {
    const resolved=resolveReplacement(uuid,this.repairs.replacements);
    return this.byUuid.get(resolved)?.monster ?? null;
  }

  record(actor,pack=null,listed=true) {
    const id=actor.id??actor._id;
    const uuid=actor.uuid || (pack ? pack.getUuid?.(id) ?? `Compendium.${pack.collection}.Actor.${id}` : `Actor.${id}`);
    const description=describeMonster(actor,pack,this.repairs.actors[uuid]);
    if(!description)return null;
    const {monster,issues,...details}=description;
    const correction=this.repairs.actors[monster.uuid]??{};
    this._duplicates=null;this._issueCount=null;
    const record={uuid:monster.uuid,name:monster.name,img:monster.img,pack:monster.pack,packLabel:monster.packLabel,
      description:monster,monster:monster.cr===null?null:monster,issues,...details,listed,hidden:Boolean(correction.hidden),
      corrected:Object.keys(correction).some(key=>key!=="hidden"),mappedTo:this.repairs.replacements[monster.uuid]||null,correction};
    const existing=this.byUuid.get(record.uuid);
    if(existing){record.listed||=existing.listed;Object.assign(existing,record);return existing;}
    this.records.push(record);this.byUuid.set(record.uuid,record);return record;
  }

  finish() {
    this.monsters=this.records.filter(r=>r.listed&&!r.hidden&&!r.mappedTo&&r.monster).map(r=>r.monster)
      .sort((a,b)=>a.name.localeCompare(b.name)||a.edition.localeCompare(b.edition));
    this.skipped=this.records.filter(r=>r.listed&&!r.monster).length;
    this._facets=null;this._duplicates=null;this._issueCount=null;this.revision++;
  }

  async refresh(onProgress = ()=>{}) {
    if (this.running) return this.running;
    this.running = this._scan(onProgress).finally(()=>{this.running=null;});
    return this.running;
  }

  async _scan(onProgress) {
    const sources = game.settings.get(ID,"sources");
    const packs = actorPacks().filter(p=>sources.auto || sources.packs.includes(p.collection));
    this.repairs=repairState();this.records=[];this.byUuid=new Map();
    this.errors=[]; this.skipped=0;
    let next=0,done=0;
    const worker=async()=> {
      while(next<packs.length) {
        const pack=packs[next++];
        try {
          const index=await pack.getIndex({fields:INDEX_FIELDS});
          for(const entry of index) {
            this.record(entry,pack);
          }
        } catch(error) {
          console.error(`${ID} | Could not index ${pack.collection}`,error);
          this.errors.push({name:pack.metadata.label,message:error.message});
        }
        onProgress({done:++done,total:packs.length,label:pack.metadata.label});
      }
    };
    await Promise.all([worker(),worker()]);
    if(sources.world) for(const actor of game.actors) {
      if(this.byUuid.has(actor.flags?.[ID]?.sourceUuid))continue;
      this.record(actor);
    }
    for(const uuid of game.settings.get(ID,"homebrew")) {
      try {
        const actor=await foundry.utils.fromUuid(resolveReplacement(uuid,this.repairs.replacements));
        if(actor?.type==="npc")this.record(actor,actorPack(actor));
        else this.errors.push({name:uuid,message:"Dropped actor is missing. Choose a replacement in the Bestiary Ledger."});
      } catch(error) {this.errors.push({name:uuid,message:error.message});}
    }
    this.finish();
    return this.monsters;
  }

  async addActor(actor) {
    if(actor?.documentName!=="Actor"||actor.type!=="npc")throw new Error("Drop a D&D5e NPC actor into the bestiary.");
    this.repairs=repairState();
    const record=this.record(actor,actorPack(actor));
    const monster=record.description;
    const uuids=game.settings.get(ID,"homebrew");
    if(!uuids.includes(monster.uuid)) await game.settings.set(ID,"homebrew",[...uuids,monster.uuid]);
    this.finish();return record;
  }

  async auditReferences(entries=[],draftLines=[]) {
    const references=new Map();
    const add=(uuid,name,use)=> {
      if(typeof uuid!=="string")return;
      const item=references.get(uuid)??{uuid,name:name||uuid,uses:[]};
      if(!item.uses.includes(use))item.uses.push(use);references.set(uuid,item);
    };
    for(const entry of entries)for(const line of entry.data.lines)add(line.monster.uuid,line.monster.name,`Vault: ${entry.name}`);
    for(const line of draftLines)add(line.monster.uuid,line.monster.name,"Current draft");
    for(const uuid of game.settings.get(ID,"homebrew"))add(uuid,this.byUuid.get(uuid)?.name,"Dropped actor");
    // Keep mappings reviewable even after an encounter has been re-saved with its new UUID.
    for(const uuid of Object.keys(this.repairs.replacements))add(uuid,null,"Saved replacement");
    const results=[];
    const checked=new Map();
    for(const item of references.values()) {
      let resolvedUuid;
      try {
        resolvedUuid=resolveReplacement(item.uuid,this.repairs.replacements);
        let record;
        if(!checked.has(resolvedUuid)) {
          const actor=await foundry.utils.fromUuid(resolvedUuid);
          record=actor?.documentName==="Actor"&&actor.type==="npc"?this.record(actor,actorPack(actor),false):null;
          checked.set(resolvedUuid,record);
        }else record=checked.get(resolvedUuid);
        if(!record)results.push({...item,resolvedUuid,status:"missing",message:"Source actor is unavailable."});
        else if(resolvedUuid!==item.uuid)results.push({...item,resolvedUuid,status:record.monster?"mapped":"invalid",replacementName:record.name,message:record.monster?"Replacement active":"Replacement needs a valid CR."});
        else if(!record.monster)results.push({...item,resolvedUuid,status:"invalid",message:"Source actor needs a valid CR."});
      }catch(error){results.push({...item,resolvedUuid,status:"missing",message:error.message});}
    }
    this.references=results;this.auditedAt=Date.now();this.finish();return results;
  }
}
