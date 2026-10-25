import { installFoundry, npc, character, Collection } from "../tests/fixtures/foundry.mjs";

const a=character("avel","Aveline",7,18,52),b=character("joren","Joren",6,44,58),c=character("mira","Mira",7,32,44),d=character("theo","Theodore",7,45,45);
b.items=[{type:"class",name:"Fighter",system:{identifier:"fighter",levels:6}}];b.system.spells={};
c.items=[{type:"class",name:"Druid",system:{identifier:"druid",levels:7,spellcasting:{progression:"full"}}}];
d.items=[{type:"class",name:"Paladin",system:{identifier:"paladin",levels:7,spellcasting:{progression:"half"}}}];
a.system.spells.spell1.value=1;a.system.spells.spell2.value=1;a.system.spells.spell3.value=0;
const bestiary=[
  ["Aarakocra",0.25,"humanoid","med","Mountain","2014"],["Aarakocra Aeromancer",4,"elemental","med","Mountain","2024"],
  ["Aarakocra Skirmisher",0.25,"elemental","med","Mountain","2024"],["Aberrant Cultist",8,"humanoid","med","Urban","2024"],
  ["Abjurer Wizard",9,"humanoid","med","Urban","2014"],["Aboleth",10,"aberration","lg","Underwater","2024"],
  ["Aboleth",10,"aberration","lg","Underwater","2014"],["Aboleth Spawn",5,"aberration","med","Underwater","2024"],
  ["Abominable Yeti",9,"monstrosity","huge","Arctic","2024"],["Adult Black Dragon",14,"dragon","huge","Swamp","2024"],
  ["Ancient Green Dragon",22,"dragon","grg","Forest","2024"],["Basilisk",3,"monstrosity","med","Desert","2024"],
  ["Bugbear",1,"humanoid","med","Forest","2014"],["Centaur Skeleton",2,"undead","lg","Grassland","2024"],
  ["Dire Wolf",1,"beast","lg","Forest","2024"],["Giant Spider",1,"beast","lg","Forest","2024"],
  ["Goblin",0.25,"humanoid","sm","Forest","2014"],["Goblin Warrior",0.25,"humanoid","sm","Forest","2024"],
  ["Hobgoblin",0.5,"humanoid","med","Forest","2014"],["Ogre",2,"giant","lg","Hill","2024"],
  ["Owlbear",3,"monstrosity","lg","Forest","2024"],["Skeleton",0.25,"undead","med","Urban","2024"],
  ["Swarm of Ravens",0.25,"beast","med","Forest","2024"],["Troll",5,"giant","lg","Swamp","2024"],
  ["Wolf",0.25,"beast","med","Forest","2024"],["Young Red Dragon",10,"dragon","lg","Mountain","2024"]
].map(([name,cr,type,size,env,edition],i)=> {
  const m=npc(`monster${i}`,name,cr);m.system.details.type={value:type};m.system.traits.size=size;
  m.system.details.habitat={value:[{type:env.toLowerCase()}]};m.system.source={book:edition==="2024"?"MM 2024":"MM",rules:edition};
  if(name.includes("Dragon")||name==="Aboleth")m.system.resources.legact={max:3};
  return m;
});
const p={collection:"test.bestiary",documentName:"Actor",metadata:{label:"Preview Bestiary"},getIndex:async()=>new Collection(bestiary.map(m=> {
  const {uuid,...data}=m;return data;
}))};
const ctx=installFoundry({actors:[a,b,c,d],packs:[p],party:[a,b,c]});
const sceneCanvas=document.createElement("canvas");sceneCanvas.id="mock-scene";sceneCanvas.style.cssText="position:fixed;inset:0;width:100%;height:100%;z-index:0";document.body.append(sceneCanvas);canvas.app={canvas:sceneCanvas};
for(const m of bestiary){m.uuid=p.getUuid(m.id);m.pack=p.collection;m.inCompendium=true;ctx.decorate(m);}
// Development-only portrait art: abstract emblems rendered locally, no external assets.
const colors=["#a28bba","#c8b878","#8baf89","#8daec1","#b28365","#6f9b93"];
function portraitData(name,index) {
  const color=colors[index%colors.length];const initial=name[0];
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#20291c"/><path d="M0 0h80v15L0 75Z" fill="${color}" opacity=".15"/><circle cx="40" cy="28" r="14" fill="${color}" opacity=".7"/><path d="M13 77c0-40 54-40 54 0" fill="${color}" opacity=".5"/><text x="40" y="69" text-anchor="middle" fill="#eee5d4" font-size="23" font-family="Georgia">${initial}</text><rect x="2" y="2" width="76" height="76" fill="none" stroke="${color}" opacity=".3"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
for(const [i,actor]of [...game.actors,...bestiary].entries())actor.img=portraitData(actor.name,i);

class MockApplicationV2 {
  constructor(){this.rendered=false;}
  async render(){
    this.element=document.createElement("section");this.element.className="combat-forge-window";
    this.element.innerHTML='<header class="window-header"><img src="/assets/forge.svg" alt="">Combat Forge<span>DEVELOPMENT PREVIEW · MOCK WORLD</span></header><div class="window-content"></div>';
    document.body.append(this.element);this._replaceHTML(await this._renderHTML(),this.element.querySelector(".window-content"));
    this.rendered=true;this._onRender({},{});return this;
  }
  _onRender(){}
  async close(){this.element.remove();this.rendered=false;}
  async minimize(){this.element.style.visibility="hidden";}
  async maximize(){this.element.style.visibility="visible";}
  bringToFront(){}
}
globalThis.foundry={...globalThis.foundry,applications:{api:{ApplicationV2:MockApplicationV2}}};
const {openForge}=await import("../scripts/main.mjs");
Hooks.callAll("init");Hooks.callAll("ready");
globalThis.preview={ctx,bestiary,party:[a,b,c,d],app:openForge()};
await new Promise(resolve=>setTimeout(resolve,70));
const notifications=ui.notifications;
for(const type of ["info","warn","error"]) {
  const original=notifications[type];notifications[type]=message=> {
    original(message);const el=document.createElement("div");el.className="mock-notification";el.textContent=message;document.body.append(el);setTimeout(()=>el.remove(),2500);
  };
}
