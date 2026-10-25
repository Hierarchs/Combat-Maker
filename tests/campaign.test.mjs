import test from "node:test";
import assert from "node:assert/strict";
import { installFoundry, npc, character } from "./fixtures/foundry.mjs";
import { normalizeMonster, normalizeCharacter } from "../scripts/normalize.mjs";
import { normalizeEncounter, summarizeWaves, flattenWaves, parseTags, filterVault, exportVault, parseVaultImport } from "../scripts/encounters.mjs";
import { vaultEntries, saveEncounter, importVault, createVaultFolder, renameVaultFolder, deleteVaultFolder, vaultFolders } from "../scripts/vault.mjs";
import { deployEncounter } from "../scripts/deploy.mjs";
import { recommendEncounters, rankSavedEncounters } from "../scripts/recommendations.mjs";

const party=()=>Array.from({length:4},(_,i)=>normalizeCharacter(character(`pc${i}`,`Hero ${i}`,5)));
const line=(cr=1,quantity=1,id=`npc${cr}`)=>({monster:normalizeMonster(npc(id,`Creature ${cr}`,cr)),quantity});
const legacy=()=>({schema:1,lines:[line()],party:party(),rules:{edition:"2024",mode:"official",dynamic:false}});
const sequence=()=>({schema:2,waves:[{id:"front",name:"Advance guard",trigger:"Opening",notes:"Hold the bridge.",lines:[line(1,2)]},{id:"support",name:"Reinforcements",trigger:"Round 3",notes:"Arrive from the north.",lines:[line(4)]}],party:party(),rules:{edition:"2024",mode:"official",dynamic:false},tags:["Forest","Patrol"],folder:"Chapter One",notes:"Protect the messenger."});
function seeded(seed=7){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}

test("legacy encounters migrate to one wave in memory without mutating old data",()=>{
  const old=legacy(),copy=structuredClone(old),data=normalizeEncounter(old);
  assert.equal(data.schema,2);assert.equal(data.waves.length,1);assert.deepEqual(old,copy);assert.equal(data.lines[0].quantity,1);
});
test("wave summaries count every monster while rating the peak wave separately",()=>{
  const data=normalizeEncounter(sequence());assert.equal(data.report.count,3);assert.equal(data.report.xp,1500);assert.equal(data.report.waveCount,2);
  assert.equal(data.report.waves[0].count,2);assert.equal(data.report.waves[1].count,1);assert.equal(data.report.peakWave,"Reinforcements");
  const waves=[{id:"a",name:"One",lines:[line(4,2)]},{id:"b",name:"Two",lines:[line(4,2)]}];
  const report=summarizeWaves(waves,party(),data.rules);assert.equal(report.count,4);assert.equal(report.shown.label,"Moderate");assert.equal(report.xp,4400);
  assert.equal(flattenWaves(waves)[0].quantity,4);
});
test("validation enforces wave IDs, limits, metadata bounds, and safe party snapshots",()=>{
  const data=sequence();data.waves[1].id=data.waves[0].id;assert.throws(()=>normalizeEncounter(data),/unique ID/);
  assert.throws(()=>normalizeEncounter({...sequence(),waves:Array.from({length:11},(_,i)=>({id:String(i),lines:[]}))}),/between 1 and 10/);
  assert.throws(()=>normalizeEncounter({...sequence(),waves:[{id:"a",lines:[line(1,101)]}]}),/at most 100/);
  assert.throws(()=>normalizeEncounter({...sequence(),waves:Array.from({length:6},(_,i)=>({id:String(i),lines:[line(1,100)]}))}),/at most 500/);
  assert.throws(()=>normalizeEncounter({...sequence(),notes:"x".repeat(20001)}),/20,000/);
  assert.throws(()=>normalizeEncounter({...sequence(),rules:{edition:"2024",dynamic:"false"}}),/boolean/);
  assert.throws(()=>normalizeEncounter({...sequence(),folder:"*"}),/Folder names/);
  assert.deepEqual(parseTags("Boss, boss, Forest"),["boss","Forest"]);
  assert.throws(()=>parseTags(Array(21).fill("x")),/20 tags/);
});
test("Vault search includes notes, wave triggers, creatures and tags, with folder/tag intersections",()=>{
  const first={id:"a",name:"The Crossing",data:normalizeEncounter(sequence())},second={id:"b",name:"Another fight",data:normalizeEncounter({...legacy(),notes:"A quiet garden"})};
  assert.deepEqual(filterVault([first,second],{search:"messenger round",folder:"Chapter One",tag:"forest"}).map(e=>e.id),["a"]);
  assert.deepEqual(filterVault([first,second],{search:"garden"}).map(e=>e.id),["b"]);
  assert.equal(filterVault([first,second],{folder:"",tag:"Forest"}).length,0);
});
test("JSON round trips complete waves and notes and rejects malformed files before writing",()=>{
  const entries=[{name:"A portable encounter",data:normalizeEncounter(sequence())}],text=exportVault(entries),parsed=parseVaultImport(text);
  assert.equal(parsed[0].data.waves[1].trigger,"Round 3");assert.equal(parsed[0].data.notes,"Protect the messenger.");assert.equal(parsed[0].data.folder,"Chapter One");
  assert.throws(()=>parseVaultImport("<script>bad</script>"),/valid JSON/);
  assert.throws(()=>parseVaultImport(JSON.stringify({format:"combat-forge-vault",version:99,encounters:[]})),/Vault export/);
  assert.throws(()=>parseVaultImport("x".repeat(5*1024*1024+1)),/5 MB/);
  const file=JSON.parse(text);file.encounters[0].data.waves[0].lines[0].quantity=-1;assert.throws(()=>parseVaultImport(JSON.stringify(file)),/invalid monster/);
});
test("native Vault folders can be renamed and removed without losing encounters",async()=>{
  installFoundry();const folder=await createVaultFolder("Chapter One"),journal=await saveEncounter("The Crossing",sequence());
  assert.equal(vaultFolders().length,1);assert.equal(journal.folder,folder.id);
  await renameVaultFolder(folder.id,"Chapter Two");assert.equal(vaultEntries()[0].data.folder,"Chapter Two");
  await deleteVaultFolder(folder.id);assert.equal(vaultFolders().length,0);assert.equal(game.journal.size,1);assert.equal(vaultEntries()[0].data.folder,"");
});
test("folder deletion refuses unrelated journals and import creates copies instead of overwriting",async()=>{
  installFoundry();const original=await saveEncounter("The Crossing",sequence()),folder=vaultFolders()[0];
  const other=await JournalEntry.create({name:"Other notes",folder:folder.id});
  await assert.rejects(deleteVaultFolder(folder.id),/other journals/);assert.equal(game.journal.size,2);await other.delete();
  const imported=await importVault(parseVaultImport(exportVault(vaultEntries())));
  assert.equal(imported.length,1);assert.notEqual(imported[0].id,original.id);assert.match(imported[0].name,/imported/);assert.equal(game.journal.size,2);
  assert.equal(vaultEntries()[0].data.waves.length,2);
});
test("a failed import rolls back created encounters and validates the whole batch before mutation",async()=>{
  installFoundry();const create=JournalEntry.create;let calls=0;
  JournalEntry.create=async data=>{if(++calls===2)throw new Error("Write rejected");return create(data);};
  await assert.rejects(importVault([{name:"A",data:legacy()},{name:"B",data:legacy()}]),/rolled back/);assert.equal(game.journal.size,0);
  calls=0;await assert.rejects(importVault([{name:"A",data:legacy()},{name:"B",data:{schema:999}}]),/Unsupported/);assert.equal(calls,0);
});
test("a canceled journal creation cannot be reported as a successful import",async()=>{
  installFoundry();const create=JournalEntry.create;let calls=0;JournalEntry.create=async data=>++calls===2?undefined:create(data);
  await assert.rejects(importVault([{name:"A",data:legacy()},{name:"B",data:legacy()}]),/rolled back/);assert.equal(game.journal.size,0);
  installFoundry();const next=JournalEntry.create;calls=0;JournalEntry.create=async data=>{if(++calls===2)return undefined;const journal=await next(data);journal.delete=async()=>undefined;return journal;};
  await assert.rejects(importVault([{name:"A",data:legacy()},{name:"B",data:legacy()}]),/could not be removed/);assert.equal(game.journal.size,1);
});
test("a canceled move keeps the folder and its encounters rather than deleting its contents",async()=>{
  installFoundry();const saved=await saveEncounter("Keep me",sequence()),folder=vaultFolders()[0];saved.update=async()=>undefined;
  await assert.rejects(deleteVaultFolder(folder.id),/folder was kept/);assert.equal(game.journal.size,1);assert.ok(game.folders.has(folder.id));assert.equal(saved.folder,folder.id);
});
test("waves deploy separately into an existing combat, roll only the new group, and preserve existing initiative",async()=>{
  const a=npc("a","Guard",1),b=npc("b","Support",2);installFoundry({actors:[a,b]});
  const combat=await Combat.create({scene:"scene1",active:true});const old=await combat.createEmbeddedDocuments("Combatant",[{actorId:"pc",initiative:19}]);
  await deployEncounter([{monster:normalizeMonster(a),quantity:2}],{rollInitiative:true,encounterId:"enc",waveId:"opening",waveName:"Opening"});
  assert.equal(game.combats.size,1);assert.equal(combat.combatants.length,3);assert.equal(combat.combatants[0].initiative,19);
  assert.equal(combat.rolls[0].ids.length,2);assert.ok(!combat.rolls[0].ids.includes(old[0].id));assert.equal(combat.rolls[0].options.updateTurn,true);assert.equal(combat.rolls[0].options.messageMode,"gm");
  await deployEncounter([{monster:normalizeMonster(b),quantity:1}],{rollInitiative:true,hidden:false,encounterId:"enc",waveId:"support",waveName:"Support"});
  assert.equal(canvas.scene.tokens.size,3);assert.equal(combat.rolls[1].ids.length,1);assert.equal(combat.combatants.length,4);assert.equal(combat.rolls[1].options.messageMode,undefined);
  assert.deepEqual(canvas.scene.tokens.contents.map(t=>t.flags["combat-maker"].waveId),["opening","opening","support"]);
});
test("initiative failure removes only the failed reinforcement group from an existing combat",async()=>{
  const actor=npc("a");installFoundry({actors:[actor]});const combat=await Combat.create({scene:"scene1",active:true});
  const old=await combat.createEmbeddedDocuments("Combatant",[{actorId:"pc",initiative:17}]);combat.rollInitiative=async()=>{throw new Error("Roll rejected");};
  await assert.rejects(deployEncounter([{monster:normalizeMonster(actor),quantity:2}],{rollInitiative:true}),/Roll rejected/);
  assert.equal(canvas.scene.tokens.size,0);assert.equal(game.combats.size,1);assert.deepEqual(combat.combatants,old);
});
test("recommendations use available filtered monsters, provide wave plans, and rank saved encounters",()=>{
  const monsters=[0.25,1,2,3,4,5,6].map(cr=>line(cr).monster);const selected=party();
  const options={rules:{edition:"2024",dynamic:false,mode:"official"},filters:{type:"Humanoid"},maxMonsters:4};
  const recommendations=recommendEncounters(monsters,selected,options,seeded());assert.equal(recommendations.length,4);assert.equal(recommendations[3].data.waves.length,2);
  for(const candidate of recommendations)for(const wave of candidate.data.waves){assert.ok(wave.lines.every(l=>monsters.some(m=>m.uuid===l.monster.uuid)));assert.ok(wave.lines.reduce((n,l)=>n+l.quantity,0)<=4);}
  assert.ok(recommendations[3].caution.includes("Attrition"));
  const saved=rankSavedEncounters(recommendations.map((r,i)=>({id:String(i),name:r.name,data:r.data})),selected,options);assert.equal(saved.length,4);assert.ok(saved.every(e=>e.liveReport.waves.length));
  assert.throws(()=>recommendEncounters(monsters,[],options),/Choose your party/);assert.throws(()=>recommendEncounters([],selected,options),/No available/);
});
