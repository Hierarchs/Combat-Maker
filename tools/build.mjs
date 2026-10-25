import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "fflate";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const manifest=JSON.parse(await readFile(path.join(root,"module.json"),"utf8"));
const files={};
async function add(relative) {
  const absolute=path.join(root,relative);
  const stat=await import("node:fs/promises").then(fs=>fs.stat(absolute));
  if(stat.isDirectory())for(const name of await readdir(absolute))await add(`${relative}/${name}`);
  else files[`combat-maker/${relative}`]=new Uint8Array(await readFile(absolute));
}
for(const name of ["module.json","scripts","styles","assets","docs","README.md","LICENSE","THIRD_PARTY.md"])await add(name);
files["combat-maker/VERSION.txt"]=strToU8(`${manifest.title} ${manifest.version}\nFoundry VTT 14 / D&D5e\n`);
await mkdir(path.join(root,"dist"),{recursive:true});
await writeFile(path.join(root,"dist/combat-maker.zip"),zipSync(files,{level:9}));
await writeFile(path.join(root,"dist/module.json"),JSON.stringify(manifest,null,2)+"\n");
process.stdout.write(`Built dist/combat-maker.zip (${Object.keys(files).length} files), version ${manifest.version}\n`);
