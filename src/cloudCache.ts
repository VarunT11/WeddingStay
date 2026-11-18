import {normalizeData,storedData,validateData} from './data';
import {firebaseProjectId,weddingId} from './firebase';
import {type CloudSnapshot} from './cloudStore';
export type CloudRole='owner'|'coordinator';
type CachedWedding={format:2;uid:string;projectId:string;weddingId:string;role:CloudRole;syncedAt:string;snapshot:CloudSnapshot};
const key=(uid:string)=>'weddingstay.cloud.v2.'+firebaseProjectId+'.'+weddingId+'.'+uid;
const legacyKey=(uid:string)=>'weddingstay.cloud.v1.'+uid+'.'+weddingId;
function validSnapshot(value:CloudSnapshot){if(!value||!Number.isInteger(value.revision)||value.revision<0||(value.datasetVersion!==undefined&&typeof value.datasetVersion!=='string')||(value.clientSchema!==undefined&&!Number.isInteger(value.clientSchema)))throw new Error('Invalid cached revision.');validateData(value.data);return {...value,data:normalizeData(storedData(value.data))};}
export function readCloudCache(uid:string):{role:CloudRole;snapshot:CloudSnapshot;syncedAt:string|null;trusted:boolean}|null{
 try{const value=JSON.parse(localStorage.getItem(key(uid))||'null') as CachedWedding|null;if(value?.format===2&&value.uid===uid&&value.projectId===firebaseProjectId&&value.weddingId===weddingId&&['owner','coordinator'].includes(value.role)&&Number.isFinite(Date.parse(value.syncedAt)))return {role:value.role,snapshot:validSnapshot(value.snapshot),syncedAt:value.syncedAt,trusted:true};}catch{/* Try the older read-only fallback. */}
 try{const value=JSON.parse(localStorage.getItem(legacyKey(uid))||'null');if(value?.uid===uid&&['owner','coordinator'].includes(value.role))return {role:value.role,snapshot:validSnapshot(value.snapshot),syncedAt:null,trusted:false};}catch{/* A fresh server load is needed. */}
 return null;
}
export function writeCloudCache(uid:string,role:CloudRole,snapshot:CloudSnapshot,syncedAt:string){
 const value:CachedWedding={format:2,uid,projectId:firebaseProjectId,weddingId,role,syncedAt,snapshot:{...snapshot,data:storedData(snapshot.data)}};
 try{localStorage.setItem(key(uid),JSON.stringify(value));return true;}catch{return false;}
}
export function clearCloudCache(uid:string){for(const entry of [key(uid),legacyKey(uid)])try{localStorage.removeItem(entry);}catch{/* Storage may be unavailable. */}}
