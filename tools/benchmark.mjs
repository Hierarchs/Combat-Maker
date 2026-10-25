import { performance } from "node:perf_hooks";
import { writeFile, mkdir } from "node:fs/promises";
import { installFoundry, npc, character } from "../tests/fixtures/foundry.mjs";
import { MonsterCatalog } from "../scripts/catalog.mjs";
import { facets, normalizeCharacter } from "../scripts/normalize.mjs";
import { vaultEntries } from "../scripts/vault.mjs";
import { generateEncounter } from "../scripts/generator.mjs";
import { planPlacement } from "../scripts/deploy.mjs";

const {settings}=installFoundry();
const catalog=new MonsterCatalog();
const crs=[0.125,0.25,0.5,1,2,3,4,5,6,7,8,9,10,12,15,20];
for(let i=0;i<10000;i++)catalog.record(npc(`m${i}`,`Creature ${i%2500}`,crs[i%crs.length]));
catalog.finish();
const party=Array.from({length:4},(_,i)=>normalizeCharacter(character(`p${i}`)));
const raw={schema:2,waves:Array.from({length:3},(_,i)=>({id:`wave${i}`,name:`Wave ${i}`,lines:catalog.monsters.slice(i*5,i*5+5).map(monster=>({monster,quantity:2}))})),party,rules:{edition:"2024",mode:"official",dynamic:false},tags:["Forest"],notes:"Ambush at the old crossing"};
for(let i=0;i<500;i++)await JournalEntry.create({name:`Encounter ${i}`,flags:{"combat-maker":{encounter:{...structuredClone(raw),updatedAt:i}}}});
function seeded(seed=71){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const measure=(name,fn)=>{
  fn();const times=[];for(let i=0;i<7;i++){const start=performance.now();fn();times.push(performance.now()-start);}
  times.sort((a,b)=>a-b);return {name,medianMs:+times[3].toFixed(3),p95Ms:+times[6].toFixed(3)};
};
const cases=[
  measure("catalogue summaries: 10,000 NPCs, 10 reads",()=>{for(let i=0;i<10;i++){void catalog.duplicates;void catalog.issueCount;void (catalog.facets??facets(catalog.monsters));}}),
  measure("warm Vault: 500 encounters, 10 reads",()=>{for(let i=0;i<10;i++)vaultEntries();}),
  measure("generator: 10,000 NPCs, CR 9.3, 60 monsters / 4 species",()=>generateEncounter(catalog.monsters,party,{balance:"cr",targetCR:9.3,maxMonsters:60,maxSpecies:4},seeded())),
  measure("generator: unreachable CR 20, 10,000 CR 1/8 NPCs, 60 monsters / 4 species",()=>generateEncounter(catalog.monsters.map(m=>({...m,cr:0.125})),party,{balance:"cr",targetCR:20,maxMonsters:60,maxSpecies:4},seeded())),
  measure("placement: 100 tokens, 900 occupied footprints",()=>planPlacement(Array.from({length:100},()=>({width:1,height:1})),{origin:{x:5000,y:5000},bounds:{x:0,y:0,width:12000,height:12000},gridSize:100,occupied:Array.from({length:900},(_,i)=>({x:3500+(i%30)*100,y:3500+Math.floor(i/30)*100,width:100,height:100}))}))
];
const report={node:process.version,catalogue:catalog.monsters.length,vault:game.journal.size,settings:settings.size,cases};
console.log(JSON.stringify(report,null,2));
if(process.argv[2]){await mkdir("test-results",{recursive:true});await writeFile(process.argv[2],JSON.stringify(report,null,2)+"\n");}
