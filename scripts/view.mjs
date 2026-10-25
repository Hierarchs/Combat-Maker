import { formatCR, formatNumber as num } from "./constants.mjs";

export const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const e=escapeHTML;
const SYMBOLS = {
  'feather-pointed':'<path d="M4 20 16 8m-9 9-2-6L16 1l7 1-1 7-11 10-4-2Zm5-5h6m-2-4h6"/>',
  'arrow-right':'<path d="M3 12h18m-7-7 7 7-7 7"/>',
  copy:'<rect x="8" y="8" width="13" height="13" rx="1"/><path d="M16 4V2H2v14h2"/>',
  'circle-check':'<circle cx="12" cy="12" r="10"/><path d="m7 12 3 3 7-7"/>',
  hammer:'<path d="m4 20 9-9m-3-5 4-4 8 8-4 4-3-3-4 4-4-4 4-4Z"/>',
  vault:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="5"/><path d="M12 7v3m0 4v3m-5-5h3m4 0h3M5 6h1m12 12h1"/>',
  books:'<path d="M3 4h5v17H3Zm7 0h5v17h-5Zm6 1 4-1 4 16-4 1Z"/>',
  'book-open':'<path d="M12 5C8 2 4 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-3-2-7-2-10 1Zm0 0v15"/>',
  dragon:'<path d="m3 20 6-1 3-5 6 1 3-5-5-7-4 2 2 5-6 1-3 5-3 1 1 3Zm9-6-1-9-6 4 3 2m8-4h1m-3 8 3 5h4"/>',
  users:'<circle cx="9" cy="7" r="4"/><path d="M1 21v-3a8 8 0 0 1 16 0v3m0-18a4 4 0 0 1 0 8m3 3a7 7 0 0 1 3 6"/>',
  'user-plus':'<circle cx="8" cy="7" r="4"/><path d="M1 21v-3a7 7 0 0 1 14 0v3m4-15v8m-4-4h8"/>',
  xmark:'<path d="m6 6 12 12M6 18 18 6"/>',
  plus:'<path d="M12 4v16M4 12h16"/>',minus:'<path d="M4 12h16"/>',
  'floppy-disk':'<path d="M3 3h15l3 3v15H3Zm4 0v6h10V3M7 21v-8h10v8"/>',
  'circle-info':'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>',
  'circle-question':'<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 1 1 4 3c-1 1-1 2-1 3m0 3h.01"/>',
  'heart-pulse':'<path d="M12 21 3 12A6 6 0 0 1 12 4a6 6 0 0 1 9 8Zm-9-9h5l2-4 4 8 2-4h5"/>',
  'triangle-exclamation':'<path d="m12 2 11 19H1Zm0 6v6m0 3h.01"/>',
  'chess-rook':'<path d="M5 2v6l3 3v7H5v4h14v-4h-3v-7l3-3V2h-4v4h-2V2h-2v4H9V2Zm3 16h8"/>',
  'magnifying-glass':'<circle cx="10" cy="10" r="7"/><path d="m15 15 7 7"/>',
  'arrows-rotate':'<path d="M21 10a9 9 0 0 0-15-6L3 7m0-5v5h5M3 14a9 9 0 0 0 15 6l3-3m0 5v-5h-5"/>',
  sliders:'<path d="M5 2v6m0 4v10M12 2v12m0 4v4M19 2v2m0 4v14M2 8h6v4H2Zm7 6h6v4H9Zm7-10h6v4h-6Z"/>',
  'dice-d20':'<path d="m12 2 10 6v9l-10 5L2 17V8Zm0 0L7 16h10Zm-10 6 5 8 5 6 5-6 5-8M7 16H2m15 0h5M2 8h20"/>',
  'caret-up':'<path d="m7 15 5-6 5 6"/>','caret-down':'<path d="m7 9 5 6 5-6"/>',
  'chevron-left':'<path d="m15 5-7 7 7 7"/>','chevron-right':'<path d="m9 5 7 7-7 7"/>',
  eye:'<path d="M1 12C6 2 18 2 23 12 18 22 6 22 1 12Z"/><circle cx="12" cy="12" r="3"/>',
  crown:'<path d="m2 5 5 5 5-7 5 7 5-5-3 15H5Zm3 11h14"/>',
  bookmark:'<path d="M5 3h14v19l-7-5-7 5Z"/>',
  'arrow-up-right-from-square':'<path d="M14 3h7v7m0-7L11 13M10 3H3v18h18v-7"/>',
  spinner:'<path d="M12 2a10 10 0 1 1-10 10"/>',check:'<path d="m3 12 6 6L21 5"/>'
};
export const icon = name => `<svg class="cf-symbol cf-symbol-${e(name)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SYMBOLS[name]||SYMBOLS["circle-info"]}</svg>`;
export const button = (action,label,symbol,attrs="") => `<button type="button" data-cf-action="${e(action)}" ${attrs}>${symbol?icon(symbol):""}<span>${e(label)}</span></button>`;
export const iconButton = (action,label,symbol,attrs="") => `<button type="button" class="cf-icon-button" data-cf-action="${e(action)}" title="${e(label)}" aria-label="${e(label)}" ${attrs}>${icon(symbol)}</button>`;
export const portrait = (img,name,extra="") => `<img class="cf-portrait ${extra}" src="${e(img)}" alt="" loading="lazy" data-fallback="true" title="${e(name)}">`;
export const select = (name,label,values,selected="",empty="Any",attrs="") => `<label class="cf-select-label"><span>${e(label)}</span><select name="${e(name)}" aria-label="${e(label)}" ${attrs}>${empty!==null?`<option value="">${e(empty)}</option>`:""}${values.map(v=>`<option value="${e(v.value??v)}" ${(v.value??v)===selected?"selected":""}>${e(v.label??v)}</option>`).join("")}</select></label>`;

export function partyHTML(party,missing=[]) {
  if(!party.length && !missing.length) return `<div class="cf-empty cf-party-empty">${icon("users")}<strong>Your adventurers go here</strong><span>Drop character actors here, or choose your party below.</span></div>`;
  return party.map(p=>`<div class="cf-party-row" data-uuid="${e(p.uuid)}">
    <button class="cf-image-button" type="button" data-cf-action="sheet" data-uuid="${e(p.uuid)}" title="Open ${e(p.name)}">${portrait(p.img,p.name)}</button>
    <div class="cf-party-info"><strong>${e(p.name)}</strong><span title="${e(p.classes)}">Level ${p.level} · ${num(p.hp)}/${num(p.maxHP)} HP <b class="${p.hpRatio<=0.5?"cf-text-high":""}">${Math.round(p.hpRatio*100)}%</b></span>
    <div class="cf-hp-track" role="meter" aria-label="${e(p.name)} hit points" aria-valuenow="${Math.round(p.hpRatio*100)}" aria-valuemin="0" aria-valuemax="100"><span class="${p.hpRatio<=0.5?"cf-hp-low":""}" style="width:${Math.round(p.hpRatio*100)}%"></span></div>
    <small>${p.slotRatio!==null?`Slots ${Math.round(p.slotRatio*100)}% · `:""}${Math.round(p.readiness*100)}% ready${p.notes.length?` · ${e(p.notes.join(", "))}`:""}</small></div>
    ${iconButton("remove-party",`Remove ${p.name}`,"xmark",`data-uuid="${e(p.uuid)}"`)}</div>`).join("")
    +missing.map(p=>`<div class="cf-party-row cf-missing"><span>Missing actor: ${e(p)}</span>${iconButton("remove-party","Remove missing actor","xmark",`data-uuid="${e(p)}"`)}</div>`).join("");
}

export function encounterLinesHTML(lines) {
  if(!lines.length) return `<div class="cf-empty cf-encounter-empty">${icon("dragon")}<strong>An encounter starts with a creature</strong><span>Click a monster to add it, or let the generator build a fight.</span></div>`;
  return lines.map(l=>`<div class="cf-encounter-row" data-uuid="${e(l.monster.uuid)}">
    <button class="cf-image-button" type="button" data-cf-action="sheet" data-uuid="${e(l.monster.uuid)}" title="Open creature sheet">${portrait(l.monster.img,l.monster.name)}</button>
    <div class="cf-line-info"><strong title="${e(l.monster.name)}">${e(l.monster.name)}</strong><small>CR ${formatCR(l.monster.cr)} · ${num(l.monster.xp)} XP${l.missing?" · Source missing":""}</small></div>
    <div class="cf-stepper">${iconButton("decrement","Remove one","minus",`data-uuid="${e(l.monster.uuid)}"`)}<input aria-label="Quantity of ${e(l.monster.name)}" data-quantity="${e(l.monster.uuid)}" type="number" min="1" max="100" value="${l.quantity}">${iconButton("increment","Add one","plus",`data-uuid="${e(l.monster.uuid)}"`)}</div>
    ${iconButton("remove-monster","Remove creature","xmark",`data-uuid="${e(l.monster.uuid)}"`)}</div>`).join("");
}

export function summaryHTML(report,rules,hasParty) {
  return `<div class="cf-summary-stats"><span>Monsters <strong>${num(report.count)}</strong></span><span>Total XP <strong>${num(report.xp)}</strong></span></div>
  <button type="button" class="cf-difficulty" data-cf-action="explain" title="See the difficulty calculation">
    <div class="cf-difficulty-top"><span>${e(rules.edition)} · ${rules.mode==="official"?"DMG":"Swarm adjusted"}</span>${icon("circle-info")}</div>
    <div class="cf-rating"><span>Full <b class="cf-text-${report.full.tone}">${e(report.full.label)}</b></span><span class="cf-arrow">→</span><span>${rules.dynamic?"Now":"Rating"} <b class="cf-text-${report.shown.tone}">${e(report.shown.label)}</b></span></div>
    <small>${num(report.adjustedXP)} ${report.multiplier!==1?`adjusted XP · ×${report.multiplier}`:"XP budget used"}</small>
    <div class="cf-budget-track"><span class="cf-bg-${report.shown.tone}" style="width:${Math.min(100,report.currentBudgets.at(-1)>0?report.adjustedXP/(rules.dynamic?report.currentBudgets.at(-1):report.fullBudgets.at(-1))*100:0)}%"></span></div>
  </button>
  ${hasParty?`<div class="cf-party-state">${icon("heart-pulse")} Party at <strong>${report.hpPercent}% HP</strong>${report.bloodied?` · ${report.bloodied} bloodied`:""}${rules.dynamic?`<span>Estimated capacity ${Math.round(report.readiness*100)}%</span>`:""}</div>`:""}
  ${report.warnings.length?`<div class="cf-warning" title="${e(report.warnings.join(" "))}">${icon("triangle-exclamation")} ${e(report.warnings[0])}</div>`:""}
  ${button("deploy","Deploy encounter","chess-rook",`class="cf-primary cf-deploy" ${!report.count?"disabled":""}`)}`;
}

export function monsterRowsHTML(monsters) {
  return monsters.map(m=>`<tr tabindex="0" role="button" data-cf-action="add-monster" data-uuid="${e(m.uuid)}" aria-label="Add ${e(m.name)} to encounter" title="Click to add · Use the eye to view its sheet">
  <td><div class="cf-monster-name">${portrait(m.img,m.name)}<div><strong>${e(m.name)}</strong><small title="${e(m.packLabel)}">${e(m.book)}</small></div></div></td>
  <td class="cf-cr">${formatCR(m.cr)}</td><td>${e(m.type)}${m.subtype?`<small class="cf-subtype">${e(m.subtype)}</small>`:""}${m.legendary?`<span class="cf-legendary" title="Legendary creature">${icon("crown")}</span>`:""}</td>
  <td>${e(m.size)}</td><td class="cf-numeric">${num(m.xp)}</td><td><span class="cf-edition cf-edition-${e(m.edition)}">${m.edition==="Unknown"?"—":e(m.edition)}</span></td>
  <td class="cf-row-actions">${iconButton("sheet",`View ${m.name}`,"eye",`data-uuid="${e(m.uuid)}"`)}${iconButton("repair-monster",`Edit metadata for ${m.name}`,"feather-pointed",`data-uuid="${e(m.uuid)}"`)}</td></tr>`).join("");
}

export function vaultHTML(entries) {
  if(!entries.length) return `<div class="cf-vault-empty cf-empty">${icon("vault")}<h2>Your stories, ready for the table.</h2><p>Save an encounter in the Forge and it will be waiting here.</p>${button("tab-forge","Build an encounter","hammer","class=\"cf-primary\"")}</div>`;
  return `<div class="cf-vault-grid">${entries.map(entry=> {
    const r=entry.data.report;
    return `<article class="cf-vault-card"><header><button type="button" class="cf-card-title" data-cf-action="detail" data-id="${e(entry.id)}" title="${e(entry.name)}">${e(entry.name)}</button><div>${iconButton("load","Load into Forge","hammer",`data-id="${e(entry.id)}"`)}${iconButton("deploy-saved","Deploy saved encounter","chess-rook",`data-id="${e(entry.id)}"`)}${iconButton("delete-saved","Delete saved encounter","xmark",`data-id="${e(entry.id)}"`)}</div></header>
    <button class="cf-card-monsters" type="button" data-cf-action="detail" data-id="${e(entry.id)}">${entry.data.lines.slice(0,4).map(l=>`<span>${portrait(l.monster.img,l.monster.name)}<b>${l.quantity}×</b> ${e(l.monster.name)}<small>CR ${formatCR(l.monster.cr)}</small></span>`).join("")}${entry.data.lines.length>4?`<small>+ ${entry.data.lines.length-4} more species</small>`:""}</button>
    <dl><div><dt>Monsters</dt><dd>${num(r?.count??entry.data.lines.reduce((n,l)=>n+l.quantity,0))}</dd></div><div><dt>Total XP</dt><dd>${num(r?.xp)}</dd></div><div><dt>Difficulty at save</dt><dd class="cf-text-${e(r?.shown?.tone||"muted")}">${e(entry.data.rules.edition)} ${e(r?.shown?.label||"Unrated")}</dd></div><div><dt>Party</dt><dd title="${e(entry.data.party.map(p=>p.name).join(", "))}">${e(entry.data.party.map(p=>p.name).join(", ")||"No party")}</dd></div></dl>
    <footer><span>${new Date(entry.data.updatedAt).toLocaleDateString()}</span>${button("detail","View encounter","arrow-up-right-from-square",`data-id="${e(entry.id)}"`)}</footer></article>`;
  }).join("")}</div>`;
}

export function shellHTML(state) {
  const {tab,party,missingParty,lines,report,rules,facets:f,filters,monsters,totalMatches,catalog,entries,page,pageSize}=state;
  const pages=Math.max(1,Math.ceil(totalMatches/pageSize));
  return `<nav class="cf-tabs" aria-label="Combat Forge views"><div role="tablist">${button("tab-forge","The Forge","hammer",`role="tab" aria-selected="${tab==="forge"}" class="${tab==="forge"?"cf-active":""}"`)}${button("tab-vault","The Vault","vault",`role="tab" aria-selected="${tab==="vault"}" class="${tab==="vault"?"cf-active":""}"`)}<span class="cf-vault-count">${entries.length}</span>${button("tab-health","The Ledger","book-open",`role="tab" aria-selected="${tab==="health"}" class="${tab==="health"?"cf-active":""}"`)}</div><span class="cf-tagline">A chronicle of creatures & encounters</span>${iconButton("help","Help and shortcuts","circle-question")}</nav>
  <div class="cf-body ${tab!=="forge"?"cf-hidden":""}" role="tabpanel" aria-label="The Forge">
    <aside class="cf-sidebar"><section class="cf-party" data-drop="party"><header class="cf-section-header"><h2>Party <span>${party.length}</span></h2><div>${iconButton("choose-party","Choose party","user-plus")}${iconButton("clear-party","Clear party","xmark")}</div></header><div class="cf-party-list" data-scroll="party">${partyHTML(party,missingParty)}</div><button type="button" class="cf-add-party" data-cf-action="choose-party">${icon("plus")} Choose adventurers <span>or drop character actors</span></button></section>
    <section class="cf-encounter" data-drop="encounter"><header class="cf-section-header"><h2>Encounter</h2><div>${button("save","Save","floppy-disk",!lines.length?"disabled":"")}${iconButton("clear-encounter","Clear encounter","xmark")}</div></header>${state.loadedName?`<div class="cf-loaded">${icon("bookmark")} ${e(state.loadedName)}${state.dirty?" <b>· edited</b>":""}</div>`:""}<div class="cf-encounter-list" data-scroll="encounter">${encounterLinesHTML(lines)}</div></section>
    <section class="cf-summary">${summaryHTML(report,rules,party.length>0)}</section></aside>
    <main class="cf-browser" data-drop="catalog"><div class="cf-toolbar"><div class="cf-search">${icon("magnifying-glass")}<input name="search" type="search" placeholder="Search name or book…" aria-label="Search monsters" value="${e(filters.search)}"><kbd>/</kbd></div><span class="cf-monster-count">${num(catalog.monsters.length)} creatures</span>${iconButton("refresh","Re-index compendiums","arrows-rotate",catalog.running?"disabled":"")}${iconButton("sources","Compendium sources","books")}${iconButton("rules","Rules and difficulty settings","sliders")}${button("generate","Generate","dice-d20","class=\"cf-generate-button\"")}</div>
    <div class="cf-filters">${["type","size","book","edition","alignment","environment"].map(k=>select(k,k[0].toUpperCase()+k.slice(1),f[k]||[],filters[k],k[0].toUpperCase()+k.slice(1),"data-filter")).join("")}${select("legendary","Legendary",[{value:"yes",label:"Legendary"},{value:"no",label:"Non-legendary"}],filters.legendary,"Legendary","data-filter")}<label class="cf-cr-range"><span>CR</span><input name="minCR" aria-label="Minimum CR" placeholder="min" value="${e(filters.minCR)}" data-filter><span>–</span><input name="maxCR" aria-label="Maximum CR" placeholder="max" value="${e(filters.maxCR)}" data-filter></label>${button("clear-filters","Reset",null,"class=\"cf-reset\"")}</div>
    ${state.progress?`<div class="cf-index-status" role="status">${icon("spinner")} Indexing ${e(state.progress.label)} · ${state.progress.done}/${state.progress.total}</div>`:""}
    ${catalog.errors.length?`<button type="button" class="cf-index-warning" data-cf-action="sources">${icon("triangle-exclamation")} ${catalog.errors.length} source${catalog.errors.length===1?"":"s"} need attention. View sources.</button>`:""}
    <div class="cf-table-scroll" data-scroll="monsters"><table class="cf-monster-table"><thead><tr>${[["name","Name / Book"],["cr","CR"],["type","Type"],["size","Size"],["xp","XP"],["edition","Edition"]].map(([key,label])=>`<th scope="col" aria-sort="${state.sort===key?(state.desc?"descending":"ascending"):"none"}"><button type="button" data-cf-action="sort" data-key="${key}" class="${state.sort===key?"cf-sorted":""}">${label}${state.sort===key?icon(state.desc?"caret-down":"caret-up"):""}</button></th>`).join("")}<th scope="col"><span class="cf-sr-only">Actions</span></th></tr></thead><tbody>${monsterRowsHTML(monsters)}</tbody></table>
    ${!monsters.length?`<div class="cf-empty cf-catalog-empty">${icon(catalog.monsters.length?"magnifying-glass":"books")}<h3>${catalog.running?"Indexing your bestiary…":catalog.monsters.length?"No creatures match":"Build your bestiary"}</h3><p>${catalog.monsters.length?"Try another filter or search term.":"Choose installed Actor compendiums, or drop a homebrew NPC into this window."}</p>${button(catalog.monsters.length?"clear-filters":"sources",catalog.monsters.length?"Clear filters":"Choose sources","sliders")}</div>`:""}</div>
    <footer class="cf-browser-footer"><span>${totalMatches?`${num(page*pageSize+1)}–${num(Math.min((page+1)*pageSize,totalMatches))} of ${num(totalMatches)}`:"0"} matching · Drop NPC actors to add homebrew</span><div>${iconButton("previous-page","Previous page","chevron-left",page===0?"disabled":"")}<span>${page+1} / ${pages}</span>${iconButton("next-page","Next page","chevron-right",page>=pages-1?"disabled":"")}</div></footer></main>
  </div><main class="cf-vault ${tab!=="vault"?"cf-hidden":""}" role="tabpanel" aria-label="The Vault"><header class="cf-vault-header"><div><span class="cf-eyebrow">THE VAULT</span><h2>Encounters worth keeping.</h2></div><span>${entries.length} saved encounter${entries.length===1?"":"s"}</span></header>${vaultHTML(entries)}</main>
  <main class="cf-ledger ${tab!=="health"?"cf-hidden":""}" role="tabpanel" aria-label="The Bestiary Ledger">${state.ledgerHTML||""}</main>
  <div class="cf-toast ${state.toast?"":"cf-hidden"}" role="status">${e(state.toast)}</div><dialog class="cf-dialog" aria-label="Combat Forge dialog"></dialog>`;
}
