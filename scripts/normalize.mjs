import { CR_XP, ID, SIZE_NAMES, clamp, number, titleCase } from "./constants.mjs";

export function parseCR(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const raw = String(value).trim().replace(/^cr\s*/i, "");
  const fraction = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
  const cr = fraction ? Number(fraction[1]) / Number(fraction[2]) : Number(raw);
  return CR_XP.has(cr) ? cr : null;
}

function environments(value) {
  if (!value) return [];
  if (typeof value === "object" && !Array.isArray(value) && !(value instanceof Set)) {
    return [...environments(value.value), ...environments(value.custom)];
  }
  if (Array.isArray(value) || value instanceof Set) return [...value].flatMap(v => environments(v?.type ?? v));
  return String(value).split(/[,;|]/).map(v => titleCase(v.trim())).filter(Boolean);
}

/** Accepts a full Actor or a compendium index record. Never mutates either. */
export function normalizeMonster(actor, pack = null) {
  if (!actor || actor.type !== "npc") return null;
  const system = actor.system ?? {};
  const flags = actor.flags?.[ID] ?? {};
  const cr = parseCR(system.details?.cr);
  if (cr === null) return null;
  const source = system.source ?? system.details?.source ?? {};
  const book = String(flags.book || (typeof source === "string" ? source : source.book || source.custom)
    || pack?.metadata?.flags?.dnd5e?.sourceBook || pack?.metadata?.label || "Homebrew");
  const explicitEdition = flags.edition || source.rules;
  const edition = ["2014","2024"].includes(String(explicitEdition)) ? String(explicitEdition)
    : /2024|2025|srd\s*5\.2/i.test(book) ? "2024" : /2014|srd\s*5\.1/i.test(book) ? "2014" : "Unknown";
  const rawType = system.details?.type;
  const type = titleCase(typeof rawType === "string" ? rawType : rawType?.value || rawType?.custom || "Unknown");
  const id = actor.id ?? actor._id;
  const uuid = actor.uuid || (pack ? (pack.getUuid?.(id) ?? `Compendium.${pack.collection}.Actor.${id}`) : `Actor.${id}`);
  const xp = number(system.details?.xp?.value, CR_XP.get(cr));
  return {
    uuid, name: String(actor.name || "Unnamed creature"), img: String(actor.img || "icons/svg/mystery-man.svg"),
    cr, xp: Math.max(0,xp), type, subtype: String(rawType?.subtype || ""),
    size: SIZE_NAMES[String(system.traits?.size).toLowerCase()] || titleCase(system.traits?.size || "Unknown"),
    book, edition, alignment: titleCase(system.details?.alignment || "Unknown"),
    environments: [...new Set(environments(flags.environments || system.details?.habitat || system.details?.environment))],
    legendary: number(system.resources?.legact?.max) > 0 || number(system.resources?.legres?.max) > 0,
    swarm: Boolean(rawType?.swarm), pack: pack?.collection || "", packLabel: pack?.metadata?.label || "World / Homebrew"
  };
}

/** Read prepared actor data, including effects, so estimates track the actual sheet. */
export function normalizeCharacter(actor) {
  if (!actor || actor.type !== "character") return null;
  const s = actor.system ?? {};
  const items = actor.items?.contents ?? [...(actor.items ?? [])];
  const classes = items.filter(i => i.type === "class");
  const classLevels = classes.reduce((n,i) => n + number(i.system?.levels),0);
  const level = Math.round(clamp(number(s.details?.level, classLevels || 1),1,20));
  const hp = s.attributes?.hp ?? {};
  const maxHP = Math.max(0,number(hp.effectiveMax, number(hp.max) + number(hp.tempmax)));
  const currentHP = Math.max(0,number(hp.value));
  const hpRatio = maxHP ? clamp((currentHP + Math.max(0,number(hp.temp))) / maxHP,0,1) : 1;
  let slotMax = 0, slotRemaining = 0;
  for (const [key,slot] of Object.entries(s.spells ?? {})) {
    const weight = key === "pact" ? number(slot.level,1) : number(key.replace("spell",""));
    if (weight < 1) continue;
    const max = Math.max(0,number(slot.max, number(slot.override)));
    slotMax += max * weight;
    slotRemaining += clamp(number(slot.value),0,max) * weight;
  }
  const slotRatio = slotMax ? slotRemaining / slotMax : null;
  let resourceMax = 0, resourceRemaining = 0;
  const addResource = (max,remaining) => {
    max = number(max);
    if (max <= 0) return;
    resourceMax += max;
    resourceRemaining += clamp(number(remaining),0,max);
  };
  for (const resource of Object.values(s.resources ?? {})) addResource(resource?.max, resource?.value);
  // Current dnd5e stores consumed item uses in `spent`; legacy systems stored `value`.
  for (const item of items) {
    if (item.type !== "feat") continue;
    const uses = item.system?.uses;
    if (uses) addResource(uses.max, uses.spent !== undefined ? number(uses.max) - number(uses.spent) : uses.value);
  }
  const progression = { full:1, half:0.5, third:1/3, pact:1, artificer:0.5 };
  const fallback = { wizard:1, sorcerer:1, bard:1, cleric:1, druid:1, warlock:1, paladin:0.5, ranger:0.5, artificer:0.5 };
  const casterLevels = classes.reduce((n,i) => n + number(i.system?.levels,1) *
    (progression[i.system?.spellcasting?.progression] ?? fallback[String(i.system?.identifier || i.name).toLowerCase()] ?? 0),0);
  const casterWeight = slotRatio === null ? 0 : clamp(classes.length ? casterLevels / level : 1,0,1);
  const statuses = [...(actor.statuses ?? [])];
  const unavailable = currentHP <= 0 && maxHP > 0 || statuses.some(v => ["dead","unconscious","incapacitated","petrified"].includes(v));
  const resourceRatio = resourceMax ? resourceRemaining/resourceMax : null;
  const exhaustion = clamp(number(s.attributes?.exhaustion?.level ?? s.attributes?.exhaustion),0,6);
  // An advisory capacity model, explicitly distinct from official encounter budgets.
  const hpWeight = 0.6;
  const spellWeight = 0.3 * casterWeight;
  const resourceWeight = resourceRatio === null ? 0 : 0.1;
  const readiness = unavailable ? 0 : clamp((1 - hpWeight*(1-hpRatio) - spellWeight*(1-(slotRatio ?? 1))
    - resourceWeight*(1-(resourceRatio ?? 1))) * Math.max(0.4,1-exhaustion*0.08),0.1,1);
  return {
    uuid: actor.uuid || `Actor.${actor.id ?? actor._id}`, name: String(actor.name), img: actor.img || "icons/svg/mystery-man.svg",
    level, classes: classes.map(i => `${i.name} ${number(i.system?.levels,1)}`).join(" / ") || "Character",
    hp: currentHP, maxHP, tempHP: number(hp.temp), hpRatio, slotRatio, resourceRatio, exhaustion, readiness, unavailable,
    notes: [unavailable ? "Unable to fight" : "", exhaustion ? `Exhaustion ${exhaustion}` : ""].filter(Boolean)
  };
}

export function filterMonsters(monsters, filters = {}) {
  const search = String(filters.search || "").toLowerCase().trim();
  const min = filters.minCR === "" || filters.minCR === undefined ? null : parseCR(filters.minCR);
  const max = filters.maxCR === "" || filters.maxCR === undefined ? null : parseCR(filters.maxCR);
  if ((filters.minCR && min === null) || (filters.maxCR && max === null)) return [];
  return monsters.filter(m => {
    if (search && !`${m.name} ${m.book} ${m.packLabel}`.toLowerCase().includes(search)) return false;
    for (const key of ["type","size","book","edition","alignment","pack"]) {
      if (filters[key] && filters[key] !== m[key]) return false;
    }
    if (filters.environment && !m.environments.includes(filters.environment)) return false;
    if (filters.legendary && m.legendary !== (filters.legendary === "yes")) return false;
    return (min === null || m.cr >= min) && (max === null || m.cr <= max);
  });
}

export function facets(monsters) {
  const result = {};
  for (const key of ["type","size","book","edition","alignment"]) {
    result[key] = [...new Set(monsters.map(m=>m[key]))].sort((a,b)=>a.localeCompare(b));
  }
  result.environment = [...new Set(monsters.flatMap(m=>m.environments))].sort();
  return result;
}
