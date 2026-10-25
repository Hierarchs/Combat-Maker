import assert from "node:assert/strict";

export async function checkOptimizationsUI(page){
  const result=await page.evaluate(async()=>{
    const c=preview.app.controller,{npc,character}=await import("/tests/fixtures/foundry.mjs");
    for(let i=0;i<100;i++)c.catalog.record(npc(`cache${i}`,`Cached creature ${String(i).padStart(3,"0")}`,1));c.catalog.finish();
    c.paint();const browser=c.root.querySelector(".cf-browser"),row=browser.querySelector("tbody tr"),query=c.matchingMonsters();
    c.lines=[{monster:c.catalog.monsters[0],quantity:1}];c.changed();
    const retained=browser===c.root.querySelector(".cf-browser")&&row===c.root.querySelector("tbody tr")&&query===c.matchingMonsters();
    const search=c.root.querySelector('[name="search"]');search.focus();search.setSelectionRange(0,0);
    c.paint();const focusKept=document.activeElement===search;
    c.page=1;c.paint();const nextPageRebuilt=browser!==c.root.querySelector(".cf-browser");
    c.root.querySelector('[data-scroll="monsters"]').scrollTop=100;
    c.tab="vault";c.paint();const inactiveRows=c.root.querySelectorAll(".cf-monster-table tbody tr").length;
    c.tab="forge";c.paint();const positionKept=c.page===1&&c.root.querySelector('[data-scroll="monsters"]').scrollTop===100;
    c.filters={search:"Cached creature 042"};c.paint();const filtered=c.root.querySelectorAll("tbody tr").length===1&&c.root.querySelector("tbody").textContent.includes("042");
    const actor=npc("cache42","Renamed creature",3);c.catalog.record(actor);c.catalog.finish();c.paint();
    c.filters={search:"Renamed creature"};c.paint();const refreshed=c.root.querySelectorAll("tbody tr").length===1&&c.root.querySelector("tbody").textContent.includes("Renamed");
    const journal=await JournalEntry.create({name:"Cache check",flags:{"combat-maker":{encounter:c.snapshot()}}});
    const saved=c.entries.find(e=>e.id===journal.id);journal.flags["combat-maker"].encounter.waves[0].lines[0].quantity=3;
    Hooks.callAll("updateJournalEntry",journal,{"flags.combat-maker.encounter":journal.flags["combat-maker"].encounter});
    const invalidated=c.entries.find(e=>e.id===journal.id).data.report.count===3&&saved.data.report.count===1;
    delete journal.flags["combat-maker"].encounter;Hooks.callAll("updateJournalEntry",journal,{"flags.combat-maker.-=encounter":null});
    const removed=!c.entries.some(e=>e.id===journal.id);await journal.delete();
    globalThis.optimizationCheck={c,counts:{party:0,catalog:0},refreshParty:c.refreshParty,refreshCatalog:c.refreshCatalog};
    c.refreshParty=async()=>{optimizationCheck.counts.party++;};c.refreshCatalog=async()=>{optimizationCheck.counts.catalog++;};
    const other=character("unselected"),nonparty=npc("notSelected");
    Hooks.callAll("updateActor",nonparty,{"system.attributes.hp.value":1});
    Hooks.callAll("updateActor",other,{"system.attributes.hp.value":1});
    Hooks.callAll("createItem",{parent:other});
    Hooks.callAll("updateToken",{actor:game.actors.get("avel")},{x:100,y:200});
    Hooks.callAll("updateCompendium",{documentName:"Item"});
    return {retained,focusKept,nextPageRebuilt,inactiveRows,positionKept,filtered,refreshed,invalidated,removed};
  });
  for(const key of ["retained","focusKept","nextPageRebuilt","positionKept","filtered","refreshed","invalidated","removed"])assert.equal(result[key],true,key);
  assert.equal(result.inactiveRows,0);
  await page.waitForTimeout(750);
  assert.deepEqual(await page.evaluate(()=>optimizationCheck.counts),{party:0,catalog:0});
  await page.evaluate(()=>{
    Hooks.callAll("updateActor",game.actors.get("avel"),{"system.attributes.hp.value":1});
    Hooks.callAll("updateItem",{parent:game.actors.get("avel")},{"system.uses.spent":1});
    Hooks.callAll("updateActor",{type:"npc",uuid:"Actor.metadata"},{"system.details.cr":2});
  });
  await page.waitForTimeout(750);
  assert.deepEqual(await page.evaluate(()=>optimizationCheck.counts),{party:1,catalog:1});
  await page.evaluate(async()=>{
    const {c,refreshParty,refreshCatalog}=optimizationCheck;c.refreshParty=refreshParty;c.refreshCatalog=refreshCatalog;
    c.lines=[];c.filters={};c.page=0;c.tab="forge";await c.refreshCatalog();c.changed(false);delete globalThis.optimizationCheck;
  });
}
