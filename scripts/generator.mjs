import { MAX_MONSTERS, clamp } from "./constants.mjs";
import { adjustedXP, encounterTotals, generationTarget, rulesConfig, monsterMultiplier } from "./difficulty.mjs";
import { filterMonsters } from "./normalize.mjs";

/** Bounded randomized beam search. Never relaxes filters or count/species caps. */
export function generateEncounter(monsters, party, options = {}, rng = Math.random) {
  const rules = rulesConfig(options.rules);
  const maxMonsters = clamp(Math.floor(Number(options.maxMonsters) || 6),1,MAX_MONSTERS);
  const maxSpecies = clamp(Math.floor(Number(options.maxSpecies) || 2),1,maxMonsters);
  const byCR = options.balance === "cr";
  const cr = Number(options.targetCR);
  if (byCR && (!Number.isFinite(cr) || cr <= 0 || cr > 3000)) throw new Error("Total CR must be greater than 0 and at most 3,000.");
  const goal = byCR ? {target:cr,min:cr*0.95,max:cr*1.05}
    : generationTarget(party,rules,options.difficulty || (rules.edition === "2014" ? "Medium" : "Moderate"));
  if (goal.target <= 0) throw new Error("The current party has no available encounter budget. Try CR mode or the full-strength rating.");
  const pool = [...new Map(filterMonsters(monsters,options.filters).map(m=>[m.uuid,m])).values()]
    .filter(m=>byCR ? m.cr > 0 : m.xp > 0);
  if (!pool.length) throw new Error("No monsters match those filters. Choose another source or broaden your filters.");
  const value = lines => byCR ? encounterTotals(lines).cr : adjustedXP(lines,party.length,rules).xp;
  const distance = score => Math.abs(score-goal.target)/goal.target + (score>goal.max ? 0.2 : 0);
  const sorted = [...pool].sort((a,b)=>(byCR?a.cr-b.cr:a.xp-b.xp));
  const result=best=>({lines:best.lines,score:best.score,target:goal.target,withinTarget:best.score>=goal.min && best.score<=goal.max,
    message:best.score>=goal.min && best.score<=goal.max ? "Encounter generated within your target range."
      : "Closest match found. Your filters and monster limits cannot reach the requested target in this search."});
  // All strongest creatures attain the maximum possible CR/XP, including swarm
  // multipliers. No randomized search can improve this provably unreachable case.
  const upper=[{monster:sorted.at(-1),quantity:maxMonsters}],upperScore=value(upper);
  if(upperScore<goal.min)return result({lines:upper,score:upperScore});
  const lower=[{monster:sorted[0],quantity:1}],lowerScore=value(lower);
  if(lowerScore>goal.max)return result({lines:lower,score:lowerScore});
  const multiplied=!byCR&&(rules.edition==="2014"||rules.mode==="swarm");
  let best = null;
  // Preserve representatives across the entire power range for large catalogues.
  const representatives = sorted.length <= 120 ? sorted : Array.from({length:120},(_,i)=>sorted[Math.round(i*(sorted.length-1)/119)]);
  for (let attempt=0; attempt<18; attempt++) {
    const sampled = [...new Map([...representatives,...Array.from({length:40},()=>pool[Math.floor(rng()*pool.length)])]
      .map(m=>[m.uuid,m])).values()];
    let beam = [{lines:[],score:0,xp:0,cr:0,strongest:0}];
    for (let depth=0;depth<maxMonsters;depth++) {
      const unique = new Map();
      for (const state of beam) {
        const candidates = state.lines.length >= maxSpecies ? state.lines.map(l=>l.monster) : sampled;
        for (const monster of candidates) {
          const lines = state.lines.map(l=>({...l}));
          const existing = lines.find(l=>l.monster.uuid===monster.uuid);
          if (existing) existing.quantity++;
          else lines.push({monster,quantity:1});
          const xp=state.xp+monster.xp,cr=state.cr+monster.cr,strongest=Math.max(state.strongest,monster.xp);
          const counted=rules.mode==="swarm"?lines.reduce((n,l)=>n+(l.monster.xp>=strongest*0.1?l.quantity:0),0):depth+1;
          const score=byCR?cr:Math.round(xp*(multiplied?monsterMultiplier(counted,party.length):1));
          const candidate = {lines,score,xp,cr,strongest,distance:distance(score),noise:rng()*0.015};
          if (!best || candidate.distance<best.distance) best=candidate;
          if(score<=goal.max*1.2){
            const key=lines.map(l=>`${l.monster.uuid}:${l.quantity}`).sort().join("|");
            if(!unique.has(key))unique.set(key,candidate);
          }
        }
      }
      beam=[...unique.values()].sort((a,b)=>a.distance-b.distance+a.noise-b.noise).slice(0,12);
      if (!beam.length || (best.score>=goal.min && best.score<=goal.max && Math.abs(best.score-goal.target)<goal.target*0.03)) break;
    }
    if (best && best.score>=goal.min && best.score<=goal.max) break;
  }
  return result(best);
}
