import {execFileSync} from 'node:child_process';
import {mkdirSync,existsSync,copyFileSync,chmodSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {authorityDirectory,certificateDirectory,localHostname,port} from './local-config.mjs';

try{execFileSync('mkcert',['-version'],{stdio:'ignore'});}catch{console.error('Install mkcert first: brew install mkcert');process.exit(1);}
mkdirSync(authorityDirectory,{recursive:true,mode:0o700});
const certificate=path.join(certificateDirectory,'server.pem'),key=path.join(certificateDirectory,'server-key.pem'),hostname=localHostname();
execFileSync('mkcert',['-cert-file',certificate,'-key-file',key,hostname,'localhost','127.0.0.1','::1'],{stdio:'inherit',env:{...process.env,CAROOT:authorityDirectory}});
chmodSync(key,0o600);
const root=path.join(authorityDirectory,'rootCA.pem');
if(!existsSync(root))throw new Error('Local certificate authority was not created.');
copyFileSync(root,path.join(certificateDirectory,'WeddingStay-rootCA.crt'));
writeFileSync(path.join(certificateDirectory,'hostname.txt'),hostname+'\n',{mode:0o600});
console.log(`\nHTTPS certificates ready for https://${hostname}:${port}`);
console.log(`Public certificate for AirDrop: ${path.join(certificateDirectory,'WeddingStay-rootCA.crt')}`);
console.log('Install and enable trust for that PUBLIC certificate on your iPhone and iPad.');
console.log('Never share server-key.pem or authority/rootCA-key.pem.');
console.log(`To trust this dedicated authority on your Mac, run manually:\nCAROOT="${authorityDirectory}" mkcert -install`);
console.log('Then start WeddingStay with: npm run local');
