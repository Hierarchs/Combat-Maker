import { chromium } from "playwright";
import { startPreview } from "./preview.mjs";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

const server=await startPreview(0);const port=server.address().port;
let browser;
try {
  browser=await chromium.launch({channel:process.env.CF_BROWSER_CHANNEL||"chrome",headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:940},deviceScaleFactor:1});
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForSelector(".cf-monster-table tbody tr");
  assert.equal(await page.locator(".cf-monster-table tbody tr").count(),26);
  assert.equal(await page.locator(".cf-party-row").count(),3);
  const action=name=>page.locator(`[data-cf-action="${name}"]`).filter({visible:true}).first();
  // Rows and controls, searching, keyboard, and independent filter resets.
  await page.getByRole("button",{name:"Add Aberrant Cultist to encounter",exact:true}).click();
  assert.equal(await page.locator(".cf-encounter-row").count(),1);
  await page.locator('.cf-stepper [data-cf-action="increment"]').click();
  assert.equal(await page.locator("[data-quantity]").inputValue(),"2");
  await page.locator('[name="search"]').fill("Goblin");
  await page.waitForFunction(()=>document.querySelectorAll(".cf-monster-table tbody tr").length===3);
  await action("clear-filters").click();
  await page.locator('[data-filter][name="type"]').selectOption("Giant");
  assert.equal(await page.locator(".cf-monster-table tbody tr").count(),2);
  await action("clear-filters").click();
  // Choose party and change rules in modal; verifies focus trapping and form submission.
  await action("choose-party").click();
  await page.locator('.cf-dialog [name="party"][value="Actor.theo"]').check();
  await page.getByRole("button",{name:"Use this party",exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll(".cf-party-row").length===4);
  await action("rules").click();
  await page.locator('.cf-dialog [name="edition"]').selectOption("2014");
  await page.getByRole("button",{name:"Save",exact:true}).last().click();
  await page.waitForFunction(()=>document.querySelector(".cf-difficulty-top").textContent.includes("2014"));
  // Generate by total CR with strict constraints, save, and inspect Vault.
  await action("generate").click();
  await page.locator('.cf-dialog [name="balance"]').selectOption("cr");
  await page.locator('.cf-dialog [name="targetCR"]').fill("4");
  await page.locator('.cf-dialog [name="maxSpecies"]').fill("1");
  await page.getByRole("button",{name:"Generate encounter",exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector(".cf-dialog").open);
  assert.equal(await page.locator(".cf-encounter-row").count(),1);
  await action("save").click();await page.locator('.cf-dialog [name="name"]').fill("The Crooked Crossing");
  await page.getByRole("button",{name:"Save to Vault",exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector(".cf-dialog").open);
  await action("tab-vault").click();assert.equal(await page.locator(".cf-vault-card").count(),1);
  await page.locator(".cf-card-title").click();await page.waitForSelector(".cf-detail-stats");
  await page.locator(".cf-dialog").getByRole("button",{name:"Load into Forge",exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector(".cf-dialog").open);
  assert.match(await page.locator(".cf-loaded").innerText(),/The Crooked Crossing/);
  // Edit saved quantities, preserving the journal identity rather than making duplicates.
  await page.locator('[data-quantity]').fill("3");await page.locator('[data-quantity]').press("Tab");
  await action("save").click();await page.getByRole("button",{name:"Save encounter",exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector(".cf-dialog").open);
  assert.equal(await page.evaluate(()=>game.journal.size),1);
  assert.equal(await page.evaluate(()=>game.settings.get("combat-maker","draft").dirty),false);
  // Deploy through the actual controller, using a mock scene adapter.
  await action("deploy").click();await page.locator('.cf-dialog [name="combat"]').check();
  await page.getByRole("button",{name:"Deploy monsters",exact:true}).click();
  await page.waitForFunction(()=>canvas.scene.tokens.size===3);
  assert.equal(await page.evaluate(()=>game.combats.size),1);
  // Point placement can be cancelled and restores the module without creating tokens.
  await action("deploy").click();await page.locator('.cf-dialog [name="placement"]').selectOption("click");
  await page.getByRole("button",{name:"Deploy monsters",exact:true}).click();
  await page.waitForFunction(()=>document.getElementById("mock-scene").style.cursor==="crosshair");
  await page.keyboard.press("Escape");
  await page.waitForFunction(()=>document.querySelector(".combat-forge-window").style.visibility==="visible");
  assert.equal(await page.evaluate(()=>canvas.scene.tokens.size),3);
  // Homebrew drop and names with markup must be escaped.
  await page.evaluate(async()=> {
    const {npc}=await import("/tests/fixtures/foundry.mjs");
    const actor=npc("homebrew",'<img src=x onerror="window.injected=1">',2);preview.ctx.decorate(actor);
    const transfer=new DataTransfer();transfer.setData("text/plain",JSON.stringify({type:"Actor",uuid:actor.uuid}));
    document.querySelector(".cf-browser").dispatchEvent(new DragEvent("drop",{dataTransfer:transfer,bubbles:true,cancelable:true}));
  });
  await page.waitForFunction(()=>game.settings.get("combat-maker","homebrew").length===1);
  assert.equal(await page.evaluate(()=>window.injected),undefined);
  // Source configuration includes manual packs and can be applied without losing catalogue actors.
  await action("sources").click();await page.locator('.cf-dialog [name="auto"]').uncheck();
  await page.locator('.cf-dialog [name="pack"]').check();
  await page.getByRole("button",{name:"Save & re-index",exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector(".cf-dialog").open);
  // Put the verified preview into a clean representative encounter for visual QA.
  await page.evaluate(async()=> {
    const c=preview.app.controller;
    await game.settings.set("combat-maker","homebrew",[]);await c.refreshCatalog();
    c.rules={edition:"2024",mode:"official",dynamic:true};c.toast="";
    c.lines=["Basilisk","Troll"].map(name=>({monster:c.catalog.monsters.find(m=>m.name===name),quantity:1}));
    c.loadedName="The Crooked Crossing";c.dirty=false;c.paint();
    const {saveEncounter}=await import("/scripts/vault.mjs");
    await saveEncounter("The Crooked Crossing",c.snapshot(),c.loadedId);
    const more={...c.snapshot(),lines:[{monster:c.catalog.monsters.find(m=>m.name==="Skeleton"),quantity:6},{monster:c.catalog.monsters.find(m=>m.name==="Bugbear"),quantity:2}]};
    const {assessEncounter}=await import("/scripts/difficulty.mjs");more.report=assessEncounter(more.lines,c.party,c.rules);
    await saveEncounter("Beneath the Old Mill",more);c.paint();
    document.querySelectorAll(".mock-notification").forEach(el=>el.remove());
  });
  // Exercise an exact 1080×650 viewport and check controls remain in the frame.
  await page.setViewportSize({width:1080,height:650});
  const layout=await page.evaluate(()=> {
    const root=document.querySelector(".cf-root"),deploy=document.querySelector(".cf-deploy"),footer=document.querySelector(".cf-browser-footer");
    const bounds=root.getBoundingClientRect();return {overflow:root.scrollWidth>root.clientWidth,deploy:deploy.getBoundingClientRect().bottom<=bounds.bottom+1,footer:footer.getBoundingClientRect().bottom<=bounds.bottom+1};
  });
  assert.deepEqual(layout,{overflow:false,deploy:true,footer:true});
  await mkdir("test-results",{recursive:true});
  await page.screenshot({path:"test-results/forge-compact.png"});
  await page.setViewportSize({width:1440,height:940});
  await page.evaluate(()=>{preview.app.controller.toast="";preview.app.controller.paint();});
  await page.screenshot({path:"test-results/forge.png"});
  await action("generate").click();await page.screenshot({path:"test-results/generator.png"});await page.keyboard.press("Escape");
  await action("tab-vault").click();await page.screenshot({path:"test-results/vault.png"});
  assert.deepEqual(errors,[]);
  process.stdout.write("Browser checks passed: filtering, party, rules, generation, save/load/edit, deployment, source configuration, homebrew drop, escaping, and compact layout.\n");
}finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
