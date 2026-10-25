import { ID, DEFAULT_RULES } from "./constants.mjs";
import { CombatForge } from "./app.mjs";
import { assessEncounter } from "./difficulty.mjs";
import { generateEncounter } from "./generator.mjs";
import { normalizeMonster, normalizeCharacter } from "./normalize.mjs";
import { deployEncounter } from "./deploy.mjs";
import { EMPTY_REPAIRS } from "./repairs.mjs";
import { recommendEncounters } from "./recommendations.mjs";
import { normalizeEncounter } from "./encounters.mjs";
import { invalidateVaultEntry } from "./vault.mjs";
import { catalogueMetadataChanged, affectsParty, tokenResourcesChanged } from "./events.mjs";

let app;
export function openForge() {
  if(!game.user.isGM){ui.notifications.warn("Combat Forge is a GM encounter builder.");return;}
  if(game.system.id!=="dnd5e"){ui.notifications.error("Combat Forge requires the D&D5e game system.");return;}
  if(!app)app=new CombatForge();
  if(app.rendered){app.maximize();app.bringToFront();return app;}
  app.render({force:true});return app;
}

class ForgeSettingsMenu extends foundry.applications.api.ApplicationV2 {
  render() {return openForge();}
}

Hooks.once("init",()=> {
  const settings={
    sources:{scope:"world",type:Object,default:{auto:true,packs:[],world:true}},
    homebrew:{scope:"world",type:Array,default:[]},
    defaultRules:{scope:"world",type:Object,default:{...DEFAULT_RULES}},
    draft:{scope:"client",type:Object,default:{}},
    catalogRepairs:{scope:"world",type:Object,default:structuredClone(EMPTY_REPAIRS)}
  };
  for(const [key,config] of Object.entries(settings))game.settings.register(ID,key,{...config,config:false});
  game.settings.registerMenu(ID,"openForge",{name:"Combat Forge",label:"Open encounter builder",hint:"Choose sources, configure difficulty rules, and manage your encounter Vault.",icon:"fa-solid fa-hammer",type:ForgeSettingsMenu,restricted:true});
  game.keybindings.register(ID,"open",{name:"Open Combat Forge",hint:"Open the encounter builder.",editable:[{key:"KeyE",modifiers:["Control","Shift"]}],restricted:true,onDown:()=>{openForge();return true;}});
});

Hooks.once("ready",()=> {
  const module=game.modules.get(ID);
  module.api=Object.freeze({open:openForge,assessEncounter,generateEncounter,recommendEncounters,normalizeEncounter,normalizeMonster,normalizeCharacter,deployEncounter});
});

Hooks.on("getSceneControlButtons",controls=> {
  if(!game.user.isGM || game.system.id!=="dnd5e")return;
  if(controls.tokens?.tools)controls.tokens.tools.combatForge={name:"combatForge",title:"Combat Forge — Encounter Builder",icon:"fa-solid fa-hammer",button:true,order:90,onChange:()=>openForge()};
});

Hooks.on("renderActorDirectory",(directory,element)=> {
  if(!game.user.isGM || game.system.id!=="dnd5e")return;
  const root=element instanceof HTMLElement?element:element?.[0];
  const header=root?.querySelector(".header-actions");
  if(!header || header.querySelector("[data-combat-forge]"))return;
  const button=document.createElement("button");button.type="button";button.dataset.combatForge="true";
  button.innerHTML='<i class="fa-solid fa-hammer" aria-hidden="true"></i> Combat Forge';
  button.addEventListener("click",openForge);header.append(button);
});

let partyTimer,sourceTimer;
const updateParty=document=> {
  if(!app?.rendered||!affectsParty(document,app.controller.partyUuids))return;
  clearTimeout(partyTimer);partyTimer=setTimeout(()=>app?.rendered&&app.controller.refreshParty().catch(error=>app.controller.error(error)),100);
};
for(const hook of ["updateActor","createItem","updateItem","deleteItem","createActiveEffect","updateActiveEffect","deleteActiveEffect","deleteToken"])Hooks.on(hook,updateParty);
Hooks.on("updateToken",(token,changes)=>{if(tokenResourcesChanged(changes))updateParty(token);});
Hooks.on("deleteActor",updateParty);
const updateSources=()=> {
  clearTimeout(sourceTimer);sourceTimer=setTimeout(()=> {
    if(app?.rendered)app.controller.refreshCatalog().catch(error=>app.controller.error(error));
  },600);
};
Hooks.on("updateCompendium",pack=>{if(pack.documentName==="Actor")updateSources();});
Hooks.on("createCompendium",updateSources);
Hooks.on("deleteCompendium",updateSources);
for(const hook of ["createActor","deleteActor"])Hooks.on(hook,actor=>{if(actor.type==="npc")updateSources();});
Hooks.on("updateActor",(actor,changes)=>{if((actor.type==="npc"||Object.hasOwn(changes??{},"type"))&&catalogueMetadataChanged(changes))updateSources();});
for(const hook of ["createJournalEntry","updateJournalEntry","deleteJournalEntry"])Hooks.on(hook,journal=> {
  const wasCached=invalidateVaultEntry(journal);
  if((wasCached||journal.getFlag(ID,"encounter"))&&app?.rendered)app.controller.paint();
});
for(const hook of ["createFolder","updateFolder","deleteFolder"])Hooks.on(hook,folder=>{
  if(folder.type==="JournalEntry"&&app?.rendered)app.controller.paint();
});
