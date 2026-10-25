import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const mime={".mjs":"text/javascript",".js":"text/javascript",".css":"text/css",".html":"text/html",".svg":"image/svg+xml",".json":"application/json",".png":"image/png"};
export function startPreview(port=4314) {
  const server=http.createServer(async(req,res)=> {
    try {
      const url=new URL(req.url,"http://localhost");
      const relative=url.pathname==="/"?"tools/preview.html":decodeURIComponent(url.pathname.slice(1));
      if(relative.includes("..")||path.isAbsolute(relative)||relative.startsWith(".git")||relative.includes("\\"))throw new Error("Invalid path");
      const target=path.resolve(root,relative);
      if(!target.startsWith(root+path.sep))throw new Error("Invalid path");
      const data=await readFile(target);res.writeHead(200,{"Content-Type":mime[path.extname(target)]||"application/octet-stream","Cache-Control":"no-store"});res.end(data);
    }catch{res.writeHead(404);res.end("Not found");}
  });
  return new Promise(resolve=>server.listen(port,"127.0.0.1",()=>resolve(server)));
}
if(process.argv[1]===fileURLToPath(import.meta.url)){await startPreview();process.stdout.write("Combat Forge development preview: http://127.0.0.1:4314\nUses mock Foundry documents, not a real world.\n");}
