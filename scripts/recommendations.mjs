import { generateEncounter } from "./generator.mjs";
import { filterMonsters } from "./normalize.mjs";
import { rulesConfig, generationTarget } from "./difficulty.mjs";
import { normalizeEncounter, summarizeWaves } from "./encounters.mjs";

/** Suggestions use installed catalogue metadata and the selected rules, never invented stat blocks. */
export function recommendEncounters(monsters,party,{rules:inputRules,filters={},difficulty="",maxMonsters=6}={},rng=Math.random){
  const rules=rulesConfig(inputRules),pool=filterMonsters(monsters,filters);
  if(!party.length)throw new Error("Choose your party in the Forge to get encounter recommendations.");
  if(!pool.length)throw new Error("No available creatures match these filters. Broaden the bestiary filters or enable another source.");
  const labels=rules.edition==="2014"?["Easy","Medium","Hard"]:["Low","Moderate","High"];
  const templates=[
    {name:"A passing patrol",kind:"Patrol",difficulty:difficulty||labels[0],species:1,limit:Math.min(4,maxMonsters),hook:"A watchful patrol blocks the route. Give it a purpose, a warning, and somewhere to retreat."},
    {name:"An uneasy crossing",kind:"Skirmish",difficulty:difficulty||labels[1],species:2,limit:maxMonsters,hook:"Both sides need the same crossing. Cover and a reason to move can turn a simple clash into a story."},
    {name:"The solitary guardian",kind:"Elite foe",difficulty:difficulty||labels[2],species:1,limit:1,hook:"A formidable guardian holds a narrow approach. Offer clues to its strength and another way past."},
    {name:"The alarm is raised",kind:"Reinforcements",difficulty:difficulty||labels[1],species:2,limit:Math.max(1,Math.min(4,maxMonsters)),reinforcements:true,hook:"A first group holds the line while help arrives. Deploy the second wave only when its trigger occurs."}
  ];
  return templates.map((template,index)=>{
    const build=label=>generateEncounter(pool,party,{rules,difficulty:label,maxMonsters:template.limit,maxSpecies:template.species},rng);
    const first=build(template.reinforcements?difficulty||labels[0]:template.difficulty);
    const waves=[{id:`suggestion-${index}-opening`,name:template.reinforcements?"The advance guard":"Opening force",trigger:template.reinforcements?"At encounter start":"",notes:"",lines:first.lines}];
    let withinTarget=first.withinTarget;
    if(template.reinforcements){const second=build(template.difficulty);withinTarget&&=second.withinTarget;waves.push({id:`suggestion-${index}-support`,name:"Answering the alarm",trigger:"When the alarm is sounded, or at the GM's chosen round",notes:"Check the party's remaining resources before deploying this wave.",lines:second.lines});}
    const data=normalizeEncounter({schema:2,waves,party,rules,tags:[template.kind],notes:template.hook});
    return {id:`recommendation-${index}`,name:template.name,kind:template.kind,data,withinTarget,
      reason:`${template.difficulty} target for ${party.length} adventurers using ${rules.edition} ${rules.dynamic?"current-resource":"full-strength"} budgets. ${withinTarget?"Each generated group fits its target band.":"Closest available match; review the rating before use."}`,
      caution:[template.reinforcements?"Wave ratings use the same current party snapshot. Attrition and overlapping waves can make the sequence harder.":data.report.warnings.join(" "),data.lines.some(l=>l.monster.environments.includes("Underwater"))?"Includes creatures listed for underwater environments; choose a suitable battlefield.":""].filter(Boolean).join(" ")};
  });
}

export function rankSavedEncounters(entries,party,{rules:inputRules,difficulty="",filters={}}={}){
  if(!party.length)return [];
  const rules=rulesConfig(inputRules),label=difficulty||(rules.edition==="2014"?"Medium":"Moderate"),goal=generationTarget(party,rules,label);
  return entries.map(entry=>{
    const data=normalizeEncounter(entry.data);
    if(filterMonsters(data.lines.map(l=>l.monster),filters).length!==data.lines.length)return null;
    const report=summarizeWaves(data.waves,party,rules);
    const peak=Math.max(...report.waves.map(w=>w.adjustedXP));
    return {...entry,liveReport:report,fit:Math.abs(peak-goal.target)/goal.target,
      reason:`Peak wave is ${report.shown.label} for the current party. Saved ${data.rules.edition} rules are restored when loaded.`};
  }).filter(Boolean).sort((a,b)=>a.fit-b.fit).slice(0,4);
}
