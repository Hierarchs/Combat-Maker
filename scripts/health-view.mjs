import { formatCR, formatNumber as num } from "./constants.mjs";
import { escapeHTML as e, icon, button, iconButton, portrait, select } from "./view.mjs";

const issuesHTML = record => record.issues.map(issue=>`<span class="cf-issue cf-issue-${issue.severity}" data-field="${issue.field}">${e(issue.label)}</span>`).join("") || '<span class="cf-healthy">Complete metadata</span>';
const recordName = record => `<div class="cf-health-name">${portrait(record.img,record.name)}<span><strong>${e(record.name)}</strong><small>${record.description.cr===null?"CR unknown":`CR ${formatCR(record.description.cr)}`} · ${e(record.description.type)} · ${e(record.description.edition)}</small></span></div>`;

export function healthHTML(catalog,state={}) {
  const section=state.section||"metadata",search=String(state.search||"").toLowerCase(),filter=state.filter||"issues";
  const records=catalog.records;
  const groups=catalog.duplicates;
  const unresolved=catalog.referenceCount;
  const activeGroups=groups.filter(g=>g.active>1).length;
  const hidden=records.filter(r=>r.hidden);
  const matches=r=>(!search||`${r.name} ${r.packLabel} ${r.description.book} ${r.uuid}`.toLowerCase().includes(search))&&(!state.pack||r.pack===state.pack);
  let content="",count=0;
  const pageSize=40;
  const slice=items=> {
    count=items.length;
    const page=Math.max(0,Math.min(state.page||0,Math.ceil(count/pageSize)-1));
    return {items:items.slice(page*pageSize,(page+1)*pageSize),page};
  };
  let page=0;
  if(section==="metadata"||section==="hidden") {
    const list=records.filter(r=>matches(r)&&(section==="hidden"?r.hidden:!r.hidden))
      .filter(r=>section==="hidden"||filter==="all"||filter==="corrected"&&r.corrected||filter==="issues"&&r.issues.length||r.issues.some(i=>i.field===filter))
      .sort((a,b)=>Number(!b.monster)-Number(!a.monster)||a.name.localeCompare(b.name));
    const paged=slice(list);page=paged.page;
    content=`<div class="cf-health-table-wrap"><table class="cf-health-table"><thead><tr><th>Creature</th><th>Source</th><th>${section==="hidden"?"Visibility":"Attention"}</th><th>Action</th></tr></thead><tbody>${paged.items.map(r=>`<tr data-health-uuid="${e(r.uuid)}"><td>${recordName(r)}</td><td><strong>${e(r.packLabel)}</strong><small>${e(r.description.book)}${!r.knownBook?" · pack label fallback":""}</small></td><td><div class="cf-issue-list">${section==="hidden"?'<span class="cf-issue">Hidden from bestiary</span>':issuesHTML(r)}${r.corrected?'<span class="cf-correction-seal">Locally corrected</span>':""}</div></td><td><div class="cf-health-row-actions">${button("repair-monster","Edit","feather-pointed",`data-uuid="${e(r.uuid)}"`)}${section==="hidden"?button("restore-monster","Restore","eye",`data-uuid="${e(r.uuid)}"`):""}</div></td></tr>`).join("")}</tbody></table></div>`;
  } else if(section==="duplicates") {
    const paged=slice(groups.filter(g=>g.items.some(matches)));page=paged.page;
    content=`<p class="cf-health-note">Candidates share a name, CR, edition, type, and size. Their full stat blocks may differ. Keep both, or choose a preferred copy to hide the others from this module.</p><div class="cf-duplicate-list">${paged.items.map(g=>`<article class="cf-duplicate-card"><header><h3>${e(g.items[0].name)}</h3><span>${g.active>1?`${g.active} visible copies`:"Preference applied"} · CR ${formatCR(g.items[0].monster.cr)} · ${e(g.items[0].monster.edition)}</span></header>${g.items.map(r=>`<div class="cf-duplicate-row ${r.hidden?"cf-duplicate-hidden":""}">${recordName(r)}<span class="cf-duplicate-source"><strong>${e(r.packLabel)}</strong><small>${e(r.uuid)}</small></span>${r.hidden?button("restore-monster","Restore","eye",`data-uuid="${e(r.uuid)}"`):button("prefer-monster","Prefer this copy","check",`data-uuid="${e(r.uuid)}"`)}</div>`).join("")}</article>`).join("")}</div>`;
  } else {
    const paged=slice(catalog.references.filter(r=>!search||`${r.name} ${r.uuid} ${r.replacementName||""} ${r.uses.join(" ")}`.toLowerCase().includes(search)));page=paged.page;
    content=`<p class="cf-health-note">A replacement applies wherever the old actor UUID is used by Combat Forge, including saved encounters. The original journals and source packs are kept. Re-save a loaded encounter to store its new actor references.</p><div class="cf-reference-list">${paged.items.map(r=>`<article class="cf-reference-card" data-reference-uuid="${e(r.uuid)}"><div><span class="cf-issue cf-issue-${r.status==="mapped"?"resolved":"error"}">${r.status==="mapped"?"Replacement active":r.status==="invalid"?"Invalid metadata":"Missing actor"}</span><h3>${e(r.name)}</h3><code>${e(r.uuid)}</code><small>${e(r.uses.join(" · "))}</small>${r.replacementName?`<p>${icon("arrow-right")} ${e(r.replacementName)} <small>${e(r.resolvedUuid)}</small></p>`:""}<p>${e(r.message)}</p></div><div class="cf-reference-actions">${r.status==="invalid"?button("repair-monster","Repair metadata","feather-pointed",`data-uuid="${e(r.resolvedUuid)}"`):""}${button("replace-reference",r.status==="mapped"?"Change replacement":"Choose replacement","arrows-rotate",`data-uuid="${e(r.uuid)}"`)}${r.resolvedUuid&&r.resolvedUuid!==r.uuid?button("remove-replacement","Remove mapping","xmark",`data-uuid="${e(r.uuid)}"`):""}</div></article>`).join("")}</div>`;
  }
  if(!count)content=`<div class="cf-empty cf-ledger-empty">${icon(section==="duplicates"?"copy":"circle-check")}<h3>${section==="references"?"No broken references found":section==="duplicates"?"No duplicate candidates":section==="hidden"?"No hidden creatures":"No matching metadata issues"}</h3><p>${section==="metadata"?"Change the filters to inspect every creature or review your saved corrections.":"Your current sources and scan determine what appears here."}</p></div>`;
  const packs=[...new Map(records.filter(r=>r.pack).map(r=>[r.pack,{value:r.pack,label:r.packLabel}])).values()].sort((a,b)=>a.label.localeCompare(b.label));
  return `<header class="cf-ledger-header"><div><span class="cf-eyebrow">THE BESTIARY LEDGER</span><h2>Set the record straight.</h2><p>Review your sources. Amend their catalogue entries. Keep the original volumes intact.</p></div><div>${button("sources","Sources","books")}${button("audit-health",state.scanning?"Scanning…":"Scan again","arrows-rotate",state.scanning?"disabled":"")}</div></header>
  <div class="cf-ledger-totals"><div><strong>${num(records.length)}</strong><span>NPCs examined</span></div><div><strong>${num(catalog.issueCount)}</strong><span>Need metadata</span></div><div><strong>${num(activeGroups)}</strong><span>Duplicate groups</span></div><div><strong>${num(unresolved)}</strong><span>Broken references</span></div></div>
  <nav class="cf-ledger-tabs" aria-label="Ledger sections">${[["metadata","Metadata",catalog.issueCount],["duplicates","Duplicates",activeGroups],["references","References",unresolved],["hidden","Hidden",hidden.length]].map(([key,label,n])=>button("health-section",`${label} · ${n}`,null,`data-section="${key}" aria-pressed="${section===key}" class="${section===key?"cf-active":""}"`)).join("")}</nav>
  <div class="cf-ledger-controls"><div class="cf-search">${icon("magnifying-glass")}<input name="healthSearch" type="search" placeholder="Search the ledger…" aria-label="Search ledger" value="${e(state.search||"")}"></div>${section!=="references"?select("healthPack","Source",packs,state.pack||"","All sources"):""}${section==="metadata"?select("healthFilter","Show",[{value:"issues",label:"Needs attention"},{value:"cr",label:"Missing / invalid CR"},{value:"book",label:"Missing book"},{value:"edition",label:"Unknown edition"},{value:"environment",label:"Missing environment"},{value:"corrected",label:"Locally corrected"},{value:"all",label:"All NPCs"}],filter,null):""}</div>
  ${catalog.errors.length?`<div class="cf-health-source-errors">${catalog.errors.map(err=>`<p>${icon("triangle-exclamation")} <strong>${e(err.name)}</strong> — ${e(err.message)}</p>`).join("")}</div>`:""}
  <div class="cf-ledger-content" data-scroll="ledger">${content}</div><footer class="cf-ledger-footer"><span>${num(count)} result${count===1?"":"s"}${catalog.auditedAt?` · References checked ${new Date(catalog.auditedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`:" · References have not been scanned"}</span><div>${iconButton("health-prev","Previous ledger page","chevron-left",page===0?"disabled":"")}<span>${page+1} / ${Math.max(1,Math.ceil(count/pageSize))}</span>${iconButton("health-next","Next ledger page","chevron-right",(page+1)*pageSize>=count?"disabled":"")}</div></footer>`;
}
