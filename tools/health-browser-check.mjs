import assert from "node:assert/strict";

export async function checkHealthUI(page) {
  const seeded=await page.evaluate(async()=> {
    const {npc}=await import("/tests/fixtures/foundry.mjs");
    const {normalizeMonster}=await import("/scripts/normalize.mjs");
    const {saveEncounter}=await import("/scripts/vault.mjs");
    const pack=game.packs.contents[0];
    const create=(id,name,cr)=> {
      const actor=npc(id,name,cr);actor.uuid=pack.getUuid(id);actor.pack=pack.collection;actor.inCompendium=true;
      preview.bestiary.push(actor);preview.ctx.decorate(actor);return actor;
    };
    const missing=create("ledgerMissing","Ashen Sentinel",null);delete missing.system.source;delete missing.system.details.habitat;
    const duplicate=create("ledgerDuplicate","Goblin",0.25);duplicate.system.source={book:"MM",rules:"2014"};
    const book=create("ledgerBook","Barrow Warden",3);delete book.system.source;
    const environment=create("ledgerHabitat","Cinder Moth",0.5);delete environment.system.details.habitat;
    const original=preview.bestiary.find(m=>m.name==="Goblin"&&m.id!==duplicate.id);
    const lost={monster:{...normalizeMonster(original),uuid:"Compendium.removed.creatures.Actor.lost",name:"Lost Watchman"},quantity:1};
    const c=preview.app.controller;
    const journal=await saveEncounter("The Lost Watch",{...c.snapshot(),waves:[{id:"lost-wave",name:"Lost watch",lines:[lost]}]});
    await c.refreshCatalog();
    return {missing:missing.uuid,duplicate:duplicate.uuid,original:original.uuid,journalId:journal.id,old:lost.monster.uuid};
  });
  const action=name=>page.locator(`[data-cf-action="${name}"]`).filter({visible:true}).first();
  await action("tab-health").click();
  await page.waitForFunction(()=>!preview.app.controller.health.scanning);
  const row=page.locator(`[data-health-uuid="${seeded.missing}"]`);
  assert.equal(await row.locator(".cf-issue").count(),4);
  await page.evaluate(()=>{preview.app.controller.toast="";preview.app.controller.paint();document.querySelectorAll(".mock-notification").forEach(el=>el.remove());});
  await page.screenshot({path:"test-results/ledger.png"});
  await row.getByRole("button",{name:"Edit",exact:true}).click();
  await page.locator('.cf-dialog [name="cr"]').fill("1/3");
  await page.getByRole("button",{name:"Save corrections",exact:true}).click();
  await page.waitForSelector(".cf-dialog-error:not(.cf-hidden)");
  assert.match(await page.locator(".cf-dialog-error").innerText(),/valid CR/);
  await page.locator('.cf-dialog [name="cr"]').fill("2");
  await page.locator('.cf-dialog [name="book"]').fill("The Sentinel Folio");
  await page.locator('.cf-dialog [name="edition"]').selectOption("2024");
  await page.locator('.cf-dialog [name="environments"]').fill("Forest, Swamp");
  await page.screenshot({path:"test-results/metadata-repair.png"});
  await page.getByRole("button",{name:"Save corrections",exact:true}).click();
  await page.waitForFunction(uuid=>preview.app.controller.catalog.byUuid.get(uuid)?.issues.length===0,seeded.missing);
  const repaired=await page.evaluate(uuid=> {
    const c=preview.app.controller,record=c.catalog.byUuid.get(uuid),source=preview.ctx.docs.get(uuid);
    return {cr:record.monster.cr,xp:record.monster.xp,sourceCR:source.system.details.cr,sourceBook:source.system.source?.book};
  },seeded.missing);
  assert.deepEqual(repaired,{cr:2,xp:450,sourceCR:null,sourceBook:undefined});
  await page.locator('[name="healthFilter"]').selectOption("corrected");
  assert.equal(await page.locator("[data-health-uuid]").count(),1);
  await action("audit-health").click();await page.waitForFunction(()=>!preview.app.controller.health.scanning);
  assert.equal(await page.locator("[data-health-uuid]").count(),1);
  // The edit dialog can discard local corrections and reveal the untouched source again.
  await page.locator(`[data-health-uuid="${seeded.missing}"]`).getByRole("button",{name:"Edit",exact:true}).click();
  await page.getByRole("button",{name:"Reset to source metadata",exact:true}).click();
  await page.waitForFunction(uuid=>!preview.app.controller.catalog.byUuid.get(uuid)?.monster,seeded.missing);
  await page.locator('[name="healthFilter"]').selectOption("issues");
  assert.equal(await page.locator(`[data-health-uuid="${seeded.missing}"] .cf-issue`).count(),4);
  // Duplicate preferences are explicit and only affect module visibility.
  await page.locator('[data-cf-action="health-section"][data-section="duplicates"]').click();
  const preferred=page.locator(`[data-cf-action="prefer-monster"][data-uuid="${seeded.original}"]`);
  await preferred.click();
  await page.waitForFunction(uuid=>preview.app.controller.catalog.byUuid.get(uuid)?.hidden,seeded.duplicate);
  assert.ok(await page.locator(".cf-duplicate-card").innerText().then(t=>t.includes("Preference applied")));
  await page.locator('[data-cf-action="health-section"][data-section="hidden"]').click();
  await page.locator(`[data-cf-action="restore-monster"][data-uuid="${seeded.duplicate}"]`).click();
  await page.waitForFunction(uuid=>!preview.app.controller.catalog.byUuid.get(uuid)?.hidden,seeded.duplicate);
  // Repair a missing saved actor, then load and deploy that saved encounter.
  await page.locator('[data-cf-action="health-section"][data-section="references"]').click();
  await page.locator(`[data-cf-action="replace-reference"][data-uuid="${seeded.old}"]`).click();
  await page.locator('.cf-dialog [name="replacementSearch"]').fill("Goblin");
  await page.locator('.cf-dialog [name="replacement"]').selectOption(seeded.original);
  await page.getByRole("button",{name:"Use replacement",exact:true}).click();
  await page.waitForFunction(uuid=>preview.app.controller.catalog.references.find(r=>r.uuid===uuid)?.status==="mapped",seeded.old);
  await action("tab-vault").click();
  await page.getByRole("button",{name:"The Lost Watch",exact:true}).click();
  await page.locator(".cf-dialog").getByRole("button",{name:"Load into Forge",exact:true}).click();
  await page.waitForFunction(uuid=>preview.app.controller.lines[0]?.monster.uuid===uuid,seeded.original);
  await action("deploy").click();await page.getByRole("button",{name:"Deploy monsters",exact:true}).click();
  await page.waitForFunction(()=>canvas.scene.tokens.size===4);
  assert.equal(await page.evaluate(()=>canvas.scene.tokens.contents.at(-1).name),"Goblin");
  await action("tab-health").click();await page.waitForFunction(()=>!preview.app.controller.health.scanning);
  await page.locator('[data-cf-action="health-section"][data-section="references"]').click();
  await page.locator(`[data-cf-action="remove-replacement"][data-uuid="${seeded.old}"]`).click();
  await page.waitForFunction(uuid=>preview.app.controller.catalog.references.find(r=>r.uuid===uuid)?.status==="missing",seeded.old);
  // Verify the Ledger fits the same compact window as the Forge.
  await page.setViewportSize({width:1080,height:650});
  const fits=await page.evaluate(()=> {
    const root=document.querySelector(".cf-root"),ledger=document.querySelector(".cf-ledger");
    return ledger.scrollWidth<=ledger.clientWidth&&document.querySelector(".cf-ledger-footer").getBoundingClientRect().bottom<=root.getBoundingClientRect().bottom+1;
  });
  assert.equal(fits,true);
  await page.setViewportSize({width:1440,height:940});
  // Remove development test records without touching production code or source files.
  await page.evaluate(async seeded=> {
    const {resetCorrection}=await import("/scripts/repairs.mjs");
    await resetCorrection(seeded.missing);await resetCorrection(seeded.duplicate);
    for(let i=preview.bestiary.length-1;i>=0;i--)if(preview.bestiary[i].id.startsWith("ledger")){preview.ctx.docs.delete(preview.bestiary[i].uuid);preview.bestiary.splice(i,1);}
    await game.journal.get(seeded.journalId).delete();
    const testFight=game.journal.find(j=>j.name==="The Crooked Crossing");
    const c=preview.app.controller;c.resetEncounter();c.tab="forge";c.toast="";c.health={section:"metadata",filter:"issues",search:"",pack:"",page:0,scanning:false};await c.refreshCatalog();c.paint();
    if(testFight)c.loadedId=testFight.id;
  },seeded);
}
