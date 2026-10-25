import { ID, MAX_MONSTERS } from "./constants.mjs";
import { resolveReplacement, repairState } from "./repairs.mjs";

const overlaps = (a,b) => a.x < b.x+b.width-1 && a.x+a.width > b.x+1 && a.y < b.y+b.height-1 && a.y+a.height > b.y+1;

/** Place footprints near an origin, accounting for large tokens and occupied spaces. */
export function planPlacement(tokens, {origin,bounds,gridSize=100,occupied=[],snap=p=>p}) {
  const taken=occupied.map(r=>({...r}));
  const placed=[];
  for(const token of tokens) {
    const width=Math.max(0.25,Number(token.width)||1)*gridSize;
    const height=Math.max(0.25,Number(token.height)||1)*gridSize;
    let found=null;
    // Search at most the scene's useful number of grid rings, capped for huge maps.
    const rings=Math.min(150,Math.ceil(Math.max(bounds.width,bounds.height)/gridSize));
    for(let radius=0;radius<=rings && !found;radius++) {
      const points=[];
      if(radius===0) points.push([0,0]);
      else for(let offset=-radius;offset<=radius;offset++) {
        points.push([offset,-radius],[offset,radius]);
        if(Math.abs(offset)<radius) points.push([-radius,offset],[radius,offset]);
      }
      for(const [dx,dy] of points) {
        const point=snap({x:origin.x+dx*gridSize,y:origin.y+dy*gridSize},token);
        const rect={x:point.x,y:point.y,width,height};
        if(rect.x<bounds.x || rect.y<bounds.y || rect.x+width>bounds.x+bounds.width || rect.y+height>bounds.y+bounds.height) continue;
        if(taken.some(r=>overlaps(rect,r))) continue;
        found=rect;break;
      }
    }
    if(!found) throw new Error("There is not enough free space near that point. Choose a larger open area or deploy fewer monsters.");
    taken.push(found);placed.push({...token,x:found.x,y:found.y});
  }
  return placed;
}

export function pickCanvasPoint({signal}={}) {
  if(!canvas?.ready) throw new Error("Open a scene first.");
  if(signal?.aborted)return Promise.resolve(null);
  ui.notifications.info("Combat Forge: click a point on the scene to deploy. Press Escape to cancel.");
  const view=canvas.app.canvas ?? canvas.app.view;
  view.style.cursor="crosshair";
  return new Promise(resolve=> {
    const controller=new AbortController();
    const finish=value=>{controller.abort();view.style.cursor="";signal?.removeEventListener("abort",onAbort);resolve(value);};
    const onAbort=()=>finish(null);
    signal?.addEventListener("abort",onAbort,{once:true});
    view.addEventListener("pointerdown",event=> {
      if(event.button!==0) return;
      event.preventDefault();event.stopImmediatePropagation();
      finish(canvas.canvasCoordinatesFromClient({x:event.clientX,y:event.clientY}));
    },{capture:true,signal:controller.signal});
    document.addEventListener("keydown",event=>{if(event.key==="Escape"){event.stopImmediatePropagation();finish(null);}},{capture:true,signal:controller.signal});
    const hook=Hooks.once("canvasTearDown",()=>finish(null));
    controller.signal.addEventListener("abort",()=>Hooks.off("canvasTearDown",hook));
  });
}

let deploying=false;
export async function deployEncounter(lines, {origin=null,hidden=true,addToCombat=false,rollInitiative=false,encounterId="",waveId="",waveName=""}={}) {
  if(!game.user.isGM) throw new Error("Only a GM can deploy encounters.");
  if(deploying) throw new Error("An encounter is already being deployed.");
  if(!canvas?.ready || !canvas.scene) throw new Error("Open a scene before deploying an encounter.");
  const count=lines.reduce((n,l)=>n+l.quantity,0);
  if(count<1 || count>MAX_MONSTERS || lines.some(l=>!Number.isInteger(l.quantity)||l.quantity<1)) throw new Error(`Deploy between 1 and ${MAX_MONSTERS} monsters.`);
  deploying=true;
  const scene=canvas.scene;
  const imported=[];
  let created=[];
  let newCombat=null;
  let combat=null,combatants=[];
  try {
    // Resolve everything before creating anything. A missing source cannot partially deploy a fight.
    const sources=[];
    const replacements=repairState().replacements;
    for(const line of lines) {
      const actor=await foundry.utils.fromUuid(resolveReplacement(line.monster.uuid,replacements));
      if(!actor || actor.documentName!=="Actor" || actor.type!=="npc") throw new Error(`Cannot find ${line.monster.name}. Re-enable its compendium or replace it in the Forge.`);
      sources.push({line,actor});
    }
    const drafts=[];
    for(const {line,actor:source} of sources) {
      let actor=source;
      if(source.inCompendium || source.pack) {
        actor=game.actors.find(a=>a.getFlag(ID,"sourceUuid")===source.uuid);
        if(!actor) {
          const data=game.actors.fromCompendium(source);
          data.flags??={};data.flags[ID]={...(data.flags[ID]??{}),sourceUuid:source.uuid};
          data.ownership={default:0};
          actor=await foundry.documents.Actor.implementation.create(data,{renderSheet:false});
          if(!actor) throw new Error(`Could not import ${source.name}.`);
          imported.push(actor);
        }
      }
      for(let i=0;i<line.quantity;i++) {
        const token=await actor.getTokenDocument({hidden,actorLink:false,disposition:CONST.TOKEN_DISPOSITIONS.HOSTILE},{parent:scene});
        const data=token.toObject();delete data._id;
        data.flags??={};data.flags[ID]={...(data.flags[ID]||{}),encounterId,waveId,waveName};
        drafts.push({data,document:token});
      }
    }
    const size=canvas.grid.size;
    const rect=canvas.dimensions.sceneRect;
    const bounds={x:rect.x,y:rect.y,width:rect.width,height:rect.height};
    const center=origin ?? canvas.canvasCoordinatesFromClient({x:window.innerWidth/2,y:window.innerHeight/2});
    const near={x:Math.max(bounds.x,Math.min(center.x,bounds.x+bounds.width-size)),y:Math.max(bounds.y,Math.min(center.y,bounds.y+bounds.height-size))};
    const placed=planPlacement(drafts.map(d=>d.data),{
      origin:near,bounds,gridSize:size,
      occupied:[...scene.tokens].map(t=>({x:t.x,y:t.y,width:t.width*size,height:t.height*size})),
      snap:(point,data)=>drafts.find(d=>d.data===data)?.document.getSnappedPosition(point) ?? point
    });
    if(!canvas.ready || canvas.scene.id!==scene.id) throw new Error("The viewed scene changed. Deploy again on the intended scene.");
    created=await scene.createEmbeddedDocuments("Token",placed);
    if(created.length!==count) throw new Error("Foundry did not create every requested token.");
    if(addToCombat||rollInitiative) {
      combat=game.combats.find(c=>c.scene?.id===scene.id && (c.isActive??c.active));
      if(!combat) {combat=await foundry.documents.Combat.implementation.create({scene:scene.id,active:true});newCombat=combat;}
      combatants=await combat.createEmbeddedDocuments("Combatant",created.map(t=>({tokenId:t.id,actorId:t.actorId,sceneId:scene.id,hidden:t.hidden})));
      if(combatants.length!==created.length)throw new Error("Foundry did not create every requested combatant.");
      if(rollInitiative)await combat.rollInitiative(combatants.map(c=>c.id),{updateTurn:true,...(hidden?{messageMode:"gm"}:{})});
    }
    ui.notifications.info(`Combat Forge deployed ${count} monster${count===1?"":"s"}${hidden?" (hidden)":""}.`);
    return created;
  } catch(error) {
    // Best effort rollback; preserve the original error and report cleanup failures.
    const cleanup=[];
    if(combatants.length&&!newCombat)cleanup.push(()=>combat.deleteEmbeddedDocuments("Combatant",combatants.map(c=>c.id)));
    if(created.length) cleanup.push(()=>scene.deleteEmbeddedDocuments("Token",created.map(t=>t.id)));
    if(newCombat) cleanup.push(()=>newCombat.delete());
    const results=[];
    for(const remove of cleanup){try{await remove();results.push({status:"fulfilled"});}catch(error){results.push({status:"rejected",reason:error});}}
    if(results.some(r=>r.status==="rejected")) {
      ui.notifications.warn("Deployment failed and some scene documents could not be removed. Check the scene and combat tracker.");
    } else {
      await Promise.allSettled(imported.map(a=>a.delete()));
    }
    throw error;
  } finally {deploying=false;}
}
