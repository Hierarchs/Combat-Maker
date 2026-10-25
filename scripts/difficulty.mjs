import { BUDGETS_2024, THRESHOLDS_2014, DEFAULT_RULES, clamp } from "./constants.mjs";

export function rulesConfig(value = {}) {
  return { edition: value.edition === "2014" ? "2014" : "2024", mode: value.mode === "swarm" ? "swarm" : "official",
    dynamic: value.dynamic ?? DEFAULT_RULES.dynamic };
}

export function encounterTotals(lines) {
  return lines.reduce((t,line) => {
    const q = Math.max(0,Math.floor(Number(line.quantity) || 0));
    t.count += q; t.xp += line.monster.xp * q; t.cr += line.monster.cr * q;
    return t;
  }, { count:0, xp:0, cr:0 });
}

export function monsterMultiplier(count, partySize) {
  if (count <= 0) return 1;
  const ladder = [0.5,1,1.5,2,2.5,3,4,5];
  let index = count === 1 ? 1 : count === 2 ? 2 : count <= 6 ? 3 : count <= 10 ? 4 : count <= 14 ? 5 : 6;
  index += partySize < 3 ? 1 : partySize >= 6 ? -1 : 0;
  return ladder[clamp(index,0,7)];
}

export function adjustedXP(lines, partySize, rules = DEFAULT_RULES) {
  const {xp,count} = encounterTotals(lines);
  if (!count) return { xp:0, multiplier:1, counted:0, ignored:0 };
  // Optional swarm house rule: creatures below 10% of the strongest creature's XP
  // contribute their XP, but do not increase the action-economy count.
  const strongest = Math.max(...lines.map(l=>l.monster.xp));
  const counted = rules.mode === "swarm"
    ? lines.reduce((n,l)=>n+(l.monster.xp >= strongest*0.1 ? l.quantity : 0),0) : count;
  // 2024 has no official multiple-monster adjustment. The opt-in swarm mode
  // uses the 2014 multiplier ladder to account for many meaningful enemies.
  const multiplier = rules.edition === "2014" || rules.mode === "swarm" ? monsterMultiplier(Math.max(1,counted),partySize) : 1;
  return { xp:Math.round(xp*multiplier), multiplier, counted, ignored:count-counted };
}

export function partyBudgets(party, rules = DEFAULT_RULES, current = false) {
  const table = rules.edition === "2014" ? THRESHOLDS_2014 : BUDGETS_2024;
  const length = rules.edition === "2014" ? 4 : 3;
  return party.reduce((totals,pc)=> {
    const row = table[clamp(Math.round(pc.level),1,20)];
    return totals.map((v,i)=>v+row[i]*(current ? pc.readiness : 1));
  }, Array(length).fill(0));
}

export function ratingFor(xp, budgets, edition) {
  if (xp <= 0) return {label:"Empty",tone:"muted",rank:-1};
  if (!budgets.some(v=>v>0)) return {label:"Overwhelming",tone:"deadly",rank:4};
  if (edition === "2014") {
    const labels = ["Trivial","Easy","Medium","Hard","Deadly"];
    const rank = budgets.reduce((n,b)=>n+(xp >= b ? 1 : 0),0);
    return {label:labels[rank],tone:["muted","low","moderate","high","deadly"][rank],rank};
  }
  // 2024 values are ceilings for spending budgets, rather than 2014 thresholds.
  const rank = xp <= budgets[0] ? 0 : xp <= budgets[1] ? 1 : xp <= budgets[2] ? 2 : 3;
  return {label:["Low","Moderate","High","Over budget"][rank],tone:["low","moderate","high","deadly"][rank],rank};
}

export function assessEncounter(lines, party, inputRules = DEFAULT_RULES) {
  const rules = rulesConfig(inputRules);
  const totals = encounterTotals(lines);
  const adjusted = adjustedXP(lines,party.length,rules);
  const fullBudgets = partyBudgets(party,rules);
  const currentBudgets = partyBudgets(party,rules,true);
  const full = party.length ? ratingFor(adjusted.xp,fullBudgets,rules.edition) : {label:"Add party",tone:"muted"};
  const current = party.length ? ratingFor(adjusted.xp,currentBudgets,rules.edition) : full;
  const totalMax = party.reduce((n,p)=>n+p.maxHP,0);
  const warnings = [];
  if (party.length && lines.some(l=>l.monster.cr > party.reduce((n,p)=>n+p.level,0)/party.length)) {
    warnings.push("A creature's CR exceeds the party's average level; burst damage can be dangerous.");
  }
  if (party.some(p=>p.unavailable)) warnings.push("One or more party members are unable to fight.");
  return {...totals, adjustedXP:adjusted.xp, multiplier:adjusted.multiplier, ignored:adjusted.ignored,
    full, current, shown:rules.dynamic ? current : full, fullBudgets, currentBudgets,
    hpPercent:totalMax ? Math.round(party.reduce((n,p)=>n+Math.min(p.hp,p.maxHP),0)/totalMax*100) : 100,
    bloodied:party.filter(p=>p.hpRatio<=0.5).length,
    readiness:party.length ? party.reduce((n,p)=>n+p.readiness,0)/party.length : 1, warnings};
}

export function generationTarget(party, rules, difficulty) {
  if (!party.length) throw new Error("Add at least one character to the party before balancing by difficulty.");
  const budgets = partyBudgets(party,rules,rules.dynamic);
  const labels = rules.edition === "2014" ? ["Easy","Medium","Hard","Deadly"] : ["Low","Moderate","High"];
  const i = labels.indexOf(difficulty);
  if (i < 0) throw new Error("Choose a difficulty for the selected rules edition.");
  if (rules.edition === "2014") {
    return {target:budgets[i]*1.05, min:budgets[i], max:(budgets[i+1] ?? budgets[i]*1.5)-0.001};
  }
  return {target:budgets[i]*0.95, min:i ? budgets[i-1]+0.001 : 1, max:budgets[i]};
}
