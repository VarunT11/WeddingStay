import {storedData,validateStayChanges,validateData,type Dataset} from './data';
import {recordKinds,type CloudSnapshot} from './cloudStore';
import {sameScope,scopeKey,type WeddingScope} from './weddingScope';
import {type CloudRole} from './cloudCache';

export type OfflineWorkspace={format:2;scope:WeddingScope;verifiedAt:string;id:string;role:CloudRole;baseline:CloudSnapshot;working:Dataset;revision:number;savedAt:string;syncedAt:string|null;progress?:{completed:number;total:number};upload?:{before:CloudSnapshot;after:Dataset}};
type Entry={revoked?:boolean;workspace?:OfflineWorkspace;owner?:string;until?:number};
export type Kind=typeof recordKinds[number];
export type RecordChange={kind:Kind;id:string;value?:{id:string}};
export type Conflict={key:string;kind:Kind;id:string;name:string;base:unknown;mine:unknown;cloud:unknown};
export type Choices=Record<string,'mine'|'cloud'>;
const key=(scope:WeddingScope)=>scopeKey(scope);
let opened:Promise<IDBDatabase>|undefined;
function db(){return opened??=new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('weddingstay-offline',1);request.onupgradeneeded=()=>request.result.createObjectStore('workspaces');request.onsuccess=()=>resolve(request.result);request.onerror=()=>{opened=undefined;reject(new Error('Local storage could not be opened. Offline work needs browser storage.'));};});}
export async function offlineEntry(scope:WeddingScope,owner:string,action:'read'|'claim'|'release'|'save'|'remove'|'purge'|'authorize',workspace?:OfflineWorkspace,expected?:number,expectedId?:string):Promise<{workspace?:OfflineWorkspace;writable:boolean}>{
 const database=await db();
 return new Promise((resolve,reject)=>{
  const tx=database.transaction('workspaces',action==='read'?'readonly':'readwrite'),store=tx.objectStore('workspaces'),request=store.get(key(scope));let result:{workspace?:OfflineWorkspace;writable:boolean},failure:Error|undefined;
  request.onsuccess=()=>{try{
   const entry=(request.result||{}) as Entry;
   if(action==='purge'){store.put({revoked:true},key(scope));if(scope.weddingId==='main')store.delete(scope.projectId+':main:'+scope.uid);result={writable:false};return;}
   if(action==='authorize'){if(entry.revoked)store.delete(key(scope));result={workspace:entry.workspace,writable:true};return;}
   if(entry.revoked){if(action==='save')throw Object.assign(new Error('Wedding access was revoked. This copy cannot be saved.'),{code:'permission-denied'});result={writable:false};return;}
   if(workspace&&!sameScope(workspace.scope,scope))throw new Error('This workspace belongs to another wedding.');
   const available=!entry.owner||entry.owner===owner||(entry.until||0)<Date.now();
   if(entry.workspace){const saved=entry.workspace;if(saved.format!==2||!sameScope(saved.scope,scope)||!sameScope(saved.baseline.scope,scope)||!Number.isFinite(Date.parse(saved.verifiedAt))||!saved.id||!Number.isInteger(saved.revision)||saved.revision<1||!['owner','coordinator'].includes(saved.role)||!Number.isInteger(saved.baseline?.revision))throw new Error('This offline workspace could not be opened. Its saved data was kept.');validateData(saved.baseline.data);validateData(saved.working);if(saved.upload){if(!sameScope(saved.upload.before.scope,scope))throw new Error('The pending upload belongs to another wedding.');validateData(saved.upload.before.data);validateData(saved.upload.after);}}
   if(action==='claim'&&available&&entry.workspace){entry.owner=owner;entry.until=Date.now()+30000;store.put(entry,key(scope));}
   if(action==='release'&&entry.owner===owner){delete entry.owner;delete entry.until;store.put(entry,key(scope));}
   if(action==='save'||action==='remove'){
    if(!available)throw new Error('Another tab is editing this offline workspace. Close that tab and try again.');
    if((expected!==undefined&&(entry.workspace?.revision||0)!==expected)||(expectedId&&entry.workspace?.id!==expectedId)||(action==='save'&&expected!==0&&entry.workspace?.id!==workspace?.id))throw new Error('This workspace changed in another tab. Reopen it before saving; your form is still open.');
    if(action==='remove')store.delete(key(scope));
    else {entry.workspace=workspace;entry.owner=owner;entry.until=Date.now()+30000;store.put(entry,key(scope));}
   }
   result={workspace:action==='remove'?undefined:entry.workspace,writable:available};
  }catch(error){failure=error instanceof Error?error:new Error('Local save failed.');tx.abort();}};
  tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||new Error('Local changes could not be saved. Check browser storage and export a backup.'));tx.onerror=()=>{failure??=new Error('Local changes could not be saved. Check browser storage and export a backup.');};
 });
}
function sorted(value:unknown):unknown{if(Array.isArray(value))return value.map(sorted);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['createdAt','updatedAt','exportedAt'].includes(key)).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,sorted(item)]));return value;}
export const sameRecord=(a:unknown,b:unknown)=>JSON.stringify(sorted(a))===JSON.stringify(sorted(b));
const rows=(data:Dataset,kind:Kind)=>new Map<string,{id:string}>((storedData(data)[kind] as {id:string}[]).map(row=>[row.id,row]));
export function recordChanges(before:Dataset,after:Dataset):RecordChange[]{const changes:RecordChange[]=[];for(const kind of recordKinds){const old=rows(before,kind),next=rows(after,kind);for(const id of new Set([...old.keys(),...next.keys()]))if(!sameRecord(old.get(id),next.get(id)))changes.push({kind,id,value:next.get(id)});}return changes;}
function put(data:Dataset,change:RecordChange){const values=new Map((data[change.kind] as {id:string}[]).map(row=>[row.id,row]));if(change.value)values.set(change.id,change.value);else values.delete(change.id);(data[change.kind] as unknown)=[...values.values()];}
export function mergeOffline(base:Dataset,local:Dataset,cloud:Dataset,choices:Choices={}){
 const data=structuredClone(storedData(cloud)) as Dataset,conflicts:Conflict[]=[];
 for(const change of recordChanges(base,local)){
  const original=rows(base,change.kind).get(change.id),remote=rows(cloud,change.kind).get(change.id),key=change.kind+':'+change.id;
  if(sameRecord(remote,change.value))continue;
  if(!sameRecord(original,remote)){
   const mine=change.value as Record<string,unknown>|undefined,other=remote as Record<string,unknown>|undefined;
   conflicts.push({key,kind:change.kind,id:change.id,name:String(mine?.name||mine?.number||other?.name||other?.number||change.id),base:original,mine:change.value,cloud:remote});
   if(choices[key]!=='mine')continue;
  }
  if(change.kind==='history'&&original)throw new Error('Existing history cannot be edited or deleted. Keep the cloud history entry.');
  put(data,change);
 }
 data.updatedAt=new Date().toISOString();
 return {data,conflicts};
}
// Preflight every intermediate dataset. No upload starts until the entire plan is valid.
export function planOfflineBatches(before:Dataset,target:Dataset,clientSchema?:number):Dataset[]{
 if((clientSchema||0)>4)throw new Error('Update the app before syncing this workspace. Local work is kept.');
 validateData(target);validateStayChanges(before,target);let current=structuredClone(storedData(before)) as Dataset,pending=recordChanges(before,target),batchWrites=0;const batches:Dataset[]=[];
 for(const change of pending)if(change.kind==='history'&&rows(before,'history').has(change.id))throw new Error('Existing history entries cannot be changed.');
 if((clientSchema||0)<2){if(before.guestCategories.length>440)throw new Error('This older cloud dataset needs an owner-led category migration before offline sync. Local work is kept.');batches.push(structuredClone(current));}
 while(pending.length){
  let advanced=false;
  for(let index=0;index<pending.length;){
   const next=structuredClone(current);put(next,pending[index]);next.updatedAt=target.updatedAt;
   try{validateData(next);}catch{index++;continue;}
   current=next;pending.splice(index,1);advanced=true;batchWrites++;
   if(batchWrites===440){batches.push(structuredClone(current));batchWrites=0;}
  }
  if(!advanced){
   if(pending.length>440)throw new Error('More than 440 interdependent records must change together. Reduce those edits before syncing. Nothing has been uploaded.');
   if(batchWrites){batches.push(structuredClone(current));batchWrites=0;}
   for(const change of pending)put(current,change);current.updatedAt=target.updatedAt;validateData(current);batches.push(structuredClone(current));pending=[];
  }
 }
 if(batchWrites)batches.push(current);
 return batches;
}


export async function migrateOfflineWorkspace(scope:WeddingScope,role:CloudRole){
 if(scope.weddingId!=='main')return false;
 const database=await db();let migrated=false;
 return new Promise<boolean>((resolve,reject)=>{
  const tx=database.transaction('workspaces','readwrite'),store=tx.objectStore('workspaces'),current=store.get(key(scope));
  current.onsuccess=()=>{if(current.result)return;const oldKey=scope.projectId+':main:'+scope.uid,legacy=store.get(oldKey);legacy.onsuccess=()=>{const old=legacy.result?.workspace;if(!old||old.format!==1)return;try{validateData(old.baseline.data);validateData(old.working);const workspace={...old,format:2,scope,role,verifiedAt:new Date().toISOString(),baseline:{...old.baseline,scope},upload:old.upload?{...old.upload,before:{...old.upload.before,scope}}:undefined};store.put({workspace},key(scope));store.delete(oldKey);migrated=true;}catch{/* Keep unrecognisable legacy work untouched. */}};};
  tx.oncomplete=()=>resolve(migrated);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
}
export async function localWorkspaceWeddingIds(projectId:string,uid:string){
 const database=await db();return new Promise<string[]>((resolve,reject)=>{const tx=database.transaction('workspaces','readonly'),prefix=[projectId,uid].map(encodeURIComponent).join(':')+':',request=tx.objectStore('workspaces').getAll(IDBKeyRange.bound(prefix,prefix+'\uffff'));request.onsuccess=()=>resolve(request.result.flatMap((entry:Entry)=>entry.workspace?.scope?.projectId===projectId&&entry.workspace.scope.uid===uid?[entry.workspace.scope.weddingId]:[]));request.onerror=()=>reject(request.error);});
}
