import { ID, formatNumber as num, formatCR } from "./constants.mjs";
import { normalizeMonster } from "./normalize.mjs";
import { actorPack } from "./catalog.mjs";
import { normalizeEncounter, newWave, flattenWaves, parseTags, filterVault, exportVault, parseVaultImport, IMPORT_LIMIT, MAX_WAVES } from "./encounters.mjs";
import { vaultFolders, createVaultFolder, renameVaultFolder, deleteVaultFolder, saveEncounter, importVault } from "./vault.mjs";
import { resolveReplacement, repairState } from "./repairs.mjs";
import { deployEncounter, pickCanvasPoint } from "./deploy.mjs";
import { recommendEncounters, rankSavedEncounters } from "./recommendations.mjs";
import { escapeHTML as e, icon, button, select, portrait } from "./view.mjs";
import { vaultWorkspaceHTML, recommendationsHTML, waveControlsHTML } from "./campaign-view.mjs";

export async function inspectSources(waves,catalog){
  const found=new Map(),problems=[],references=new Map(),repairs=repairState();
  for(const wave of waves)for(const line of wave.lines){const item=references.get(line.monster.uuid)??{uuid:line.monster.uuid,name:line.monster.name,waves:[]};if(!item.waves.includes(wave.name))item.waves.push(wave.name);references.set(item.uuid,item);}
  for(const item of references.values()){
    try{
      const uuid=resolveReplacement(item.uuid,repairs.replacements),actor=await foundry.utils.fromUuid(uuid);
      if(actor?.documentName!=="Actor"||actor.type!=="npc"){problems.push({...item,kind:"missing",message:"Source actor is unavailable."});continue;}
      const monster=normalizeMonster(actor,actorPack(actor),repairs.actors[uuid]);
      catalog?.record(actor,actorPack(actor),false);
      if(!monster)problems.push({...item,kind:"invalid",resolvedUuid:uuid,message:"Source actor needs a valid CR in the Ledger."});
      else found.set(item.uuid,monster);
    }catch(error){problems.push({...item,kind:"missing",message:error.message});}
  }
  return {found,problems};
}

export function downloadJSON(name,json){
  const url=URL.createObjectURL(new Blob([json],{type:"application/json"})),anchor=document.createElement("a");
  anchor.href=url;anchor.download=name.replace(/[^a-z0-9_-]+/gi,"-").slice(0,80)+".json";document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}

export function installCampaignFeatures(Controller){
  Object.defineProperties(Controller.prototype,{
    activeWave:{get(){this.waves??=[newWave()];return this.waves.find(w=>w.id===this.activeWaveId)??this.waves[0];}},
    lines:{get(){return this.activeWave.lines;},set(value){this.activeWave.lines=value;}},
    allLines:{get(){return flattenWaves(this.waves);}},
    totalMonsterCount:{get(){return this.waves.reduce((n,w)=>n+w.lines.reduce((sum,l)=>sum+l.quantity,0),0);}}
  });
  Object.assign(Controller.prototype,{
    initCampaign(){
      this.activeWaveId=this.activeWave.id;this.draftKey=crypto.randomUUID();this.meta={tags:[],folder:"",notes:""};
      this.vault={search:"",folder:"*",tag:"",sort:"recent",page:0};this.suggestions=[];this.recommendedSaved=[];
      this.recommendationSettings={difficulty:"",maxMonsters:6};this.recommendationBusy=false;this.recommendationError="";this.savedSuggestions=new Set();this.repairContext=null;
    },
    adoptEncounter(data){
      const valid=normalizeEncounter(data);this.waves=valid.waves;this.activeWaveId=valid.activeWaveId;this.rules=valid.rules;
      this.partyUuids=valid.party.map(p=>p.uuid);this.meta={tags:valid.tags,folder:valid.folder,notes:valid.notes};return valid;
    },
    resetEncounter(){this.waves=[newWave()];this.activeWaveId=this.waves[0].id;this.meta={tags:[],folder:"",notes:""};this.loadedId=null;this.loadedName="";this.draftKey=crypto.randomUUID();},
    encounterSnapshot(){return normalizeEncounter({schema:2,waves:this.waves,activeWaveId:this.activeWave.id,party:this.party,rules:this.rules,...this.meta});},
    recommendationKey(){return JSON.stringify({party:this.party.map(p=>[p.uuid,p.level,p.readiness]),rules:this.rules,filters:this.filters,count:this.catalog.monsters.length});},
    campaignView(entries){
      const totalMonsterCount=this.totalMonsterCount;
      return {waveMarkup:this.tab==="forge"?waveControlsHTML(this.waves,this.activeWave.id,totalMonsterCount):"",waveCount:this.waves.length,totalMonsterCount,
        vaultMarkup:this.tab==="vault"?vaultWorkspaceHTML(entries,filterVault(entries,this.vault),vaultFolders(),this.vault):"",
        recommendedMarkup:this.tab==="recommended"?recommendationsHTML(this.suggestions,this.recommendedSaved,{busy:this.recommendationBusy,error:this.recommendationError,settings:this.recommendationSettings,rules:this.rules,hasParty:this.party.length>0,stale:this.suggestions.length&&this.recommendationSignature!==this.recommendationKey(),saved:this.savedSuggestions}):""};
    },
    handleCampaignInput(input){
      if(input.name!=="vaultSearch")return false;
      this.vault.search=input.value;this.vault.page=0;clearTimeout(this.searchTimer);this.searchTimer=setTimeout(()=>this.paint(),140);return true;
    },
    handleCampaignChange(input){
      if(input.name==="activeWave"){this.activeWaveId=input.value;this.changed(this.dirty);return true;}
      if(["vaultTag","vaultSort"].includes(input.name)){this.vault[input.name==="vaultTag"?"tag":"sort"]=input.value;this.vault.page=0;this.paint();return true;}
      if(input.name==="recommendDifficulty"||input.name==="recommendMax"){
        this.recommendationSettings[input.name==="recommendMax"?"maxMonsters":"difficulty"]=input.name==="recommendMax"?Math.max(1,Math.min(12,Number(input.value)||6)):input.value;return true;
      }
      return false;
    },
    async handleCampaignAction(action,target){
      const id=target.dataset.id,waveId=target.dataset.wave;
      if(action==="wave-add")this.addWaveDialog();
      else if(action==="wave-edit")this.editWaveDialog(waveId||this.activeWave.id);
      else if(action==="wave-delete")this.deleteWaveDialog(waveId);
      else if(action==="wave-up"||action==="wave-down"){
        const index=this.waves.findIndex(w=>w.id===waveId),next=index+(action==="wave-up"?-1:1);
        if(index>=0&&next>=0&&next<this.waves.length){[this.waves[index],this.waves[next]]=[this.waves[next],this.waves[index]];this.closeDialog();this.changed();}
      }
      else if(action==="clear-wave"){this.lines=[];this.changed();}
      else if(action==="encounter-notes")this.notesDialog();
      else if(action==="vault-folder"){this.vault.folder=target.dataset.folder;this.vault.page=0;this.paint();}
      else if(action==="vault-page"){this.vault.page=Number(target.dataset.page)||0;this.paint();}
      else if(action==="vault-tag"){this.vault.tag=target.dataset.tag;this.vault.page=0;this.paint();}
      else if(action==="vault-folder-new"||action==="vault-folder-edit")this.folderDialog(id);
      else if(action==="vault-folder-delete")this.deleteFolderDialog(id);
      else if(action==="vault-export"){
        const entries=id?this.entries.filter(v=>v.id===id):filterVault(this.entries,this.vault);
        if(!entries.length)throw new Error("No matching encounters to export.");downloadJSON(id?entries[0].name:"combat-forge-vault",exportVault(entries));this.notify(`Exported ${entries.length} encounter${entries.length===1?"":"s"}.`);
      }
      else if(action==="vault-import")this.importDialog();
      else if(action==="deploy-saved"||action==="deploy-saved-wave"){
        const entry=this.entries.find(v=>v.id===id);if(!entry)throw new Error("That encounter no longer exists.");this.deploySavedDialog(entry,waveId);
      }
      else if(action==="deploy")this.campaignDeployDialog(this.lines,{wave:this.activeWave,encounterId:this.loadedId||`draft:${this.draftKey}`,encounterName:this.loadedName||"Unsaved encounter"});
      else if(action==="repair-encounter"){
        const entry=this.entries.find(v=>v.id===id);if(entry)await this.encounterRepairDialog({...entry,intent:"load"});
      }
      else if(action==="repair-done"){
        const context=this.repairContext;this.repairContext=null;this.closeDialog();
        if(context?.intent==="deploy")this.campaignDeployDialog(context.wave.lines,{wave:context.wave,encounterId:context.id,encounterName:context.name});
      }
      else if(action==="repair-dismiss"){this.repairContext=null;this.closeDialog();}
      else if(action==="tab-recommended"){this.tab="recommended";this.paint();if(!this.suggestions.length)await this.buildRecommendations();}
      else if(action==="recommend-refresh")await this.buildRecommendations();
      else if(action==="recommend-load"||action==="recommend-save"){
        const candidate=this.suggestions.find(s=>s.id===id);if(!candidate)throw new Error("Refresh recommendations first.");
        if(action==="recommend-save"){await saveEncounter(candidate.name,candidate.data);this.savedSuggestions.add(id);this.paint();this.notify("Recommended encounter saved to the Vault.");}
        else{this.adoptEncounter(candidate.data);this.loadedId=null;this.loadedName=candidate.name;this.tab="forge";await this.syncParty();this.changed();}
      }
      else return false;
      return true;
    },
    addWaveDialog(){
      if(this.waves.length>=MAX_WAVES)throw new Error(`An encounter supports at most ${MAX_WAVES} waves.`);
      this.showDialog("Add a wave",`<label class="cf-field">Wave name<input name="waveName" maxlength="80" value="Reinforcements ${this.waves.length}" required></label><label class="cf-field">Arrival trigger<input name="trigger" maxlength="240" placeholder="Round 3, when the alarm sounds, or a GM decision"></label><p>Each wave is rated and deployed separately. No tokens appear automatically when a trigger is written here.</p>`,async data=>{
        const wave=newWave(String(data.get("waveName")).trim());wave.trigger=String(data.get("trigger")).trim();this.waves.push(wave);this.activeWaveId=wave.id;this.closeDialog();this.changed();
      },{submit:"Add wave"});
    },
    editWaveDialog(id){
      const wave=this.waves.find(w=>w.id===id);if(!wave)return;const index=this.waves.indexOf(wave);
      this.showDialog("Edit wave",`<label class="cf-field">Wave name<input name="waveName" value="${e(wave.name)}" maxlength="80" required></label><label class="cf-field">Arrival trigger<input name="trigger" value="${e(wave.trigger)}" maxlength="240"></label><label class="cf-field">Wave notes<textarea name="waveNotes" rows="4" maxlength="4000">${e(wave.notes)}</textarea></label><div class="cf-dialog-actions">${button("wave-up","Move earlier","chevron-left",`data-wave="${e(id)}" ${index===0?"disabled":""}`)}${button("wave-down","Move later","chevron-right",`data-wave="${e(id)}" ${index===this.waves.length-1?"disabled":""}`)}${button("wave-delete","Delete wave","xmark",`data-wave="${e(id)}" ${this.waves.length===1?"disabled":""}`)}</div>`,async data=>{
        wave.name=String(data.get("waveName")).trim();wave.trigger=String(data.get("trigger")).trim();wave.notes=String(data.get("waveNotes")).trim();this.closeDialog();this.changed();
      },{submit:"Save wave",wide:true});
    },
    deleteWaveDialog(id){
      const wave=this.waves.find(w=>w.id===id);if(!wave||this.waves.length===1)return;
      this.showDialog("Delete wave",`<p>Remove <strong>${e(wave.name)}</strong> and its creature list from this draft? Deployed tokens stay on the scene.</p>`,async()=>{
        this.waves=this.waves.filter(w=>w.id!==id);if(this.activeWaveId===id)this.activeWaveId=this.waves[0].id;this.closeDialog();this.changed();
      },{submit:"Delete wave"});
    },
    notesDialog(){
      this.showDialog("Encounter notes",`<label class="cf-field">Notes<textarea name="notes" rows="9" maxlength="20000" placeholder="Objectives, terrain, tactics, treasure, and story hooks…">${e(this.meta.notes)}</textarea></label>`,async data=>{this.meta.notes=String(data.get("notes"));this.closeDialog();this.changed();},{submit:"Keep notes",wide:true});
    },
    saveCampaignDialog(){
      if(!this.allLines.length)throw new Error("Add creatures to at least one wave before saving.");
      this.showDialog(this.loadedId?"Save encounter":"Save to the Vault",`<label class="cf-field">Encounter name<input name="name" value="${e(this.loadedName)}" maxlength="120" required autofocus placeholder="A dangerous meeting…"></label><div class="cf-field-grid"><label class="cf-field">Folder<input name="folder" list="cf-vault-folders" value="${e(this.meta.folder)}" maxlength="80" placeholder="Unfiled"><datalist id="cf-vault-folders">${vaultFolders().map(f=>`<option value="${e(f.name)}"></option>`).join("")}</datalist></label><label class="cf-field">Tags<input name="tags" value="${e(this.meta.tags.join(", "))}" placeholder="Forest, Boss, Session 4"></label></div><label class="cf-field">Encounter notes<textarea name="notes" rows="4" maxlength="20000">${e(this.meta.notes)}</textarea></label>${this.loadedId?'<label class="cf-check"><input name="copy" type="checkbox"><span>Save as a new encounter</span></label>':""}<small>${this.waves.length} wave${this.waves.length===1?"":"s"} · ${this.totalMonsterCount} monsters in total. Each wave keeps its own difficulty, trigger, and notes.</small>`,async data=>{
        const meta={folder:String(data.get("folder")).trim(),tags:parseTags(String(data.get("tags"))),notes:String(data.get("notes"))};
        const journal=await saveEncounter(data.get("name"),{...this.snapshot(),...meta},data.has("copy")?null:this.loadedId);
        this.meta=meta;this.loadedId=journal.id;this.loadedName=journal.name;this.closeDialog();this.changed(false);await this.writeQueue;this.notify("Encounter saved to the Vault.");
      },{submit:this.loadedId?"Save encounter":"Save to Vault",wide:true});
    },
    async loadCampaignEncounter(id){
      const entry=this.entries.find(v=>v.id===id);if(!entry)throw new Error("That encounter no longer exists.");
      const data=normalizeEncounter(entry.data),checked=await inspectSources(data.waves,this.catalog);
      for(const wave of data.waves)for(const line of wave.lines){const monster=checked.found.get(line.monster.uuid);if(monster){line.monster=monster;delete line.missing;}else line.missing=true;}
      this.closeDialog();this.adoptEncounter(data);this.loadedId=id;this.loadedName=entry.name;this.tab="forge";await this.syncParty();this.changed(false);
      if(checked.problems.length)await this.encounterRepairDialog({...entry,intent:"load"});else this.notify(`${entry.name} loaded into the Forge.`);
    },
    campaignDetailDialog(id){
      const entry=this.entries.find(v=>v.id===id);if(!entry)throw new Error("Encounter no longer exists.");
      const {data}=entry,r=data.report;
      this.showDialog(entry.name,`<div class="cf-detail-stats"><div><small>ALL WAVES</small><strong>${num(r.count)} monsters</strong></div><div><small>TOTAL XP</small><strong>${num(r.xp)}</strong></div><div><small>PEAK WAVE AT SAVE</small><strong class="cf-text-${e(r.shown.tone)}">${e(r.shown.label)}</strong></div></div><div class="cf-entry-tags">${data.folder?`<span>${icon("folder")} ${e(data.folder)}</span>`:""}${data.tags.map(tag=>`<span>${e(tag)}</span>`).join("")}</div>${data.notes?`<section class="cf-encounter-notes"><h3>Encounter notes</h3><p>${e(data.notes)}</p></section>`:""}<div class="cf-detail-waves">${data.waves.map((w,i)=>{
        const report=r.waves[i],deployed=this.deployedCount(id,w.id);
        return `<section class="cf-saved-wave"><header><div><span class="cf-eyebrow">WAVE ${i+1}</span><h3>${e(w.name)}</h3></div><span class="cf-text-${e(report.shown.tone)}">${e(report.shown.label)} · ${num(report.xp)} XP</span></header>${w.trigger?`<p class="cf-wave-trigger">${icon("hourglass-half")} ${e(w.trigger)}</p>`:""}<div class="cf-detail-monsters">${w.lines.map(l=>`<div>${portrait(l.monster.img,l.monster.name)}<b>${l.quantity}×</b><strong>${e(l.monster.name)}</strong><small>CR ${formatCR(l.monster.cr)}</small></div>`).join("")||"<small>No creatures in this wave.</small>"}</div>${w.notes?`<p class="cf-plain-notes">${e(w.notes)}</p>`:""}<footer><small>${deployed?`${deployed} tokens from this wave are on the current scene`:"Deploy this group when its trigger occurs"}</small>${button("deploy-saved-wave","Deploy wave","chess-rook",`data-id="${e(id)}" data-wave="${e(w.id)}" ${!w.lines.length?"disabled":""}`)}</footer></section>`;
      }).join("")}</div><h3>Party at save</h3><div class="cf-detail-party">${data.party.map(p=>`<div>${portrait(p.img,p.name)}<span>${e(p.name)} <small>Level ${p.level}</small></span></div>`).join("")||"<small>No party saved.</small>"}</div><p>Ratings use the saved party snapshot. Waves that overlap or follow resource depletion can be harder than their separate ratings.</p><div class="cf-dialog-actions">${button("load","Load into Forge","hammer",`data-id="${e(id)}" class="cf-primary"`)}${button("repair-encounter","Check sources","arrows-rotate",`data-id="${e(id)}"`)}${button("vault-export","Export JSON","file-export",`data-id="${e(id)}"`)}</div>`,null,{wide:true});
    },
    deployedCount(id,waveId){return globalThis.canvas?.ready?[...canvas.scene.tokens].filter(t=>t.flags?.[ID]?.encounterId===id&&t.flags?.[ID]?.waveId===waveId).length:0;},
    deploySavedDialog(entry,waveId){
      const waves=entry.data.waves.filter(w=>w.lines.length);
      if(!waves.length)throw new Error("This encounter has no creatures to deploy. Load it into the Forge to add them.");
      if(waveId||waves.length===1){const wave=waves.find(w=>w.id===waveId)||waves[0];return this.campaignDeployDialog(wave.lines,{wave,encounterId:entry.id,encounterName:entry.name});}
      this.showDialog("Choose a wave",`<p>Deploy one group from <strong>${e(entry.name)}</strong>.</p>${select("wave","Wave",waves.map(w=>({value:w.id,label:`${w.name} · ${w.lines.reduce((n,l)=>n+l.quantity,0)} monsters`})),waves[0].id,null)}`,async data=>{const wave=waves.find(w=>w.id===data.get("wave"));this.closeDialog();this.campaignDeployDialog(wave.lines,{wave,encounterId:entry.id,encounterName:entry.name});},{submit:"Choose wave"});
    },
    campaignDeployDialog(lines,{wave=this.activeWave,encounterId=this.loadedId||`draft:${this.draftKey}`,encounterName=this.loadedName||"Unsaved encounter"}={}){
      if(!lines?.length)throw new Error("Add creatures before deploying this wave.");if(!canvas?.ready)throw new Error("Open a scene first.");
      const copy=structuredClone(lines),selectedWave={...structuredClone(wave),lines:copy},count=copy.reduce((n,l)=>n+l.quantity,0),deployed=this.deployedCount(encounterId,wave.id);
      const dialog=this.showDialog("Deploy encounter",`<span class="cf-eyebrow">${e(encounterName)} · ${e(wave.name)}</span><p>Place <strong>${count} monster${count===1?"":"s"}</strong> into <strong>${e(canvas.scene.name)}</strong>.</p>${deployed?`<div class="cf-callout">${deployed} tokens from this wave are already on this scene. Deploying again adds another copy.</div>`:""}${wave.trigger?`<p>${e(wave.trigger)}</p>`:""}${select("placement","Placement",[{value:"center",label:"Near the center of the current view"},{value:"click",label:"Choose a point on the scene"}],"center",null)}<label class="cf-check"><input type="checkbox" name="hidden" checked><span>Place tokens hidden from players</span></label><label class="cf-check"><input type="checkbox" name="combat"><span>Add this group to the scene's active combat</span></label><label class="cf-check"><input type="checkbox" name="initiative"><span>Roll initiative for this group when it enters combat</span></label><div class="cf-callout">Existing combatants keep their initiatives and the current combatant keeps their turn. Hidden groups roll privately to the GM. Review terrain and placement before revealing tokens.</div>`,async data=>{
        const sceneId=canvas.scene.id,checked=await inspectSources([selectedWave],this.catalog);
        if(checked.problems.length){this.closeDialog();await this.encounterRepairDialog({id:encounterId,name:encounterName,data:{schema:2,waves:[selectedWave],party:this.party,rules:this.rules},wave:selectedWave,intent:"deploy"});return;}
        const hidden=data.has("hidden"),rollInitiative=data.has("initiative"),addToCombat=data.has("combat")||rollInitiative;
        this.closeDialog();let origin=null;
        if(data.get("placement")==="click"){
          await this.onMinimize?.();try{origin=await pickCanvasPoint({signal:this.abort.signal});}finally{if(!this.abort.signal.aborted)await this.onMaximize?.();}if(!origin)return;
        }
        try{if(canvas.scene?.id!==sceneId)throw new Error("Scene changed. Open deployment again for the intended scene.");await deployEncounter(copy,{origin,hidden,addToCombat,rollInitiative,encounterId,waveId:wave.id,waveName:wave.name});this.paint();}catch(error){this.error(error);}
      },{submit:"Deploy monsters"});
      const combat=dialog.querySelector('[name="combat"]'),initiative=dialog.querySelector('[name="initiative"]');
      initiative.addEventListener("change",()=>{if(initiative.checked)combat.checked=true;});combat.addEventListener("change",()=>{if(!combat.checked)initiative.checked=false;});
    },
    async encounterRepairDialog(context){
      this.repairContext=context;const data=normalizeEncounter(context.data),checked=await inspectSources(data.waves,this.catalog);
      await this.catalog.auditReferences(this.entries,data.lines);
      this.showDialog("Repair encounter sources",`<span class="cf-eyebrow">${e(context.name)}</span><p>${checked.problems.length?"These sources are missing or need metadata repairs. Choose replacements without changing the original compendiums.":"All source actors are available. Your encounter is ready to use."}</p><div class="cf-source-problems">${checked.problems.map(p=>`<article><div><strong>${e(p.name)}</strong><small>${e(p.waves.join(", "))}</small><code>${e(p.uuid)}</code><p>${e(p.message)}</p></div><div>${p.kind==="invalid"?button("repair-monster","Repair CR","feather-pointed",`data-uuid="${e(p.resolvedUuid||p.uuid)}"`):""}${button("replace-reference","Choose replacement","arrows-rotate",`data-uuid="${e(p.uuid)}"`)}</div></article>`).join("")}</div><div class="cf-dialog-actions">${!checked.problems.length?button("repair-done",context.intent==="deploy"?"Continue deployment":"Return to Forge","check","class=\"cf-primary\""):""}${button("repair-dismiss",checked.problems.length?"Keep editing":"Close",null)}</div>`,null,{wide:true});
    },
    folderDialog(id){
      const folder=vaultFolders().find(f=>f.id===id),oldName=folder?.name;
      this.showDialog(folder?"Rename Vault folder":"Create Vault folder",`<label class="cf-field">Folder name<input name="folderName" maxlength="80" value="${e(folder?.name||"")}" required autofocus></label>${folder?button("vault-folder-delete","Delete folder, keep encounters","xmark",`data-id="${e(id)}"`):""}`,async data=>{
        const result=folder?await renameVaultFolder(id,data.get("folderName")):await createVaultFolder(data.get("folderName"));
        if(this.meta.folder===oldName)this.meta.folder=result.name;this.vault.folder=result.name;this.closeDialog();this.paint();
      },{submit:folder?"Rename folder":"Create folder"});
    },
    deleteFolderDialog(id){
      const folder=vaultFolders().find(f=>f.id===id);if(!folder)return;
      this.showDialog("Delete Vault folder",`<p>Delete <strong>${e(folder.name)}</strong> and move its encounters to Unfiled? Encounters and deployed tokens are kept.</p>`,async()=>{await deleteVaultFolder(id);if(this.meta.folder===folder.name)this.meta.folder="";this.vault.folder="*";this.closeDialog();this.paint();},{submit:"Delete folder"});
    },
    importDialog(){
      let preview=null;
      const dialog=this.showDialog("Import encounter JSON",`<p>Import new copies from a Combat Forge export. Existing encounters are kept. Missing actors can be repaired after import.</p><label class="cf-field">Choose JSON file<input name="jsonFile" type="file" accept=".json,application/json"></label><label class="cf-field">Or paste exported JSON<textarea name="json" rows="6" placeholder="Paste a Combat Forge Vault export…"></textarea></label><div class="cf-import-preview" aria-live="polite"><small>Select a file or paste JSON to preview its encounters.</small></div>`,async()=>{
        if(!preview)throw new Error("Choose a valid JSON file or paste an export first.");
        const created=await importVault(preview);this.closeDialog();this.tab="vault";this.vault={search:"",folder:"*",tag:"",sort:"recent",page:0};this.paint();this.notify(`Imported ${created.length} encounter${created.length===1?"":"s"} as new copies.`);
      },{submit:"Import new copies",wide:true});
      const textarea=dialog.querySelector('[name="json"]'),target=dialog.querySelector(".cf-import-preview"),submit=dialog.querySelector('[type="submit"]');submit.disabled=true;
      const update=()=>{
        try{preview=parseVaultImport(textarea.value);target.innerHTML=`<strong>${preview.length} encounter${preview.length===1?"":"s"} ready</strong><ul>${preview.map(entry=>`<li>${e(entry.name)} · ${entry.data.waves.length} waves · ${entry.data.report.count} monsters${entry.data.folder?` · ${e(entry.data.folder)}`:""}</li>`).join("")}</ul><small>Only encounter metadata and actor references are imported. Source availability is checked when loading or deploying.</small>`;submit.disabled=false;}
        catch(error){preview=null;submit.disabled=true;target.textContent=error.message;}
      };
      textarea.addEventListener("input",update);
      dialog.querySelector('[name="jsonFile"]').addEventListener("change",async event=>{const file=event.target.files[0];if(!file)return;if(file.size>IMPORT_LIMIT){preview=null;submit.disabled=true;target.textContent="Choose a file no larger than 5 MB.";return;}textarea.value=await file.text();update();});
    },
    async buildRecommendations(){
      if(this.recommendationBusy)return;this.recommendationBusy=true;this.recommendationError="";this.paint();
      try{
        await new Promise(resolve=>requestAnimationFrame(resolve));
        const options={rules:this.rules,filters:{...this.filters},...this.recommendationSettings};
        this.suggestions=recommendEncounters(this.catalog.monsters,this.party,options);this.recommendedSaved=rankSavedEncounters(this.entries,this.party,options);
        this.recommendationSignature=this.recommendationKey();this.savedSuggestions.clear();
      }catch(error){this.suggestions=[];this.recommendedSaved=[];this.recommendationError=error.message;}
      finally{this.recommendationBusy=false;this.paint();}
    }
  });
}
