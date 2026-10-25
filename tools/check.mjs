import { readFile, readdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const manifest=JSON.parse(await readFile(path.join(root,"module.json"),"utf8"));
const pkg=JSON.parse(await readFile(path.join(root,"package.json"),"utf8"));
assert.equal(manifest.id,"combat-maker");assert.equal(manifest.version,pkg.version);
assert.equal(manifest.compatibility.minimum,"14");assert.equal(manifest.compatibility.verified,"14");
assert.equal(manifest.relationships.systems[0].id,"dnd5e");
assert.match(manifest.download,new RegExp(`/v${manifest.version.replaceAll(".","\\.")}/combat-maker\\.zip$`));
for(const name of [...manifest.esmodules,...manifest.styles,"README.md","LICENSE","THIRD_PARTY.md"])assert.ok((await stat(path.join(root,name))).isFile(),name);
for(const folder of ["scripts","tools","tests"])for(const name of await readdir(path.join(root,folder))) {
  if(!name.endsWith(".mjs"))continue;
  const result=spawnSync(process.execPath,["--check",path.join(root,folder,name)],{encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
}
process.stdout.write("Manifest, release URLs, runtime assets, and JavaScript syntax verified.\n");
