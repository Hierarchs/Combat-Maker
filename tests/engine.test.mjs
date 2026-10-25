import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMonster, normalizeCharacter, parseCR, filterMonsters, facets } from "../scripts/normalize.mjs";
import { assessEncounter, monsterMultiplier, partyBudgets, generationTarget } from "../scripts/difficulty.mjs";
import { generateEncounter } from "../scripts/generator.mjs";
import { planPlacement } from "../scripts/deploy.mjs";
import { validateEncounter } from "../scripts/vault.mjs";
import { npc, character } from "./fixtures/foundry.mjs";

const rules=(edition="2024",dynamic=false,mode="official")=>({edition,dynamic,mode});
const pcs=(level=5,count=4)=>Array.from({length:count},(_,i)=>normalizeCharacter(character(`pc${i}`,`Hero ${i}`,level)));
const line=(cr,quantity=1)=>({monster:normalizeMonster(npc(`npc${cr}`,"Creature",cr)),quantity});
function seeded(seed=1){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}

test("CR parsing accepts real fractional CR and excludes absent or unsupported ratings",()=> {
  for(const [input,expected]of [[0,0],["1/8",0.125],["CR 1 / 4",0.25],["1/2",0.5],["30",30]])assert.equal(parseCR(input),expected);
  for(const invalid of [undefined,null,"",-1,0.3,"1/0",Infinity,31,"unknown"])assert.equal(parseCR(invalid),null);
});
test("modern and legacy monster metadata normalize without inventing an edition",()=> {
  const modern=normalizeMonster(npc("a"));
  assert.equal(modern.edition,"2024");assert.deepEqual(modern.environments,["Forest"]);assert.equal(modern.xp,50);
  const actor=npc("b");delete actor.system.source;actor.system.details.source="Homebrew Book";
  actor.system.details.environment="swamp; underdark";delete actor.system.details.habitat;
  actor.system.details.type="beast";actor.system.traits.size="lg";
  const legacy=normalizeMonster(actor);assert.equal(legacy.edition,"Unknown");assert.equal(legacy.type,"Beast");
  assert.equal(legacy.size,"Large");assert.deepEqual(legacy.environments,["Swamp","Underdark"]);
  assert.equal(normalizeMonster(character("hero")),null);
});
test("compendium identity and source fallback, legendary fields and module overrides are supported",()=> {
  const actor=npc("a");delete actor.uuid;delete actor.system.source;actor.system.resources.legres={max:3};
  actor.flags={"combat-maker":{edition:"2014",environments:"desert,urban"}};
  const m=normalizeMonster(actor,{collection:"world.homebrew",metadata:{label:"My Monsters"}});
  assert.equal(m.uuid,"Compendium.world.homebrew.Actor.a");assert.equal(m.book,"My Monsters");assert.equal(m.legendary,true);
  assert.equal(m.edition,"2014");assert.deepEqual(m.environments,["Desert","Urban"]);
});
test("all filters compose, including fractional CR, legendary and environment",()=> {
  const a=normalizeMonster(npc("a")),b=normalizeMonster(npc("b","Ogre",2));b.legendary=true;b.type="Giant";
  assert.deepEqual(filterMonsters([a,b],{search:"gob",minCR:"1/8",maxCR:"1/2",environment:"Forest",edition:"2024",legendary:"no"}),[a]);
  assert.equal(filterMonsters([a,b],{type:"Dragon"}).length,0);
  assert.deepEqual(facets([a,b]).type,["Giant","Humanoid"]);
});
test("2014 worked example from the Basic Rules is Hard at 1,000 adjusted XP",()=> {
  const party=[...pcs(3,3),...pcs(2,1)];
  const r=assessEncounter([{monster:{...normalizeMonster(npc("b")),xp:200,cr:1},quantity:1},{monster:{...normalizeMonster(npc("h")),xp:100,cr:0.5},quantity:3}],party,rules("2014"));
  assert.deepEqual(r.fullBudgets,[275,550,825,1400]);assert.equal(r.xp,500);assert.equal(r.multiplier,2);assert.equal(r.adjustedXP,1000);assert.equal(r.shown.label,"Hard");
});
test("2014 multiplier changes for small and large parties and keeps awarded XP unchanged",()=> {
  assert.equal(monsterMultiplier(1,2),1.5);assert.equal(monsterMultiplier(15,2),5);assert.equal(monsterMultiplier(1,6),0.5);
  const r=assessEncounter([line(1,2)],pcs(2),rules("2014"));assert.equal(r.xp,400);assert.equal(r.adjustedXP,600);
});
test("2024 uses raw XP and ceiling bands, including exact budget boundaries",()=> {
  const party=pcs(5);assert.deepEqual(partyBudgets(party,rules()),[2000,3000,4400]);
  for(const [xp,label]of [[2000,"Low"],[2001,"Moderate"],[3000,"Moderate"],[3001,"High"],[4400,"High"],[4401,"Over budget"]]) {
    const l=line(1,10);l.monster.xp=xp/10;
    const r=assessEncounter([l],party,rules());assert.equal(r.multiplier,1);assert.equal(r.shown.label,label);
  }
});
test("mixed party levels and high-level 2024 budgets are summed exactly",()=> {
  assert.deepEqual(partyBudgets([...pcs(1,1),...pcs(20,1)],rules()),[6450,13275,22100]);
});
test("dynamic difficulty rises as HP and weighted spell resources are depleted",()=> {
  const full=character("full"),drained=structuredClone(full);drained.id="drained";drained.uuid="Actor.drained";
  drained.system.attributes.hp.value=10;for(const slot of Object.values(drained.system.spells))slot.value=0;
  const p1=normalizeCharacter(full),p2=normalizeCharacter(drained);
  assert.equal(p1.readiness,1);assert.ok(p2.readiness<0.3);
  const r=assessEncounter([line(3)],Array(4).fill(p2),rules("2024",true));
  assert.equal(r.full.label,"Low");assert.notEqual(r.current.label,"Low");
  assert.ok(r.currentBudgets.every((n,i)=>n<r.fullBudgets[i]));
});
test("martial classes retain capacity when irrelevant spell pools are empty",()=> {
  const fighter=character("f");fighter.items=[{type:"class",name:"Fighter",system:{identifier:"fighter",levels:5,spellcasting:{progression:"none"}}}];
  for(const slot of Object.values(fighter.system.spells))slot.value=0;
  assert.equal(normalizeCharacter(fighter).readiness,1);
});
test("modern spent uses, legacy resources, temporary HP and exhaustion affect readiness safely",()=> {
  const actor=character("uses");actor.items.push({type:"feat",system:{uses:{max:4,spent:4}}});
  actor.system.attributes.hp={value:20,max:38,temp:18};actor.system.attributes.exhaustion=2;
  const p=normalizeCharacter(actor);assert.equal(p.hpRatio,1);assert.equal(p.resourceRatio,0);assert.ok(Math.abs(p.readiness-0.756)<1e-9);
});
test("zero HP and incapacitating conditions contribute no current budget; missing pools are neutral",()=> {
  const zero=normalizeCharacter(character("zero","Hero",5,0,38));assert.equal(zero.readiness,0);
  const dead=character("dead");dead.statuses.add("dead");assert.equal(normalizeCharacter(dead).readiness,0);
  const noData=character("unknown");delete noData.system.attributes.hp;delete noData.system.spells;
  assert.equal(normalizeCharacter(noData).readiness,1);
  assert.equal(assessEncounter([line(1)], [zero],rules("2024",true)).shown.label,"Overwhelming");
});
test("swarm adjustment counts meaningful foes while retaining weaker foes' XP",()=> {
  const r=assessEncounter([line(10),line(0.25,10)],pcs(10),rules("2024",false,"swarm"));
  assert.equal(r.xp,6400);assert.equal(r.ignored,10);assert.equal(r.multiplier,1);
  assert.equal(assessEncounter([line(1,4)],pcs(),rules("2024",false,"swarm")).multiplier,2);
});
test("generation target respects each edition's budget semantics",()=> {
  const old=generationTarget(pcs(),rules("2014"),"Medium"),modern=generationTarget(pcs(),rules(),"Moderate");
  assert.equal(old.min,2000);assert.ok(old.max<3000);assert.ok(modern.min>2000);assert.equal(modern.max,3000);
  assert.throws(()=>generationTarget([],rules(),"High"),/Add at least/);
});
test("generator reaches a feasible difficulty and obeys species, count, and filter constraints",()=> {
  const monsters=[line(0.25).monster,line(1).monster,line(2).monster,line(4).monster,line(5).monster];
  monsters.at(-1).type="Giant";
  const result=generateEncounter(monsters,pcs(),{rules:rules(),difficulty:"Moderate",maxMonsters:6,maxSpecies:2,filters:{type:"Humanoid"}},seeded());
  assert.equal(result.withinTarget,true);assert.ok(result.score>2000&&result.score<=3000);
  assert.ok(result.lines.length<=2);assert.ok(result.lines.reduce((n,l)=>n+l.quantity,0)<=6);
  assert.ok(result.lines.every(l=>l.monster.type==="Humanoid"));
});
test("CR generation targets combined CR, reports infeasible limits and rejects empty pools",()=> {
  const pool=[line(0.25).monster,line(2).monster];
  const result=generateEncounter(pool,[],{balance:"cr",targetCR:4,maxSpecies:1,maxMonsters:2},seeded());
  assert.equal(result.score,4);assert.equal(result.withinTarget,true);
  const impossible=generateEncounter([line(10).monster],[],{balance:"cr",targetCR:1,maxMonsters:1},seeded());
  assert.equal(impossible.withinTarget,false);assert.equal(impossible.lines[0].quantity,1);
  assert.throws(()=>generateEncounter([],pcs(),{},seeded()),/No monsters match/);
  assert.throws(()=>generateEncounter(pool,[],{balance:"cr",targetCR:0},seeded()),/Total CR/);
});
test("generator is bounded for a large catalogue and fractional-CR swarm",()=> {
  const monsters=Array.from({length:2600},(_,i)=>({...line(i%4?0.25:2).monster,uuid:`Actor.m${i}`}));
  const start=performance.now();
  const result=generateEncounter(monsters,pcs(1),{rules:rules(),difficulty:"High",maxMonsters:30,maxSpecies:2},seeded());
  assert.ok(result.lines.length<=2);assert.ok(performance.now()-start<5000);
});
test("placement keeps large tokens inside bounds and avoids existing and new footprints",()=> {
  const bounds={x:0,y:0,width:600,height:600};
  const placed=planPlacement([{width:2,height:2},{width:1,height:1},{width:1,height:1}],{origin:{x:200,y:200},bounds,gridSize:100,occupied:[{x:200,y:200,width:100,height:100}]});
  assert.equal(placed.length,3);
  for(const [i,t]of placed.entries()) {
    assert.ok(t.x>=0&&t.y>=0&&t.x+t.width*100<=600&&t.y+t.height*100<=600);
    for(const other of placed.slice(i+1))assert.ok(t.x+t.width*100<=other.x||other.x+other.width*100<=t.x||t.y+t.height*100<=other.y||other.y+other.height*100<=t.y);
  }
  assert.throws(()=>planPlacement([{width:10,height:10}],{origin:{x:0,y:0},bounds,gridSize:100}),/not enough free space/);
});
test("saved data rejects malformed quantities, broken UUIDs, and over-limit imports",()=> {
  const snapshot={schema:1,lines:[line(1)],party:[],rules:rules()};assert.equal(validateEncounter(snapshot).lines.length,1);
  assert.throws(()=>validateEncounter({...snapshot,lines:[line(1,0.5)]}),/invalid/);
  assert.throws(()=>validateEncounter({...snapshot,lines:[line(1,101)]}),/at most/);
  const bad=line(1);bad.monster.uuid="javascript:alert(1)";
  assert.throws(()=>validateEncounter({...snapshot,lines:[bad]}),/invalid/);
});
