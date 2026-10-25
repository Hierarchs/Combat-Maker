import test from "node:test";
import assert from "node:assert/strict";
import { installFoundry, npc, Collection } from "./fixtures/foundry.mjs";
import { describeMonster, normalizeMonster, filterMonsters } from "../scripts/normalize.mjs";
import { MonsterCatalog } from "../scripts/catalog.mjs";
import { saveCorrection, resetCorrection, cleanCorrection, repairState, setHidden, preferDuplicate, duplicateGroups, saveReplacement, removeReplacement, resolveReplacement } from "../scripts/repairs.mjs";
import { deployEncounter } from "../scripts/deploy.mjs";

function incomplete(id="missing") {
  const actor=npc(id,"Uncatalogued Watcher",null);
  delete actor.system.source;delete actor.system.details.habitat;return actor;
}

test("diagnostics retain invalid NPCs and identify all missing metadata, including pack fallback books",async()=> {
  const actor=incomplete();delete actor.uuid;
  const pack={collection:"world.oddities",metadata:{label:"My Oddities"},documentName:"Actor",getIndex:async()=>new Collection([actor])};
  installFoundry({packs:[pack]});const catalog=new MonsterCatalog();await catalog.refresh();
  assert.equal(catalog.monsters.length,0);assert.equal(catalog.records.length,1);assert.equal(catalog.skipped,1);
  assert.deepEqual(catalog.records[0].issues.map(i=>i.field),["cr","book","edition","environment"]);
  assert.equal(catalog.records[0].description.book,"My Oddities");assert.equal(catalog.records[0].knownBook,false);
});

test("world corrections repair missing CR and filters without writing to or changing a locked source pack",async()=> {
  const actor=incomplete();delete actor.uuid;const original=structuredClone(actor);
  let documentReads=0;
  const pack={collection:"locked.creatures",locked:true,metadata:{label:"Locked creatures"},documentName:"Actor",getIndex:async()=>new Collection([actor]),getDocument:()=>{documentReads++;throw new Error("Should not read full actors")}};
  installFoundry({packs:[pack]});const catalog=new MonsterCatalog();await catalog.refresh();const uuid=pack.getUuid(actor.id);
  await saveCorrection(uuid,{cr:"1/2",book:"Watcher Folio",edition:"2024",environments:"Forest, Swamp",type:"aberration",size:"Large"});
  await catalog.refresh();
  assert.equal(catalog.monsters.length,1);assert.equal(catalog.skipped,0);assert.equal(catalog.issueCount,0);
  const monster=catalog.monsters[0];assert.equal(monster.cr,0.5);assert.equal(monster.xp,100);assert.equal(monster.size,"Large");
  assert.equal(filterMonsters(catalog.monsters,{edition:"2024",environment:"Swamp",book:"Watcher Folio"}).length,1);
  assert.deepEqual(actor,original);assert.equal(documentReads,0);assert.equal(pack.locked,true);
  const reload=new MonsterCatalog();await reload.refresh();assert.equal(reload.monsters[0].book,"Watcher Folio");
  await resetCorrection(uuid);await reload.refresh();assert.equal(reload.monsters.length,0);assert.equal(reload.records[0].corrected,false);
});

test("CR corrections recalculate XP, accept CR 0, and leave prepared source values intact",()=> {
  const actor=npc("xp","Sentinel",8);actor.system.details.xp={value:3900};
  assert.equal(normalizeMonster(actor,null,{cr:2}).xp,450);
  assert.equal(normalizeMonster(actor,null,{cr:0}).xp,10);
  assert.equal(actor.system.details.cr,8);assert.equal(actor.system.details.xp.value,3900);
  assert.equal(describeMonster(actor).monster.cr,8);
  const harmless=npc("harmless","Harmless spirit",0);harmless.system.details.xp={value:0};
  assert.equal(normalizeMonster(harmless,null,{cr:0,book:"Corrected book"}).xp,0);
});

test("full Actors retain their V14 compendium identity when only the compendium accessor is available",async()=> {
  const actor=npc("modern");delete actor.system.source;
  const pack={collection:"modern.creatures",documentName:"Actor",metadata:{label:"Modern creatures",flags:{dnd5e:{sourceBook:"Modern Folio"}}},getIndex:async()=>new Collection([])};
  const ctx=installFoundry({packs:[pack]});actor.compendium=pack;actor.uuid=pack.getUuid(actor.id);ctx.decorate(actor);
  const catalog=new MonsterCatalog();await catalog.addActor(actor);await catalog.refresh();
  assert.equal(catalog.monsters[0].pack,pack.collection);assert.equal(catalog.monsters[0].book,"Modern Folio");
  await catalog.auditReferences([], [{monster:catalog.monsters[0],quantity:1}]);
  assert.equal(catalog.byUuid.get(actor.uuid).packLabel,"Modern creatures");
});

test("correction validation rejects malformed CR, edition and size, and ignores unapproved fields",()=> {
  assert.throws(()=>cleanCorrection({cr:"1/3"}),/valid CR/);
  assert.throws(()=>cleanCorrection({edition:"2025"}),/2014 or 2024/);
  assert.throws(()=>cleanCorrection({size:"Colossal"}),/recognized/);
  assert.deepEqual(cleanCorrection({name:"Sneaky rename",system:{details:{cr:20}},book:"",edition:"",environments:""}),{});
  assert.deepEqual(cleanCorrection({environments:"Forest, Forest; Swamp"}).environments,["Forest","Swamp"]);
});

test("duplicate candidates remain separate across editions, types and CRs; choosing a preference is reversible",async()=> {
  const first=npc("first"),second=npc("second"),modern=npc("modern"),strong=npc("strong","Goblin",1);
  first.system.source.rules="2014";second.system.source.rules="2014";
  installFoundry({actors:[first,second,modern,strong]});const catalog=new MonsterCatalog();await catalog.refresh();
  assert.equal(catalog.duplicates.length,1);assert.equal(catalog.duplicates[0].active,2);
  await preferDuplicate([first.uuid,second.uuid],first.uuid);await catalog.refresh();
  assert.equal(catalog.monsters.length,3);assert.equal(catalog.duplicates[0].active,1);assert.equal(game.actors.size,4);
  assert.equal(catalog.get(second.uuid).name,"Goblin");
  await setHidden(second.uuid,false);await catalog.refresh();assert.equal(catalog.monsters.length,4);assert.equal(catalog.duplicates[0].active,2);
  assert.throws(()=>preferDuplicate([first.uuid],second.uuid),/member/);
});

test("reference audit distinguishes real missing actors, invalid CR, and available unselected sources",async()=> {
  const ctx=installFoundry();const available=ctx.decorate(npc("unselected")),invalid=ctx.decorate(incomplete("invalid"));
  const catalog=new MonsterCatalog();await catalog.refresh();
  const data={lines:[{monster:{uuid:"Actor.gone",name:"Lost guardian"},quantity:1},{monster:normalizeMonster(available),quantity:1},{monster:{uuid:invalid.uuid,name:invalid.name},quantity:1}]};
  await catalog.auditReferences([{name:"Old fight",data}],data.lines.slice(0,1));
  assert.equal(catalog.references.length,2);
  const missing=catalog.references.find(r=>r.uuid==="Actor.gone");assert.equal(missing.status,"missing");assert.deepEqual(missing.uses,["Vault: Old fight","Current draft"]);
  assert.equal(catalog.references.find(r=>r.uuid===invalid.uuid).status,"invalid");
  assert.equal(catalog.byUuid.get(available.uuid).listed,false);assert.equal(catalog.monsters.length,0);
});

test("replacement mappings persist, resolve chains safely, and repair deployment from saved UUIDs",async()=> {
  const replacement=npc("new","New Guardian",2);const ctx=installFoundry({actors:[replacement]});
  await saveReplacement("Actor.gone",replacement.uuid);
  assert.equal(resolveReplacement("Actor.gone"),replacement.uuid);
  const catalog=new MonsterCatalog();await catalog.refresh();
  const old={monster:{...normalizeMonster(replacement),uuid:"Actor.gone",name:"Old Guardian"},quantity:2};
  await catalog.auditReferences([{name:"A saved fight",data:{lines:[old]}}]);
  assert.equal(catalog.references[0].status,"mapped");assert.equal(catalog.references[0].replacementName,"New Guardian");
  assert.equal(catalog.get("Actor.gone").uuid,replacement.uuid);
  const tokens=await deployEncounter([old]);assert.equal(tokens.length,2);assert.ok(tokens.every(t=>t.actorId===replacement.id));
  await saveReplacement("Actor.older","Actor.gone");assert.equal(resolveReplacement("Actor.older"),replacement.uuid);
  await assert.rejects(saveReplacement(replacement.uuid,"Actor.older"),/loop/);
  assert.equal(resolveReplacement(replacement.uuid),replacement.uuid);
  await removeReplacement("Actor.older");assert.equal(resolveReplacement("Actor.older"),"Actor.older");
  assert.equal(repairState().replacements["Actor.gone"],replacement.uuid);assert.equal(ctx.scene.tokens.size,2);
});

test("reference audit reports a mapping whose replacement has also disappeared",async()=> {
  const replacement=npc("target");const ctx=installFoundry({actors:[replacement]});await saveReplacement("Actor.gone",replacement.uuid);
  ctx.docs.delete(replacement.uuid);game.actors.delete(replacement.id);
  const catalog=new MonsterCatalog();await catalog.refresh();await catalog.auditReferences();
  assert.equal(catalog.references.length,1);assert.equal(catalog.references[0].status,"missing");assert.equal(catalog.referenceCount,1);
});

test("a returned original source stays suppressed while its explicit replacement mapping is active",async()=> {
  const original=npc("original","Original guardian",2),replacement=npc("replacement","Replacement guardian",3);
  installFoundry({actors:[original,replacement]});await saveReplacement(original.uuid,replacement.uuid);
  const catalog=new MonsterCatalog();await catalog.refresh();
  assert.deepEqual(catalog.monsters.map(m=>m.uuid),[replacement.uuid]);
  assert.equal(catalog.get(original.uuid).uuid,replacement.uuid);
  assert.equal(catalog.byUuid.get(original.uuid).mappedTo,replacement.uuid);
  await removeReplacement(original.uuid);await catalog.refresh();assert.equal(catalog.monsters.length,2);
});

test("repair writes are GM-only, queued safely, and never call actor update methods",async()=> {
  const a=npc("a"),b=npc("b");a.update=()=>{throw new Error("Source mutation")};b.update=a.update;
  installFoundry({actors:[a,b]});
  await Promise.all([saveCorrection(a.uuid,{book:"A"}),saveCorrection(b.uuid,{book:"B"})]);
  assert.equal(Object.keys(repairState().actors).length,2);
  game.user.isGM=false;await assert.rejects(saveCorrection(a.uuid,{book:"Forbidden"}),/Only a GM/);
  assert.equal(repairState().actors[a.uuid].book,"A");
});

test("large duplicate scans remain bounded and never collapse individual record identities",()=> {
  const records=Array.from({length:12000},(_,i)=>({uuid:`Actor.${i}`,listed:true,hidden:false,monster:{...normalizeMonster(npc(String(i))),name:`Creature ${Math.floor(i/2)}`}}));
  const start=performance.now();const groups=duplicateGroups(records);
  assert.equal(groups.length,6000);assert.equal(groups[0].items.length,2);assert.ok(performance.now()-start<3000);
});
