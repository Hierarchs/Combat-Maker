import { ID, INDEX_FIELDS } from "./constants.mjs";
import { normalizeMonster } from "./normalize.mjs";

export function actorPacks() {
  return [...game.packs].filter(p=>p.documentName==="Actor" && p.visible !== false)
    .sort((a,b)=>a.metadata.label.localeCompare(b.metadata.label));
}

export class MonsterCatalog {
  monsters = [];
  errors = [];
  skipped = 0;
  running = null;

  async refresh(onProgress = ()=>{}) {
    if (this.running) return this.running;
    this.running = this._scan(onProgress).finally(()=>{this.running=null;});
    return this.running;
  }

  async _scan(onProgress) {
    const sources = game.settings.get(ID,"sources");
    const packs = actorPacks().filter(p=>sources.auto || sources.packs.includes(p.collection));
    const monsters = new Map();
    this.errors=[]; this.skipped=0;
    let next=0,done=0;
    const worker=async()=> {
      while(next<packs.length) {
        const pack=packs[next++];
        try {
          const index=await pack.getIndex({fields:INDEX_FIELDS});
          for(const entry of index) {
            const monster=normalizeMonster(entry,pack);
            if(monster) monsters.set(monster.uuid,monster);
            else if(entry.type==="npc") this.skipped++;
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
      if(monsters.has(actor.flags?.[ID]?.sourceUuid))continue;
      const m=normalizeMonster(actor); if(m) monsters.set(m.uuid,m);
      else if(actor.type==="npc")this.skipped++;
    }
    for(const uuid of game.settings.get(ID,"homebrew")) {
      try {
        const actor=await foundry.utils.fromUuid(uuid);
        const m=normalizeMonster(actor,actor?.pack ? game.packs.get(actor.pack) : null);
        if(m) monsters.set(m.uuid,m);
        else this.errors.push({name:uuid,message:"Dropped actor is missing or no longer has a valid CR."});
      } catch(error) {this.errors.push({name:uuid,message:error.message});}
    }
    this.monsters=[...monsters.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.edition.localeCompare(b.edition));
    return this.monsters;
  }

  async addActor(actor) {
    const monster=normalizeMonster(actor,actor?.pack ? game.packs.get(actor.pack) : null);
    if(!monster) throw new Error("Drop a D&D5e NPC with a valid CR (0–30, including 1/8, 1/4, and 1/2).");
    const uuids=game.settings.get(ID,"homebrew");
    if(!uuids.includes(monster.uuid)) await game.settings.set(ID,"homebrew",[...uuids,monster.uuid]);
    this.monsters=[...this.monsters.filter(m=>m.uuid!==monster.uuid),monster].sort((a,b)=>a.name.localeCompare(b.name));
    return monster;
  }
}
