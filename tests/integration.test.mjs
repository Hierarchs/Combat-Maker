import test from "node:test";
import assert from "node:assert/strict";
import { installFoundry, npc, character, Collection } from "./fixtures/foundry.mjs";
import { MonsterCatalog } from "../scripts/catalog.mjs";
import { normalizeMonster, normalizeCharacter } from "../scripts/normalize.mjs";
import { saveEncounter, vaultEntries } from "../scripts/vault.mjs";
import { deployEncounter } from "../scripts/deploy.mjs";

const pack=(collection,label,entries)=>({collection,metadata:{label},documentName:"Actor",getIndex:async()=>new Collection(entries)});
test("automatic discovery, explicit sources, bad packs, and homebrew work without fetching every document",async()=> {
  const broken=pack("bad.pack","Broken",[]);broken.getIndex=async()=>{throw new Error("Unavailable")};
  const p1=pack("world.monsters","My Monsters",[npc("a"),character("pc"),npc("invalid","Invalid",null)]);
  const p2=pack("module.monsters","Other Monsters",[npc("b")]);
  for(const p of [p1,p2])for(const actor of await p.getIndex()){delete actor.uuid;}
  // Index fixtures must actually be retained between calls.
  const a=npc("a"),b=npc("b");delete a.uuid;delete b.uuid;p1.getIndex=async()=>new Collection([a,character("pc"),npc("invalid","Invalid",null)]);p2.getIndex=async()=>new Collection([b]);
  const ctx=installFoundry({packs:[p1,p2,broken],actors:[npc("world")]});
  const catalog=new MonsterCatalog();const progress=[];await catalog.refresh(p=>progress.push(p));
  assert.equal(catalog.monsters.length,3);assert.equal(catalog.skipped,1);assert.equal(catalog.errors.length,1);assert.equal(progress.length,3);
  ctx.settings.set("sources",{auto:false,packs:["world.monsters"],world:false});await catalog.refresh();
  assert.equal(catalog.monsters.length,1);assert.equal(catalog.monsters[0].pack,"world.monsters");
  const dropped=ctx.decorate(npc("dropped"));await catalog.addActor(dropped);await catalog.refresh();
  assert.equal(catalog.monsters.length,2);assert.deepEqual(ctx.settings.get("homebrew"),[dropped.uuid]);
});
test("Vault saves independently addressable journals, updates one encounter and preserves another",async()=> {
  installFoundry();
  const data={schema:1,lines:[{monster:normalizeMonster(npc("a")),quantity:2}],party:[normalizeCharacter(character("pc"))],rules:{edition:"2014",mode:"official",dynamic:false}};
  const first=await saveEncounter("Goblin crossing",data),second=await saveEncounter("Another fight",data);
  assert.equal(game.folders.size,1);assert.equal(vaultEntries().length,2);
  await saveEncounter("Revised crossing",{...data,lines:[{...data.lines[0],quantity:3}]},first.id);
  assert.equal(game.journal.get(first.id).getFlag("combat-maker","encounter").lines[0].quantity,3);
  assert.equal(game.journal.get(second.id).getFlag("combat-maker","encounter").lines[0].quantity,2);
  assert.equal(first.ownership.default,0);
  game.user.isGM=false;await assert.rejects(saveEncounter("Forbidden",data),/Only a GM/);
});
test("deployment imports a compendium actor only once, preserves sizes, and adds hidden hostile unlinked tokens to combat",async()=> {
  const source=npc("source");source.uuid="Compendium.test.monsters.Actor.source";source.pack="test.monsters";source.inCompendium=true;
  const ctx=installFoundry();ctx.decorate(source);
  const data={monster:normalizeMonster(source),quantity:3};
  const created=await deployEncounter([data],{origin:{x:500,y:500},addToCombat:true});
  assert.equal(created.length,3);assert.equal(game.actors.size,1);assert.equal(game.combats.size,1);
  assert.ok(created.every(t=>t.hidden&&t.actorLink===false&&t.disposition===-1&&t.texture.src));
  assert.equal(game.combats.contents[0].combatants.length,3);
  await deployEncounter([{...data,quantity:1}],{origin:{x:1000,y:1000},hidden:false});
  assert.equal(game.actors.size,1);assert.equal(canvas.scene.tokens.size,4);
});
test("missing sources are detected before any actors or tokens are created",async()=> {
  const a=npc("a"),ctx=installFoundry({actors:[a]});
  await assert.rejects(deployEncounter([{monster:normalizeMonster(a),quantity:1},{monster:normalizeMonster(npc("missing")),quantity:1}]),/Cannot find/);
  assert.equal(ctx.scene.tokens.size,0);assert.equal(game.actors.size,1);
});
test("deployment rolls back tokens and imported actors on a combat failure",async()=> {
  const ctx=installFoundry();const source=npc("source");source.pack="test.monsters";source.inCompendium=true;ctx.decorate(source);
  const create=Combat.create;Combat.create=async data=>{const combat=await create(data);combat.createEmbeddedDocuments=async()=>{throw new Error("Combat failed")};return combat;};
  await assert.rejects(deployEncounter([{monster:normalizeMonster(source),quantity:2}],{addToCombat:true}),/Combat failed/);
  assert.equal(ctx.scene.tokens.size,0);assert.equal(game.actors.size,0);assert.equal(game.combats.size,0);
});
test("full scenes roll back imports and deployment is GM-only",async()=> {
  const ctx=installFoundry();const source=npc("source");source.pack="test.monsters";ctx.decorate(source);
  canvas.dimensions.sceneRect={x:0,y:0,width:100,height:100};ctx.scene.tokens.set("block",{id:"block",x:0,y:0,width:1,height:1});
  await assert.rejects(deployEncounter([{monster:normalizeMonster(source),quantity:1}]),/not enough free space/);
  assert.equal(game.actors.size,0);assert.equal(ctx.scene.tokens.size,1);
  game.user.isGM=false;await assert.rejects(deployEncounter([{monster:normalizeMonster(source),quantity:1}]),/Only a GM/);
});
