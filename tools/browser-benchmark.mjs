import { chromium } from "playwright";
import { startPreview } from "./preview.mjs";
import { mkdir, writeFile } from "node:fs/promises";
const server=await startPreview(0);let browser;
try{
  browser=await chromium.launch({channel:process.env.CF_BROWSER_CHANNEL||"chrome",headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:940}});
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForSelector(".cf-monster-table tbody tr");
  const report=await page.evaluate(async()=>{
    const c=preview.app.controller,{npc}=await import("/tests/fixtures/foundry.mjs");
    for(let i=0;i<10000;i++)c.catalog.record(npc(`bench${i}`,`Creature ${i}`,1));c.catalog.finish();
    const data={schema:1,lines:[{monster:c.catalog.monsters[0],quantity:2}],party:c.party,rules:c.rules};
    for(let i=0;i<500;i++)await JournalEntry.create({name:`Encounter ${i}`,flags:{"combat-maker":{encounter:{...data,updatedAt:i}}}});
    const cases=[];
    for(const tab of ["forge","vault","health"]){
      c.tab=tab;c.paint();const times=[];
      for(let i=0;i<25;i++){const start=performance.now();c.paint();void c.root.offsetHeight;times.push(performance.now()-start);}
      times.sort((a,b)=>a-b);cases.push({tab,medianMs:+times[12].toFixed(2),p95Ms:+times[23].toFixed(2)});
    }
    return {catalogue:c.catalog.monsters.length,vault:game.journal.size,cases};
  });
  console.log(JSON.stringify(report,null,2));
  if(process.argv[2]){await mkdir("test-results",{recursive:true});await writeFile(process.argv[2],JSON.stringify(report,null,2)+"\n");}
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
