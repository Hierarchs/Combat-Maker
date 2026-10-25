import test from "node:test";
import assert from "node:assert/strict";
import { installFoundry, npc, character } from "./fixtures/foundry.mjs";
import { ID } from "../scripts/constants.mjs";
import { MonsterCatalog } from "../scripts/catalog.mjs";
import { normalizeMonster, normalizeCharacter } from "../scripts/normalize.mjs";
import { saveEncounter, vaultEntries, invalidateVaultEntry, renameVaultFolder } from "../scripts/vault.mjs";
import { catalogueMetadataChanged, affectsParty, tokenResourcesChanged } from "../scripts/events.mjs";
import { generateEncounter } from "../scripts/generator.mjs";
import { adjustedXP, encounterTotals } from "../scripts/difficulty.mjs";
import { planPlacement } from "../scripts/deploy.mjs";

function seeded(seed=71){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const monster=(id,cr)=>normalizeMonster(npc(id,id,cr));

test("cached Vault snapshots stay immutable and refresh for flag replacement, in-place hooks, names, folders and deletion",async()=>{
  installFoundry();
  const journal=await saveEncounter("Ambush",{schema:1,lines:[{monster:monster("goblin",0.25),quantity:2}],party:[],folder:"Roads"});
  const first=vaultEntries()[0];assert.equal(vaultEntries()[0],first);
  assert.throws(()=>{first.data.waves[0].lines[0].quantity=99;},TypeError);
  assert.equal(journal.getFlag(ID,"encounter").waves[0].lines[0].quantity,2);
  const replacement=structuredClone(journal.getFlag(ID,"encounter"));replacement.waves[0].lines[0].quantity=3;
  await journal.update({[`flags.${ID}.encounter`]:replacement});assert.equal(vaultEntries()[0].data.report.count,3);
  journal.getFlag(ID,"encounter").waves[0].lines[0].quantity=4;invalidateVaultEntry(journal);
  assert.equal(vaultEntries()[0].data.report.count,4);assert.equal(first.data.report.count,2);
  journal.name="Bridge ambush";assert.equal(vaultEntries()[0].name,"Bridge ambush");
  await renameVaultFolder(journal.folder,"High roads");assert.equal(vaultEntries()[0].data.folder,"High roads");
  await journal.delete();assert.equal(vaultEntries().length,0);
});

test("catalogue summaries are reused between reads and invalidated after metadata changes and visibility corrections",()=>{
  installFoundry();const catalog=new MonsterCatalog();
  const a=npc("a","Goblin",0.25),b=npc("b","Goblin",0.25);catalog.record(a);catalog.record(b);catalog.finish();
  const groups=catalog.duplicates,facets=catalog.facets;
  assert.equal(catalog.duplicates,groups);assert.equal(catalog.facets,facets);assert.equal(groups.length,1);
  catalog.repairs.actors[b.uuid]={hidden:true};catalog.record(b);catalog.finish();
  assert.equal(catalog.monsters.length,1);assert.equal(catalog.duplicates[0].active,1);assert.notEqual(catalog.duplicates,groups);
  a.system.details.type.value="giant";catalog.record(a);catalog.finish();
  assert.deepEqual(catalog.facets.type,["Giant"]);assert.notEqual(catalog.facets,facets);assert.equal(catalog.duplicates.length,0);
  a.system.details.cr=null;catalog.record(a);catalog.finish();assert.equal(catalog.issueCount,1);
});

test("hook routing ignores NPC HP and unrelated documents but keeps metadata, deletions, embedded resources and synthetic PCs live",()=>{
  for(const changes of [{"system.attributes.hp.value":1},{system:{attributes:{hp:{max:99}}}},{"prototypeToken.x":10},{"system.resources.legact.value":1}])assert.equal(catalogueMetadataChanged(changes),false);
  for(const changes of [{name:"New name"},{"system.details.cr":2},{system:{details:{type:{swarm:true}}}},{"system.details.-=habitat":null},{"system.resources.legact.max":3},{[`flags.${ID}.edition`]:"2024"},{"-=system":null},{type:"character"}])assert.equal(catalogueMetadataChanged(changes),true);
  assert.equal(catalogueMetadataChanged(),true);
  const pc=character("pc"),other=character("other"),uuids=[pc.uuid];
  assert.equal(affectsParty(pc,uuids),true);assert.equal(affectsParty({parent:pc},uuids),true);
  assert.equal(affectsParty({parent:{actor:pc}},uuids),true);assert.equal(affectsParty({parent:other},uuids),false);
  assert.equal(affectsParty({uuid:"Scene.x.Token.t.Actor.pc"},["Scene.x.Token.t.Actor.pc"]),true);
  assert.equal(affectsParty({uuid:"Scene.x.Token.t",actor:other},["Scene.x.Token.t.Actor.pc"]),true);
  assert.equal(tokenResourcesChanged({x:5,y:7,hidden:true}),false);assert.equal(tokenResourcesChanged({"delta.system.attributes.hp.value":1}),true);
  assert.equal(tokenResourcesChanged({actorId:"new"}),true);
});

test("generator's incremental scores agree with difficulty rules across editions, swarm mode, party sizes and CR targets",()=>{
  const pool=[0.125,0.25,0.5,1,2,4,8].map((cr,i)=>monster(`m${i}`,cr));
  for(const edition of ["2014","2024"])for(const mode of ["official","swarm"])for(const size of [2,4,6])for(let seed=1;seed<=5;seed++){
    const rules={edition,mode,dynamic:false},party=Array.from({length:size},(_,i)=>normalizeCharacter(character(`p${i}`)));
    const result=generateEncounter(pool,party,{rules,difficulty:edition==="2014"?"Medium":"Moderate",maxMonsters:8,maxSpecies:3},seeded(seed));
    assert.equal(result.score,adjustedXP(result.lines,size,rules).xp);assert.ok(encounterTotals(result.lines).count<=8);assert.ok(result.lines.length<=3);
    assert.ok(result.withinTarget,`${edition}/${mode}/${size}/${seed} should reach a feasible target`);
  }
  const cr=generateEncounter(pool,[],{balance:"cr",targetCR:4,maxMonsters:8,maxSpecies:3},seeded());
  assert.equal(cr.withinTarget,true);assert.equal(cr.score,encounterTotals(cr.lines).cr);
});

test("unreachable generator requests return the strongest legal group, including small/large party and swarm multipliers",()=>{
  const pool=[monster("weak",0.125),monster("strong",0.25)];
  const cr=generateEncounter(pool,[],{balance:"cr",targetCR:20,maxMonsters:6,maxSpecies:1});
  assert.equal(cr.withinTarget,false);assert.equal(cr.score,1.5);assert.equal(cr.lines[0].quantity,6);
  for(const edition of ["2014","2024"])for(const mode of ["official","swarm"])for(const size of [2,4,6]){
    const rules={edition,mode,dynamic:false},party=Array.from({length:size},(_,i)=>normalizeCharacter(character(`p${i}`,"Hero",20)));
    const result=generateEncounter(pool,party,{rules,difficulty:edition==="2014"?"Deadly":"High",maxMonsters:6,maxSpecies:1});
    assert.equal(result.withinTarget,false);assert.equal(result.lines[0].monster.uuid,"Actor.strong");
    assert.equal(result.score,adjustedXP([{monster:pool[1],quantity:6}],size,rules).xp);
  }
});

// Independent brute-force oracle keeps placement order and collision behavior
// stable while the production implementation uses a spatial index.
function brutePlacement(tokens,{origin,bounds,gridSize=100,occupied=[],snap=p=>p}){
  const taken=[...occupied],out=[],overlap=(a,b)=>a.x<b.x+b.width-1&&a.x+a.width>b.x+1&&a.y<b.y+b.height-1&&a.y+a.height>b.y+1;
  for(const token of tokens){
    const width=Math.max(0.25,Number(token.width)||1)*gridSize,height=Math.max(0.25,Number(token.height)||1)*gridSize;
    let found;const rings=Math.min(150,Math.ceil(Math.max(bounds.width,bounds.height)/gridSize));
    for(let radius=0;radius<=rings&&!found;radius++){
      const points=radius?[]:[[0,0]];
      if(radius)for(let offset=-radius;offset<=radius;offset++){points.push([offset,-radius],[offset,radius]);if(Math.abs(offset)<radius)points.push([-radius,offset],[radius,offset]);}
      for(const [dx,dy]of points){
        const p=snap({x:origin.x+dx*gridSize,y:origin.y+dy*gridSize},token),rect={...p,width,height};
        if(rect.x<bounds.x||rect.y<bounds.y||rect.x+width>bounds.x+bounds.width||rect.y+height>bounds.y+bounds.height||taken.some(r=>overlap(rect,r)))continue;
        found=rect;break;
      }
    }
    if(!found)throw new Error("full");taken.push(found);out.push({...token,x:found.x,y:found.y});
  }
  return out;
}

test("spatial placement matches brute-force ordering for mixed footprints, negative coordinates and snapped positions",()=>{
  for(let seed=1;seed<=30;seed++){
    const rng=seeded(seed),tokens=Array.from({length:15},()=>({width:[0.5,1,2,3][Math.floor(rng()*4)],height:[1,2][Math.floor(rng()*2)]}));
    const options={origin:{x:500,y:500},bounds:{x:-100,y:-100,width:2000,height:2000},occupied:Array.from({length:35},()=>({x:Math.floor(rng()*15)*100-100,y:Math.floor(rng()*15)*100-100,width:100,height:100})),snap:p=>({x:Math.round(p.x/50)*50,y:Math.round(p.y/50)*50})};
    assert.deepEqual(planPlacement(tokens,options),brutePlacement(tokens,options));
  }
});

test("spatial indexing handles huge custom occupied and token footprints without allocating unbounded buckets",()=>{
  const options={origin:{x:0,y:0},bounds:{x:0,y:0,width:10000,height:10000},occupied:[{x:-1e8,y:0,width:1e8+300,height:10000}]};
  const tokens=[{width:80,height:90}];assert.deepEqual(planPlacement(tokens,options),brutePlacement(tokens,options));
});
