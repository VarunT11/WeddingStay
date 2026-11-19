import {normalizeData,storedData,validateData} from './data';
import {type CloudSnapshot} from './cloudStore';
import {sameScope,scopeKey,type WeddingScope} from './weddingScope';
export type CloudRole='owner'|'coordinator';
type CachedWedding={format:3;scope:WeddingScope;role:CloudRole;syncedAt:string;verifiedAt:string;snapshot:CloudSnapshot};
const prefix='weddingstay.cloud.v3.';
const key=(scope:WeddingScope)=>prefix+scopeKey(scope);
function validSnapshot(value:CloudSnapshot,scope:WeddingScope){if(!value||!sameScope(value.scope,scope)||!Number.isInteger(value.revision)||value.revision<0||(value.clientSchema||0)>4)throw new Error('The saved copy belongs to another wedding or needs a newer app.');validateData(value.data);return {...value,data:normalizeData(storedData(value.data))};}
export function readCloudCache(scope:WeddingScope,allowLegacy=false):{role:CloudRole;snapshot:CloudSnapshot;syncedAt:string;trusted:boolean;verifiedAt:string}|null{
 try{const value=JSON.parse(localStorage.getItem(key(scope))||'null') as CachedWedding|null;if(value?.format===3&&sameScope(value.scope,scope)&&['owner','coordinator'].includes(value.role)&&Number.isFinite(Date.parse(value.verifiedAt))&&Number.isFinite(Date.parse(value.syncedAt)))return {role:value.role,snapshot:validSnapshot(value.snapshot,scope),syncedAt:value.syncedAt,trusted:true,verifiedAt:value.verifiedAt};}catch{/* Keep unreadable copies out of the app. */}
 if(allowLegacy&&scope.weddingId==='main')try{const oldKey='weddingstay.cloud.v2.'+scope.projectId+'.main.'+scope.uid,value=JSON.parse(localStorage.getItem(oldKey)||'null');if(value?.format===2&&value.uid===scope.uid&&value.projectId===scope.projectId&&value.weddingId==='main'){const snapshot=validSnapshot({...value.snapshot,scope},scope);return {role:'coordinator',snapshot,syncedAt:value.syncedAt,trusted:true,verifiedAt:new Date().toISOString()};}}catch{/* Ambiguous legacy copies require explicit import. */}
 return null;
}
export function writeCloudCache(scope:WeddingScope,role:CloudRole,snapshot:CloudSnapshot,syncedAt:string,verifiedAt:string){
 if(!sameScope(snapshot.scope,scope))return false;
 const value:CachedWedding={format:3,scope,role,syncedAt,verifiedAt,snapshot:{...snapshot,data:storedData(snapshot.data)}};
 try{localStorage.setItem(key(scope),JSON.stringify(value));return true;}catch{return false;}
}
export function clearCloudCache(scope:WeddingScope){for(const entry of [key(scope),'weddingstay.cloud.v2.'+scope.projectId+'.'+scope.weddingId+'.'+scope.uid,'weddingstay.cloud.v1.'+scope.uid+'.'+scope.weddingId])try{localStorage.removeItem(entry);}catch{/* Storage may be unavailable. */}}
export function cachedWeddingIds(projectId:string,uid:string){const ids:string[]=[];try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!k?.startsWith(prefix+[projectId,uid].map(encodeURIComponent).join(':')+':'))continue;const value=JSON.parse(localStorage.getItem(k)||'null');if(value?.scope?.projectId===projectId&&value.scope.uid===uid&&typeof value.scope.weddingId==='string')ids.push(value.scope.weddingId);}}catch{/* Use the available directory. */}return ids;}
