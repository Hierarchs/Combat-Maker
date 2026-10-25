export const ID = "combat-maker";
export const MAX_MONSTERS = 100;
export const DEFAULT_RULES = Object.freeze({ edition: "2024", mode: "official", dynamic: true });

// Numerical game data from the 2014 Basic Rules and SRD 5.1/5.2. See THIRD_PARTY.md.
export const THRESHOLDS_2014 = [null,
  [25,50,75,100], [50,100,150,200], [75,150,225,400], [125,250,375,500],
  [250,500,750,1100], [300,600,900,1400], [350,750,1100,1700], [450,900,1400,2100],
  [550,1100,1600,2400], [600,1200,1900,2800], [800,1600,2400,3600], [1000,2000,3000,4500],
  [1100,2200,3400,5100], [1250,2500,3800,5700], [1400,2800,4300,6400], [1600,3200,4800,7200],
  [2000,3900,5900,8800], [2100,4200,6300,9500], [2400,4900,7300,10900], [2800,5700,8500,12700]
];
export const BUDGETS_2024 = [null,
  [50,75,100], [100,150,200], [150,225,400], [250,375,500], [500,750,1100],
  [600,1000,1400], [750,1300,1700], [1000,1700,2100], [1300,2000,2600], [1600,2300,3100],
  [1900,2900,4100], [2200,3700,4700], [2600,4200,5400], [2900,4900,6200], [3300,5400,7800],
  [3800,6100,9800], [4500,7200,11700], [5000,8700,14200], [5500,10700,17200], [6400,13200,22000]
];
export const CR_XP = new Map([
  [0,10], [0.125,25], [0.25,50], [0.5,100],
  ...[200,450,700,1100,1800,2300,2900,3900,5000,5900,7200,8400,10000,11500,13000,
    15000,18000,20000,22000,25000,33000,41000,50000,62000,75000,90000,105000,120000,
    135000,155000].map((xp,i) => [i+1,xp])
]);
export const SIZE_NAMES = Object.freeze({ tiny:"Tiny", sm:"Small", small:"Small", med:"Medium", medium:"Medium", lg:"Large", large:"Large", huge:"Huge", grg:"Gargantuan", gargantuan:"Gargantuan" });
export const INDEX_FIELDS = ["type", "system.details.cr", "system.details.type", "system.details.source",
  "system.details.environment", "system.details.habitat", "system.details.alignment", "system.details.xp",
  "system.source", "system.traits.size", "system.resources.legact.max", "system.resources.legres.max", `flags.${ID}`];
export const clamp = (v,min,max) => Math.min(max,Math.max(min,v));
export const number = (v,fallback=0) => v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : fallback;
export const formatNumber = v => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(v ?? 0);
export const formatCR = cr => new Map([[0.125,"1/8"],[0.25,"1/4"],[0.5,"1/2"]]).get(cr) ?? String(cr);
export const titleCase = v => String(v ?? "").replace(/(^|[\s-])\S/g,c=>c.toUpperCase());
