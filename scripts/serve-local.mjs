import https from 'node:https';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,stat,realpath} from 'node:fs/promises';
import {certificateDirectory,localHostname,port} from './local-config.mjs';

const directory=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
let key,cert,hostname;
try{[key,cert,hostname]=await Promise.all([readFile(path.join(certificateDirectory,'server-key.pem')),readFile(path.join(certificateDirectory,'server.pem')),readFile(path.join(certificateDirectory,'hostname.txt'),'utf8')]);}
catch{console.error('Run npm run setup:https first. Certificates are stored outside the repository.');process.exit(1);}
try{await stat(path.join(directory,'index.html'));}catch{console.error('Production build missing. Run npm run local to build and serve.');process.exit(1);}
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.woff2':'font/woff2'};
const server=https.createServer({key,cert},async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','same-origin');
 if(!['GET','HEAD'].includes(req.method||'')){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
 try{
  const raw=decodeURIComponent((req.url||'/').split('?')[0]);
  if(raw.includes('\0')){res.writeHead(400);res.end();return;}
  let target=path.resolve(directory,'.'+raw);
  if(target!==directory&&!target.startsWith(directory+path.sep)){res.writeHead(403);res.end();return;}
  try{if(!(await stat(target)).isFile())throw new Error('Not a file');}
  catch{
   const acceptsHtml=(req.headers.accept||'').includes('text/html');
   const appRoute=['/','/browse','/areas','/guests','/events','/stays'].includes(raw)||/^\/(areas|stays)\/[^/.]+$/.test(raw)||/^\/stays\/night\/\d{4}-\d{2}-\d{2}(?:\/rooms|\/properties\/[^/.]+(?:\/areas\/[^/.]+)?)?$/.test(raw);
   if(!acceptsHtml&&!appRoute){res.writeHead(404);res.end('Not found');return;}
   if(path.extname(raw)){res.writeHead(404);res.end('Not found');return;}
   target=path.join(directory,'index.html');
  }
  const resolved=await realpath(target);
  if(!resolved.startsWith(directory+path.sep)){res.writeHead(403);res.end();return;}
  const body=await readFile(resolved),extension=path.extname(resolved);
  res.setHeader('Content-Type',types[extension]||'application/octet-stream');
  // HTML, service worker and setup metadata must be checked on reconnect.
  res.setHeader('Cache-Control',resolved.includes(path.sep+'assets'+path.sep)?'public, max-age=31536000, immutable':'no-cache');
  if(path.basename(resolved)==='sw.js')res.setHeader('Service-Worker-Allowed','/');
  res.writeHead(200,{'Content-Length':body.length});res.end(req.method==='HEAD'?undefined:body);
 }catch{res.writeHead(500);res.end('Could not serve application file');}
});
server.on('error',error=>{console.error(error.message);process.exit(1);});
server.listen(port,'0.0.0.0',()=>{
 console.log(`\nWeddingStay: https://${hostname.trim()}:${port}`);
 console.log('Connect the Mac and your devices to the same trusted Wi-Fi for setup and updates.');
 console.log('After offline readiness is confirmed, the installed app can run without this server.');
 if(hostname.trim()!==localHostname())console.log('Your Mac hostname changed. Regenerate certificates with npm run setup:https.');
});
