import { ID, DEFAULT_RULES, MAX_MONSTERS, formatNumber as num, formatCR } from "./constants.mjs";
import { normalizeCharacter, filterMonsters, facets } from "./normalize.mjs";
import { assessEncounter, rulesConfig } from "./difficulty.mjs";
import { generateEncounter } from "./generator.mjs";
import { actorPacks, actorPack, MonsterCatalog } from "./catalog.mjs";
import { vaultEntries, validateEncounter } from "./vault.mjs";
import { shellHTML, escapeHTML as e, icon, button, select, portrait } from "./view.mjs";
import { healthHTML } from "./health-view.mjs";
import { saveCorrection, resetCorrection, setHidden, preferDuplicate, saveReplacement, removeReplacement, resolveReplacement } from "./repairs.mjs";
import { installCampaignFeatures } from "./campaign.mjs";

export class ForgeController {
  constructor(root) {
    this.root=root; this.catalog=new MonsterCatalog();
    this.tab="forge";this.filters={};this.sort="name";this.desc=false;this.page=0;this.pageSize=60;
    this.lines=[];this.party=[];this.partyUuids=[];this.missingParty=[];this.rules={...DEFAULT_RULES};
    this.loadedId=null;this.loadedName="";this.dirty=false;this.progress=null;this.toast="";this.busy=false;
    this.abort=new AbortController();this.writeQueue=Promise.resolve();
    this.health={section:"metadata",filter:"issues",search:"",pack:"",page:0,scanning:false};
    this.initCampaign();
  }

  async mount() {
    const signal=this.abort.signal;
    this.root.addEventListener("click",event=>this.onClick(event),{signal});
    this.root.addEventListener("input",event=>this.onInput(event),{signal});
    this.root.addEventListener("change",event=>this.onChange(event),{signal});
    this.root.addEventListener("keydown",event=> {
      const editable=event.target.matches("input,select,textarea");
      if(editable || this.dialog?.open) event.stopPropagation();
      if(event.key==="/" && !editable && !this.dialog?.open){event.preventDefault();this.root.querySelector('[name="search"]')?.focus();}
      if(["Enter"," "].includes(event.key) && event.target.matches("tr[data-cf-action]")) {event.preventDefault();event.target.click();}
    },{signal});
    this.root.addEventListener("error",event=> {
      if(event.target.matches?.("img[data-fallback]")) {event.target.removeAttribute("data-fallback");event.target.src="icons/svg/mystery-man.svg";}
    },{capture:true,signal});
    this.root.addEventListener("dragover",event=>{event.preventDefault();event.dataTransfer.dropEffect="copy";this.root.classList.add("cf-dragging");},{signal});
    this.root.addEventListener("dragleave",event=>{if(!this.root.contains(event.relatedTarget))this.root.classList.remove("cf-dragging");},{signal});
    this.root.addEventListener("drop",event=>this.onDrop(event),{signal});
    const draft=game.settings.get(ID,"draft");
    this.rules=rulesConfig(draft?.rules ?? game.settings.get(ID,"defaultRules"));
    if([1,2].includes(draft?.schema)) {
      try {
        const valid=validateEncounter(draft);
        this.adoptEncounter(valid);this.loadedId=draft.loadedId||null;
        this.loadedName=draft.name||"";this.dirty=Boolean(draft.dirty);this.draftKey=draft.draftKey||this.draftKey;
      } catch(error) {ui.notifications.warn(`Combat Forge could not restore the draft: ${error.message}`);}
    } else {
      this.partyUuids=[...new Set([...game.users].filter(u=>!u.isGM).map(u=>u.character?.uuid).filter(Boolean))];
    }
    await this.syncParty();this.paint();await this.refreshCatalog();
  }

  destroy() {clearTimeout(this.searchTimer);clearTimeout(this.toastTimer);this.abort.abort();this.dialog?.close();}
  get dialog() {return this.root.querySelector(".cf-dialog");}
  get report() {return assessEncounter(this.lines,this.party,this.rules);}
  get entries() {return vaultEntries();}
  findMonster(uuid) {return this.catalog.get(uuid) ?? this.lines.find(l=>l.monster.uuid===uuid)?.monster;}

  async syncParty() {
    const party=[],missing=[];
    for(const uuid of [...new Set(this.partyUuids)]) {
      try {const pc=normalizeCharacter(await foundry.utils.fromUuid(uuid));if(pc)party.push(pc);else missing.push(uuid);}
      catch {missing.push(uuid);}
    }
    this.party=party;this.missingParty=missing;
  }

  async refreshParty() {if(this.abort.signal.aborted)return;await this.syncParty();this.paint();}
  async refreshCatalog() {
    this.progress={done:0,total:0,label:"compendiums"};this.paint();
    await this.catalog.refresh(progress=> {
      this.progress=progress;
      if(!this.lastProgressPaint || Date.now()-this.lastProgressPaint>180){this.lastProgressPaint=Date.now();this.paint();}
    });
    this.progress=null;
    for(const wave of this.waves)for(const line of wave.lines){const m=this.catalog.get(line.monster.uuid);if(m){line.monster=m;line.missing=false;}}
    this.paint();
  }

  snapshot() {return this.encounterSnapshot();}
  changed(markDirty=true) {
    this.dirty=markDirty;this.paint();
    const data={...this.snapshot(),party:this.partyUuids.map(uuid=>this.party.find(p=>p.uuid===uuid)??{uuid}),loadedId:this.loadedId,name:this.loadedName,dirty:this.dirty,draftKey:this.draftKey};
    this.writeQueue=this.writeQueue.catch(()=>{}).then(()=>game.settings.set(ID,"draft",data)).catch(error=>this.error(error));
  }

  paint() {
    if(this.abort.signal.aborted)return;
    if(this.dialog?.open){this.paintPending=true;return;}
    const active=this.root.contains(document.activeElement)?document.activeElement:null;
    const focusName=active?.name;
    const selection=active?.type==="search" || active?.type==="text" ? [active.selectionStart,active.selectionEnd] : null;
    const scrolls=[...this.root.querySelectorAll("[data-scroll]")].map(el=>[el.dataset.scroll,el.scrollTop]);
    let matches=filterMonsters(this.catalog.monsters,this.filters);
    const sizeOrder=["Tiny","Small","Medium","Large","Huge","Gargantuan"];
    matches.sort((a,b)=> {
      const key=this.sort;
      const cmp=key==="size"?sizeOrder.indexOf(a.size)-sizeOrder.indexOf(b.size)
        : typeof a[key]==="number"?a[key]-b[key]:String(a[key]).localeCompare(String(b[key]));
      return (cmp||a.name.localeCompare(b.name))*(this.desc?-1:1);
    });
    this.page=Math.max(0,Math.min(this.page,Math.ceil(matches.length/this.pageSize)-1));
    this.root.innerHTML=shellHTML({...this,lines:this.lines,report:this.report,facets:facets(this.catalog.monsters),
      monsters:matches.slice(this.page*this.pageSize,(this.page+1)*this.pageSize),totalMatches:matches.length,entries:this.entries,
      ledgerHTML:this.tab==="health"?healthHTML(this.catalog,this.health):"",...this.campaignView()});
    for(const [key,top] of scrolls) this.root.querySelector(`[data-scroll="${key}"]`)?.scrollTo(0,top);
    if(focusName) {
      const input=[...this.root.querySelectorAll("[name]")].find(el=>el.name===focusName);
      input?.focus({preventScroll:true});if(input && selection)input.setSelectionRange(...selection);
    }
    this.paintPending=false;
  }

  error(error) {console.error(`${ID} |`,error);ui.notifications.error(error.message||String(error));}
  notify(message) {this.toast=message;clearTimeout(this.toastTimer);this.paint();this.toastTimer=setTimeout(()=>{this.toast="";this.paint();},4000);}

  async onClick(event) {
    const target=event.target.closest("[data-cf-action]");
    if(!target || target.disabled || !this.root.contains(target))return;
    event.preventDefault();event.stopPropagation();
    const action=target.dataset.cfAction,uuid=target.dataset.uuid,id=target.dataset.id;
    try {
      if(await this.handleCampaignAction(action,target))return;
      if(action==="tab-forge" || action==="tab-vault"){this.tab=action==="tab-forge"?"forge":"vault";this.paint();}
      else if(action==="tab-health"){this.tab="health";this.paint();await this.scanHealth(false);}
      else if(action==="audit-health")await this.scanHealth();
      else if(action==="health-section"){this.health.section=target.dataset.section;this.health.page=0;this.paint();}
      else if(action==="health-prev"||action==="health-next"){this.health.page+=action==="health-next"?1:-1;this.paint();}
      else if(action==="repair-monster")this.repairMonsterDialog(uuid);
      else if(action==="reset-correction"){await resetCorrection(uuid);this.closeDialog();await this.refreshAfterRepair();}
      else if(action==="restore-monster"){await setHidden(uuid,false);await this.refreshAfterRepair();}
      else if(action==="prefer-monster"){
        const group=this.catalog.duplicates.find(g=>g.items.some(r=>r.uuid===uuid));
        if(group){await preferDuplicate(group.items.map(r=>r.uuid),uuid);await this.refreshAfterRepair();}
      }
      else if(action==="replace-reference")this.replaceReferenceDialog(uuid);
      else if(action==="remove-replacement"){await removeReplacement(uuid);await this.refreshAfterRepair();}
      else if(action==="sort"){this.desc=this.sort===target.dataset.key?!this.desc:false;this.sort=target.dataset.key;this.page=0;this.paint();}
      else if(action==="add-monster" || action==="increment")this.addMonster(this.findMonster(uuid));
      else if(action==="decrement"){const line=this.lines.find(l=>l.monster.uuid===uuid);if(line?.quantity>1)line.quantity--;else this.lines=this.lines.filter(l=>l.monster.uuid!==uuid);this.changed();}
      else if(action==="remove-monster"){this.lines=this.lines.filter(l=>l.monster.uuid!==uuid);this.changed();}
      else if(action==="clear-encounter"){this.resetEncounter();this.changed();}
      else if(action==="remove-party"){this.partyUuids=this.partyUuids.filter(v=>v!==uuid);await this.syncParty();this.changed();}
      else if(action==="clear-party"){this.partyUuids=[];await this.syncParty();this.changed();}
      else if(action==="clear-filters"){this.filters={};this.page=0;this.paint();}
      else if(action==="next-page" || action==="previous-page"){this.page+=action==="next-page"?1:-1;this.paint();this.root.querySelector('[data-scroll="monsters"]')?.scrollTo(0,0);}
      else if(action==="refresh")await this.refreshCatalog();
      else if(action==="sheet"){const doc=await foundry.utils.fromUuid(resolveReplacement(uuid));if(!doc?.sheet)throw new Error("This actor is unavailable. Choose a replacement in the Bestiary Ledger.");doc.sheet.render({force:true});}
      else if(action==="choose-party")this.chooseParty();
      else if(action==="rules")this.rulesDialog();
      else if(action==="sources")this.sourcesDialog();
      else if(action==="generate")this.generateDialog();
      else if(action==="save")this.saveDialog();
      else if(action==="load")await this.loadEncounter(id);
      else if(action==="detail")this.detailDialog(id);
      else if(action==="delete-saved")this.deleteDialog(id);
      else if(action==="deploy-saved")this.deployDialog(this.entries.find(v=>v.id===id)?.data.lines);
      else if(action==="deploy")this.deployDialog(this.lines);
      else if(action==="explain")this.explainDialog();
      else if(action==="help")this.helpDialog();
      else if(action==="close-dialog"){this.repairContext=null;this.closeDialog();}
    } catch(error) {this.error(error);}
  }

  onInput(event) {
    const input=event.target;
    if(this.dialog?.contains(input))return;
    if(this.handleCampaignInput(input))return;
    if(input.name==="healthSearch") {
      this.health.search=input.value;this.health.page=0;
      clearTimeout(this.searchTimer);this.searchTimer=setTimeout(()=>this.paint(),140);return;
    }
    if(input.name==="search" || input.matches("input[data-filter]")) {
      this.filters[input.name]=input.value;this.page=0;
      clearTimeout(this.searchTimer);this.searchTimer=setTimeout(()=>this.paint(),140);
    }
  }
  onChange(event) {
    const input=event.target;
    if(this.dialog?.contains(input))return;
    if(this.handleCampaignChange(input))return;
    if(input.name==="healthFilter"||input.name==="healthPack"){
      this.health[input.name==="healthFilter"?"filter":"pack"]=input.value;this.health.page=0;this.paint();return;
    }
    if(input.matches("select[data-filter]")){this.filters[input.name]=input.value;this.page=0;this.paint();}
    if(input.dataset.quantity) {
      const line=this.lines.find(l=>l.monster.uuid===input.dataset.quantity);
      const q=Number(input.value);
      if(!Number.isInteger(q) || q<1 || this.report.count-(line?.quantity||0)+q>MAX_MONSTERS || this.totalMonsterCount-(line?.quantity||0)+q>500) {this.notify(`Use a whole quantity from 1 to ${MAX_MONSTERS}; each wave is capped at 100 and an encounter at 500.`);return;}
      if(line){line.quantity=q;this.changed();}
    }
  }

  addMonster(monster) {
    if(!monster)throw new Error("That creature is no longer in the catalogue. Re-index your sources.");
    if(this.report.count>=MAX_MONSTERS||this.totalMonsterCount>=500)throw new Error("Each wave supports at most 100 monsters; the whole encounter supports 500.");
    const line=this.lines.find(l=>l.monster.uuid===monster.uuid);
    if(line)line.quantity++;else this.lines.push({monster,quantity:1});
    this.changed();
  }

  async onDrop(event) {
    event.preventDefault();event.stopPropagation();this.root.classList.remove("cf-dragging");
    try {
      let data;try{data=JSON.parse(event.dataTransfer.getData("text/plain"));}catch{throw new Error("Drag an Actor from the sidebar, a compendium, or a token.");}
      if(data.type!=="Actor" || typeof data.uuid!=="string")throw new Error("Only Actor drops are supported.");
      const actor=await foundry.utils.fromUuid(data.uuid);
      if(actor?.type==="character") {
        if(!this.partyUuids.includes(actor.uuid))this.partyUuids.push(actor.uuid);
        await this.syncParty();this.changed();this.notify(`${actor.name} joined the party.`);
      } else {
        const record=await this.catalog.addActor(actor);
        if(!record.monster){this.tab="health";this.paint();this.repairMonsterDialog(record.uuid);}
        else {
          if(event.target.closest('[data-drop="encounter"]'))this.addMonster(record.monster);
          this.paint();this.notify(`${record.name} added to your bestiary.`);
        }
      }
    }catch(error){this.error(error);}
  }

  showDialog(title,body,onSubmit=null,{submit="Save",wide=false}={}) {
    this.closeDialog(false);
    const dialog=this.dialog;
    dialog.setAttribute("aria-label",title);
    dialog.classList.toggle("cf-dialog-wide",wide);
    dialog.innerHTML=`<form class="cf-dialog-form"><header><h2>${e(title)}</h2>${button("close-dialog","Close","xmark","class=\"cf-dialog-close\" aria-label=\"Close dialog\"")}</header><div class="cf-dialog-body">${body}<p class="cf-dialog-error cf-hidden" role="alert"></p></div><footer>${onSubmit?`<button type="submit" class="cf-primary">${icon("check")} ${e(submit)}</button>`:""}${button("close-dialog",onSubmit?"Cancel":"Close",null)}</footer></form>`;
    dialog.querySelector("form").addEventListener("input",()=>dialog.querySelector(".cf-dialog-error").classList.add("cf-hidden"));
    dialog.addEventListener("cancel",()=>{this.repairContext=null;queueMicrotask(()=>{if(this.paintPending)this.paint();});},{once:true});
    if(onSubmit)dialog.querySelector("form").addEventListener("submit",async event=> {
      event.preventDefault();
      if(this.busy)return;
      this.busy=true;const submitButton=dialog.querySelector('[type="submit"]');submitButton.disabled=true;
      try {await onSubmit(new FormData(event.target),dialog);}
      catch(error){const el=dialog.querySelector(".cf-dialog-error");el.textContent=error.message;el.classList.remove("cf-hidden");}
      finally {this.busy=false;submitButton.disabled=false;}
    });
    dialog.showModal();
    return dialog;
  }
  closeDialog(repaint=true) {if(this.dialog?.open)this.dialog.close();if(repaint&&this.paintPending)this.paint();}

  chooseParty() {
    const characters=[...game.actors].filter(a=>a.type==="character").map(normalizeCharacter).sort((a,b)=>a.name.localeCompare(b.name));
    const body=`<p>Choose the adventurers in this fight. Their health and resources update live.</p><div class="cf-roster">${characters.map(p=>`<label><input type="checkbox" name="party" value="${e(p.uuid)}" ${this.partyUuids.includes(p.uuid)?"checked":""}>${portrait(p.img,p.name)}<span><strong>${e(p.name)}</strong><small>Level ${p.level} · ${e(p.classes)} · ${p.hp}/${p.maxHP} HP</small></span></label>`).join("")||"<p>No character actors exist in this world yet. Create some in the Actors sidebar.</p>"}</div><small>You can also drop a character token or Actor into the party panel.</small>`;
    this.showDialog("Choose your party",body,async data=> {
      this.partyUuids=data.getAll("party");await this.syncParty();this.closeDialog();this.changed();
    },{submit:"Use this party"});
  }

  rulesDialog() {
    this.showDialog("Rules & difficulty",`
      ${select("edition","Encounter rules",["2014","2024"],this.rules.edition,null)}
      ${select("mode","Monster count rules",[{value:"official",label:"Official DMG"},{value:"swarm",label:"Adjusted swarms (house rule)"}],this.rules.mode,null)}
      <label class="cf-check"><input type="checkbox" name="dynamic" ${this.rules.dynamic?"checked":""}><span>Estimate difficulty from current party resources</span></label>
      <div class="cf-callout"><b>Official rules</b><p>2014 uses XP thresholds and monster-count multipliers, adjusted for party size. 2024 uses raw XP budget ceilings.</p><b>Adjusted swarms</b><p>Uses the 2014 multiplier ladder in either edition. Creatures worth less than 10% of the strongest creature's XP still add XP, but do not increase the monster count used for that multiplier. This is a house rule for groups of weaker enemies.</p><b>Live estimate</b><p>Scales each character's budget using HP, class-weighted spell slots, limited-use features, exhaustion, and incapacitation. Full-strength official budgets remain visible. These estimates cannot account for tactics or every class feature.</p></div>
      <label class="cf-check"><input type="checkbox" name="default"><span>Use these as the default for new drafts</span></label>`,async data=> {
      this.rules=rulesConfig({edition:data.get("edition"),mode:data.get("mode"),dynamic:data.has("dynamic")});
      if(data.has("default"))await game.settings.set(ID,"defaultRules",this.rules);
      this.closeDialog();this.changed();
    });
  }

  sourcesDialog() {
    const sources=game.settings.get(ID,"sources");
    const packs=actorPacks();
    const body=`<p>Read monsters from any installed D&D5e Actor compendium, including your own world compendiums. Source packs are never modified.</p>
    <label class="cf-check"><input name="auto" type="checkbox" ${sources.auto?"checked":""}><span><b>Automatically discover all Actor compendiums</b><small>Includes new packs when they become available.</small></span></label>
    <label class="cf-check"><input name="world" type="checkbox" ${sources.world?"checked":""}><span>Include NPC actors from this world</span></label>
    <div class="cf-source-list">${packs.map(pack=>`<label><input name="pack" type="checkbox" value="${e(pack.collection)}" ${sources.packs.includes(pack.collection)?"checked":""}><span><strong>${e(pack.metadata.label)}</strong><small>${e(pack.collection)}</small></span>${icon("book-open")}</label>`).join("")||"<p>No Actor compendiums are installed.</p>"}</div>
    <p class="cf-source-hint">When automatic discovery is off, only checked packs are indexed. Monsters need an NPC type and a valid CR. Missing edition and environment fields stay unknown.</p>
    <div class="cf-callout">${num(this.catalog.monsters.length)} indexed · ${num(this.catalog.skipped)} NPCs need CR repairs · ${num(this.catalog.issueCount)} need metadata. Open the Bestiary Ledger to review individual creatures, duplicates, and broken references.${this.catalog.errors.map(err=>`<p class="cf-text-high">${e(err.name)}: ${e(err.message)}</p>`).join("")}</div>
    <label class="cf-check"><input name="clearDrops" type="checkbox"><span>Forget manually dropped actor references (keeps the source actors)</span></label>`;
    const dialog=this.showDialog("Compendium sources",body,async data=> {
      await game.settings.set(ID,"sources",{auto:data.has("auto"),world:data.has("world"),packs:data.has("auto")?sources.packs:data.getAll("pack")});
      if(data.has("clearDrops"))await game.settings.set(ID,"homebrew",[]);
      this.closeDialog();await this.refreshCatalog();if(this.tab==="health")await this.scanHealth(false);this.notify("Bestiary refreshed from your sources.");
    },{submit:"Save & re-index",wide:true});
    const update=()=> {
      const auto=dialog.querySelector('[name="auto"]').checked;
      dialog.querySelectorAll('[name="pack"]').forEach(input=>{input.disabled=auto;input.closest("label").classList.toggle("cf-source-auto",auto);});
    };
    dialog.querySelector('[name="auto"]').addEventListener("change",update);update();
  }

  async scanHealth(refresh=true) {
    if(this.health.scanning)return;
    this.health.scanning=true;this.paint();
    try {
      if(refresh)await this.refreshCatalog();
      await this.catalog.auditReferences(this.entries,this.allLines);
    }finally {this.health.scanning=false;this.paint();}
  }

  async refreshAfterRepair() {
    await this.refreshCatalog();
    await this.catalog.auditReferences(this.entries,this.allLines);
    this.changed(this.dirty);this.notify("The Ledger has been updated. Source actors are unchanged.");
    if(this.repairContext)await this.encounterRepairDialog(this.repairContext);
  }

  repairMonsterDialog(uuid) {
    const record=this.catalog.byUuid.get(uuid);
    if(!record)throw new Error("That actor is not in the current scan. Scan the Ledger again or enable its source.");
    const m=record.description;
    const body=`<span class="cf-eyebrow">A MARGINAL NOTE, KEPT IN THIS WORLD</span><div class="cf-repair-title">${portrait(m.img,m.name)}<div><h3>${e(m.name)}</h3><small>${e(record.packLabel)}</small></div></div>
      <div class="cf-issue-list">${record.issues.map(i=>`<span class="cf-issue cf-issue-${i.severity}">${e(i.label)}</span>`).join("")||'<span class="cf-healthy">Metadata complete</span>'}</div>
      <div class="cf-field-grid"><label class="cf-field">Challenge rating<input name="cr" type="text" value="${m.cr===null?"":e(formatCR(m.cr))}" placeholder="e.g. 1/4 or 5" required><small>Source CR: ${e(record.originalCR??"missing")}. A correction changes builder XP, not the source stat block.</small></label>${select("edition","Edition",["2014","2024"],m.edition==="Unknown"?"":m.edition,"Unknown / use source")}</div>
      <label class="cf-field">Source book<input name="book" type="text" maxlength="180" value="${record.knownBook?e(m.book):""}" placeholder="${e(m.book)}"><small>A pack label is shown as a fallback until a book is supplied.</small></label>
      <label class="cf-field">Environments<input name="environments" type="text" value="${e(m.environments.join(", "))}" placeholder="Forest, Mountain, Urban"><small>Separate multiple environments with commas.</small></label>
      <div class="cf-field-grid"><label class="cf-field">Creature type<input name="type" type="text" maxlength="180" value="${m.type==="Unknown"?"":e(m.type)}" placeholder="e.g. Humanoid"></label>${select("size","Size",["Tiny","Small","Medium","Large","Huge","Gargantuan"],m.size==="Unknown"?"":m.size,"Unknown / use source")}</div>
      <label class="cf-check"><input type="checkbox" name="hidden" ${record.hidden?"checked":""}><span>Hide this copy from the bestiary and generator</span></label><div class="cf-callout">These corrections are saved in Combat Forge's world settings. They apply to browsing, filtering, balancing, and loading encounters. The source compendium, its artwork, and its stat blocks remain intact. Blank optional fields use the source data.</div>
      ${Object.keys(record.correction).length?button("reset-correction","Reset to source metadata","arrows-rotate",`data-uuid="${e(uuid)}" class="cf-reset-correction"`):""}`;
    this.showDialog(`Amend ${m.name}`,body,async data=> {
      await saveCorrection(uuid,{cr:data.get("cr"),book:data.get("book"),edition:data.get("edition"),environments:data.get("environments"),type:data.get("type"),size:data.get("size"),hidden:data.has("hidden")});
      this.closeDialog();await this.refreshAfterRepair();
    },{submit:"Save corrections",wide:true});
  }

  replaceReferenceDialog(uuid) {
    const reference=this.catalog.references.find(r=>r.uuid===uuid);
    if(!reference)throw new Error("That reference is no longer in the scan. Scan the Ledger again.");
    const pool=this.catalog.monsters.filter(m=>m.uuid!==uuid);
    const body=`<span class="cf-eyebrow">MEND A BROKEN REFERENCE</span><p>Choose the actor Combat Forge should use for <strong>${e(reference.name)}</strong> wherever this old reference appears. This is a world-wide module mapping; source packs and saved journals are not rewritten.</p><code class="cf-reference-uuid">${e(uuid)}</code><label class="cf-field">Find a replacement<input type="search" name="replacementSearch" placeholder="Search creature name, book, or source…" autocomplete="off"></label><label class="cf-field">Available NPCs<select name="replacement" size="7" required class="cf-replacement-options"></select><small class="cf-replacement-count"></small></label><div class="cf-callout">Replacement is explicit: similar names may represent different stat blocks or editions. Loading an encounter recalculates its difficulty using the chosen actor and your metadata corrections.</div>`;
    const dialog=this.showDialog("Choose replacement actor",body,async data=> {
      const selected=data.get("replacement");
      if(!pool.some(m=>m.uuid===selected))throw new Error("Choose an available creature from the list.");
      await saveReplacement(uuid,selected);this.closeDialog();await this.refreshAfterRepair();
    },{submit:"Use replacement",wide:true});
    const update=()=> {
      const search=dialog.querySelector('[name="replacementSearch"]').value.trim().toLowerCase();
      const matches=pool.filter(m=>`${m.name} ${m.book} ${m.packLabel}`.toLowerCase().includes(search));
      const options=dialog.querySelector('[name="replacement"]');
      const previous=options.value;
      options.innerHTML=matches.slice(0,100).map(m=>`<option value="${e(m.uuid)}">${e(m.name)} · CR ${formatCR(m.cr)} · ${e(m.edition)} · ${e(m.packLabel)}</option>`).join("");
      if(matches.some(m=>m.uuid===previous))options.value=previous;else options.selectedIndex=-1;
      dialog.querySelector(".cf-replacement-count").textContent=`Showing ${Math.min(matches.length,100)} of ${matches.length} matches. Search to narrow the list.`;
    };
    dialog.querySelector('[name="replacementSearch"]').addEventListener("input",update);update();
  }

  generateDialog() {
    const f=facets(this.catalog.monsters);
    const labels=this.rules.edition==="2014"?["Easy","Medium","Hard","Deadly"]:["Low","Moderate","High"];
    const body=`<span class="cf-eyebrow">LET THE DICE DO THE WORK</span>
      ${select("balance","Balance by",[{value:"difficulty",label:"Difficulty — balance against the party"},{value:"cr",label:"CR — combined challenge rating"}],"difficulty",null)}
      <div data-generation="difficulty">${select("difficulty",`${this.rules.edition} difficulty`,labels,this.rules.edition==="2014"?"Medium":"Moderate",null)}<small>Measured against ${this.rules.dynamic?"current":"full-strength"} party capacity, using ${this.rules.mode==="official"?"official DMG":"adjusted swarm"} rules.</small></div>
      <label data-generation="cr" class="cf-hidden cf-field">Total combined CR<input name="targetCR" type="number" min="0.125" max="3000" step="0.125" value="5"><small>Targets the sum of all creatures' CR, not the CR of each creature.</small></label>
      <div class="cf-field-grid"><label class="cf-field">Max monsters<input name="maxMonsters" type="number" min="1" max="100" value="6" required></label><label class="cf-field">Max species<input name="maxSpecies" type="number" min="1" max="100" value="2" required><small>Distinct stat blocks</small></label></div>
      ${["edition","type","size","environment","book"].map(k=>select(k,k==="type"?"Creature type":k[0].toUpperCase()+k.slice(1),f[k]||[],this.filters[k]||"")).join("")}
      <small>Search, alignment, legendary, source, and CR filters from the bestiary also apply. A generated encounter replaces the current draft's creatures.</small>`;
    const dialog=this.showDialog("Generate encounter",body,async data=> {
      const filters={...this.filters};
      for(const k of ["edition","type","size","environment","book"])filters[k]=data.get(k);
      // Yield once so the pressed button has an opportunity to paint before searching.
      await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
      const result=generateEncounter(this.catalog.monsters,this.party,{rules:this.rules,balance:data.get("balance"),difficulty:data.get("difficulty"),targetCR:data.get("targetCR"),maxMonsters:data.get("maxMonsters"),maxSpecies:data.get("maxSpecies"),filters});
      this.lines=result.lines;this.closeDialog();this.changed();this.notify(result.message);
    },{submit:"Generate encounter"});
    dialog.querySelector('[name="balance"]').addEventListener("change",event=>dialog.querySelectorAll("[data-generation]").forEach(el=>el.classList.toggle("cf-hidden",el.dataset.generation!==event.target.value)));
  }

  saveDialog() {return this.saveCampaignDialog();}
  async loadEncounter(id) {return this.loadCampaignEncounter(id);}
  detailDialog(id) {return this.campaignDetailDialog(id);}

  deleteDialog(id) {
    const entry=this.entries.find(v=>v.id===id);if(!entry)return;
    this.showDialog("Delete saved encounter",`<p>Delete <strong>${e(entry.name)}</strong> from the Vault? The actors and deployed tokens stay in your world.</p>`,async()=> {
      const journal=game.journal.get(id);
      if(journal?.getFlag(ID,"encounter"))await journal.delete();
      if(this.loadedId===id){this.loadedId=null;this.loadedName="";this.changed();}
      this.closeDialog();this.paint();this.notify("Encounter removed from the Vault.");
    },{submit:"Delete encounter"});
  }

  deployDialog(lines, options) {return this.campaignDeployDialog(lines, options);}

  explainDialog() {
    const r=this.report,labels=this.rules.edition==="2014"?["Easy","Medium","Hard","Deadly"]:["Low","Moderate","High"];
    this.showDialog("How difficulty is calculated",`<p><b>${this.rules.edition} ${this.rules.mode==="official"?"official DMG":"adjusted swarm house rule"}</b> · ${num(r.xp)} XP × ${r.multiplier} = <b>${num(r.adjustedXP)} adjusted XP</b>.</p>${r.ignored?`<p>${r.ignored} weaker creatures contribute XP but do not increase the swarm multiplier.</p>`:""}<table class="cf-explanation-table"><thead><tr><th>${this.rules.edition==="2014"?"Threshold":"Budget ceiling"}</th><th>Full</th><th>Current estimate</th></tr></thead><tbody>${labels.map((label,i)=>`<tr><th>${label}</th><td>${num(r.fullBudgets[i])}</td><td>${num(Math.round(r.currentBudgets[i]))}</td></tr>`).join("")}</tbody></table><h3>Current party capacity</h3><p>Each character contributes their level's budget multiplied by estimated readiness. HP depletion removes up to 60%; spell-slot depletion removes up to 30%, weighted by the character's spellcasting class levels; tracked resources remove up to 10%. Higher-level slots carry more weight. Exhaustion reduces the remainder by 8% per level, down to 40%. Unconscious, dead, petrified, incapacitated, or zero-HP characters contribute zero.</p><p>Missing resource data is treated as full. Other than inability to fight, readiness is bounded between 10% and 100%. Limited-use feat items and legacy character resources contribute to the resource estimate; tactics, magic-item power, and untracked features are outside this model.</p><div class="cf-callout">Dynamic capacity and swarm adjustment are optional house estimates. Choose Rules to show the full-strength official rating.</div>`);
  }

  helpDialog() {
    this.showDialog("Welcome to Combat Forge",`<span class="cf-eyebrow">BUILD A FIGHT. TELL A STORY.</span><ol class="cf-help-steps"><li><b>Choose your party.</b> Use the person button or drop character Actors onto the party panel.</li><li><b>Connect your bestiary.</b> The books button configures sources. All Actor packs are discovered automatically by default.</li><li><b>Forge an encounter.</b> Click creatures, adjust quantities, or use Generate. Open the eye button to inspect a stat block.</li><li><b>Watch the difficulty.</b> Full shows the rested party; Now estimates their current state. Click the rating for the math.</li><li><b>Keep it in the Vault.</b> Save a named encounter, then load, edit, inspect, or deploy it any time.</li><li><b>Deploy to the scene.</b> Choose your placement and whether to hide tokens or add them to combat.</li></ol><h3>Homebrew & metadata</h3><p>Drop a world or compendium NPC onto the monster list to keep a reference. Missing CR opens the Ledger repair form. The source Actor's creature type, size, source book/rules, alignment, habitat, and legendary resources power the filters. Use The Ledger to repair missing CR, book, edition, or environments; review duplicate copies; and replace broken saved references. Corrections stay in module world settings.</p><h3>Waves &amp; recommendations</h3><p>The wave selector keeps separate creature groups, arrival notes, and deployment controls. Save stores every wave. The Vault supports search, folders, tags, notes, and JSON files; missing actors open a repair dialog. Recommended builds party-based encounter plans from your enabled bestiary.</p><p>Press <kbd>/</kbd> in this window to search. Focus a creature row and press Enter or Space to add it.</p><small>Combat Forge 1.2.1 · Foundry VTT 14 · D&D5e · No monster content is bundled.</small>`);
  }
}

installCampaignFeatures(ForgeController);

export class CombatForge extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id:"combat-forge",tag:"div",classes:["combat-forge-window"],
    window:{title:"Combat Forge",icon:"fa-solid fa-hammer",resizable:true,minimizable:true},
    position:{width:1240,height:820},
  };
  async _renderHTML() {const root=document.createElement("div");root.className="cf-root";return root;}
  _replaceHTML(result,content) {content.replaceChildren(result);}
  _onRender(context,options) {
    super._onRender(context,options);
    this.controller?.destroy();
    this.controller=new ForgeController(this.element.querySelector(".cf-root"));
    this.controller.onMinimize=()=>this.minimize();this.controller.onMaximize=()=>this.maximize();
    this.controller.mount().catch(error=>this.controller.error(error));
  }
  async close(options) {this.controller?.destroy();return super.close(options);}
}
