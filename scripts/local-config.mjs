import {execFileSync} from 'node:child_process';
import {homedir} from 'node:os';
import path from 'node:path';
export const certificateDirectory=path.join(homedir(),'Library','Application Support','WeddingStay','certificates');
export const authorityDirectory=path.join(certificateDirectory,'authority');
export function localHostname(){
 try{return execFileSync('/usr/sbin/scutil',['--get','LocalHostName'],{encoding:'utf8'}).trim()+'.local';}
 catch{return 'Varuns-MacBook-Pro.local';}
}
export const port=4173;
