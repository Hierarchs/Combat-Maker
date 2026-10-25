import { ID } from "../../scripts/constants.mjs";

export class Collection extends Map {
  constructor(items=[]) {super(items.map(i=>[i.id??i._id??i.collection,i]));}
  get contents(){return [...this.values()];}
  [Symbol.iterator](){return this.values();}
  find(fn){return this.contents.find(fn);}
  filter(fn){return this.contents.filter(fn);}
  map(fn){return this.contents.map(fn);}
}

export function npc(id,name="Goblin",cr=0.25,extra={}) {
  return {id,_id:id,uuid:`Actor.${id}`,documentName:"Actor",name,type:"npc",img:"/assets/forge.svg",
    system:{details:{cr,type:{value:"humanoid",subtype:"Goblinoid"},alignment:"Neutral Evil",habitat:{value:[{type:"forest"}],custom:""}},
      source:{book:"Test Bestiary",rules:"2024"},traits:{size:"sm"},resources:{legact:{max:0}}},...extra};
}
export function character(id,name="Aveline",level=5,hp=38,maxHP=38,extra={}) {
  return {id,uuid:`Actor.${id}`,documentName:"Actor",type:"character",name,img:"/assets/forge.svg",
    system:{details:{level},attributes:{hp:{value:hp,max:maxHP},exhaustion:0},spells:{spell1:{value:4,max:4},spell2:{value:3,max:3},spell3:{value:2,max:2}}},
    items:[{type:"class",name:"Wizard",system:{identifier:"wizard",levels:level,spellcasting:{progression:"full"}}}],statuses:new Set(),...extra};
}

export function installFoundry({actors=[],packs=[],party=[],gm=true}={}) {
  const docs=new Map(),settings=new Map(),hooks=new Map(),notifications=[];
  let sequence=0;
  const allActors=new Collection(actors);
  const newDocument=(data,type)=> {
    const doc={...structuredClone(data),id:`created${++sequence}`,documentName:type,
      getFlag(scope,key){return this.flags?.[scope]?.[key];},
      async update(patch){for(const [key,value]of Object.entries(patch)){const keys=key.split(".");let obj=this;for(const part of keys.slice(0,-1))obj=obj[part]??={};obj[keys.at(-1)]=structuredClone(value);}return this;},
      async delete(){if(type==="JournalEntry")game.journal.delete(this.id);if(type==="Actor")game.actors.delete(this.id);if(type==="Combat")game.combats.delete(this.id);if(type==="Folder")game.folders.delete(this.id);return this;}
    };
    return doc;
  };
  const decorate=actor=> {
    actor.getFlag??=function(scope,key){return this.flags?.[scope]?.[key];};
    actor.sheet??={render:()=>{notifications.push({type:"sheet",message:actor.name});}};
    actor.getTokenDocument??=async function(data){return {toObject:()=>({actorId:this.id,name:this.name,width:1,height:1,texture:{src:this.img},...data}),getSnappedPosition:p=>({x:Math.round(p.x/100)*100,y:Math.round(p.y/100)*100})};};
    docs.set(actor.uuid,actor);return actor;
  };
  for(const actor of actors)decorate(actor);
  const packCollection=new Collection(packs);
  for(const pack of packs) {
    pack.documentName??="Actor";pack.visible??=true;
    pack.getUuid??=id=>`Compendium.${pack.collection}.Actor.${id}`;
  }
  const scene={id:"scene1",name:"The Old Crossing",tokens:new Collection(),async createEmbeddedDocuments(type,data) {
    const created=data.map(d=>({...structuredClone(d),id:`token${++sequence}`}));
    for(const token of created)this.tokens.set(token.id,token);return created;
  },async deleteEmbeddedDocuments(type,ids){ids.forEach(id=>this.tokens.delete(id));}};
  globalThis.Hooks={once(name,fn){const id=++sequence;hooks.set(id,{name,fn,once:true});return id;},on(name,fn){const id=++sequence;hooks.set(id,{name,fn});return id;},off(name,id){hooks.delete(id);},callAll(name,...args){for(const [id,hook]of hooks){if(hook.name===name){hook.fn(...args);if(hook.once)hooks.delete(id);}}}};
  globalThis.game={user:{id:"gm1",isGM:gm},system:{id:"dnd5e"},actors:allActors,packs:packCollection,
    users:new Collection([{id:"gm1",isGM:true},...party.map((p,i)=>({id:`player${i}`,isGM:false,character:p}))]),
    folders:new Collection(),journal:new Collection(),combats:new Collection(),modules:new Collection([{id:ID}]),
    settings:{register(scope,key,config){if(!settings.has(key))settings.set(key,structuredClone(config.default));},registerMenu(){},get(scope,key){return structuredClone(settings.get(key));},async set(scope,key,value){settings.set(key,structuredClone(value));return value;}},
    keybindings:{register(){}}
  };
  game.actors.fromCompendium=actor=>{const copy=structuredClone({name:actor.name,type:actor.type,system:actor.system,img:actor.img,flags:actor.flags||{}});return copy;};
  settings.set("sources",{auto:true,packs:[],world:true});settings.set("homebrew",[]);settings.set("defaultRules",{edition:"2024",mode:"official",dynamic:true});settings.set("draft",{});
  globalThis.fromUuid=async uuid=>docs.get(uuid) ?? null;
  globalThis.Actor={async create(data){const actor=decorate(newDocument(data,"Actor"));actor.uuid=`Actor.${actor.id}`;allActors.set(actor.id,actor);docs.set(actor.uuid,actor);return actor;}};
  globalThis.Folder={async create(data){const doc=newDocument(data,"Folder");game.folders.set(doc.id,doc);return doc;}};
  globalThis.JournalEntry={async create(data){const doc=newDocument(data,"JournalEntry");game.journal.set(doc.id,doc);return doc;}};
  globalThis.Combat={async create(data){const doc=newDocument(data,"Combat");doc.scene=scene;doc.combatants=[];doc.rolls=[];doc.createEmbeddedDocuments=async(type,data)=>{const created=data.map(d=>({...d,id:`combatant${++sequence}`}));doc.combatants.push(...created);return created;};doc.deleteEmbeddedDocuments=async(type,ids)=>{doc.combatants=doc.combatants.filter(c=>!ids.includes(c.id));};doc.rollInitiative=async(ids,options)=>{doc.rolls.push({ids,options});for(const [i,id]of ids.entries()){const c=doc.combatants.find(c=>c.id===id);if(c)c.initiative=10+i;}return doc;};game.combats.set(doc.id,doc);return doc;}};
  globalThis.foundry={...(globalThis.foundry??{}),utils:{fromUuid:globalThis.fromUuid},documents:Object.fromEntries(["Actor","Folder","JournalEntry","Combat"].map(name=>[name,{implementation:globalThis[name]}]))};
  globalThis.canvas={ready:true,scene,grid:{size:100},dimensions:{sceneRect:{x:0,y:0,width:3000,height:2000}},canvasCoordinatesFromClient:p=>p};
  globalThis.ui={notifications:Object.fromEntries(["info","warn","error"].map(type=>[type,message=>notifications.push({type,message})]))};
  globalThis.CONST={TOKEN_DISPOSITIONS:{HOSTILE:-1}};
  globalThis.window??={innerWidth:1200,innerHeight:800};
  return {docs,settings,notifications,scene,decorate,hooks};
}
