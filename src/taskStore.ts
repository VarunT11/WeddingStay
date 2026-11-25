import {collection,doc,getDocFromServer,getDocsFromServer,onSnapshot,runTransaction,serverTimestamp,updateDoc,type Unsubscribe} from 'firebase/firestore';
import {auth,database} from './firebase';
import {assertScope,scopeKey,weddingRef,type WeddingScope} from './weddingScope';
import {emptyTasks,taskChanges,taskManager,validateTaskChanges,validateTasks,type TaskRole,type TaskPerson,type TaskSnapshot,type TaskData} from './taskModel';

export const taskRoot=(scope:WeddingScope)=>doc(weddingRef(scope),'taskWorkspace','state');
export async function verifyTaskRole(scope:WeddingScope):Promise<TaskRole>{
 assertScope(scope);const owner=await getDocFromServer(doc(database!,'appOwners',scope.uid));assertScope(scope);if(owner.data()?.active===true)return 'owner';
 const member=await getDocFromServer(doc(weddingRef(scope),'members',scope.uid));assertScope(scope);const value=member.data();if(!value?.active)return 'none';return ['participant','manager'].includes(value.taskRole)?value.taskRole:'none';
}
export function watchTaskRole(scope:WeddingScope,owner:boolean,onRole:(role:TaskRole)=>void,onError:(cause:unknown)=>void){
 if(owner){onRole('owner');return()=>{};}
 return onSnapshot(doc(weddingRef(scope),'members',scope.uid),{includeMetadataChanges:true},row=>{if(row.metadata.fromCache)return;const value=row.data();onRole(value?.active&&['participant','manager'].includes(value.taskRole)?value.taskRole:'none');},onError);
}
export async function taskPeople(scope:WeddingScope):Promise<TaskPerson[]>{
 assertScope(scope);const rows=await getDocsFromServer(collection(weddingRef(scope),'members'));assertScope(scope);
 const isOwner=await verifyTaskRole(scope)==='owner';
 const people:TaskPerson[]=await Promise.all(rows.docs.map(async row=>{let name=row.data().displayName;if(!name&&isOwner){const profile=await getDocFromServer(doc(database!,'users',row.id));name=profile.data()?.displayName||row.id;await updateDoc(row.ref,{displayName:String(name).slice(0,200)});}return {id:row.id,name:name||row.id,active:row.data().active===true,role:['manager','participant'].includes(row.data().taskRole)?row.data().taskRole:'none'};}));
 if(isOwner){const self=people.find(p=>p.id===scope.uid);if(self){self.role='owner';self.active=true;}else people.push({id:scope.uid,name:auth!.currentUser!.displayName||'App owner',role:'owner',active:true});}
 return people.sort((a,b)=>a.name.localeCompare(b.name));
}
export async function setTaskRole(scope:WeddingScope,target:TaskPerson,role:Exclude<TaskRole,'owner'>){
 const current=await verifyTaskRole(scope);if(!taskManager(current))throw new Error('Only task managers can manage the task team.');
 await runTransaction(database!,async tx=>{const ref=doc(weddingRef(scope),'members',target.id),old=await tx.get(ref);if(!old.exists()||!old.data().active)throw new Error('Choose an active wedding member.');if(current!=='owner'&&old.data().taskRole==='manager')throw new Error('Only app owners can change a manager’s task access.');tx.update(ref,{taskRole:role,taskUpdatedBy:scope.uid,taskUpdatedAt:serverTimestamp()});});
}
export async function readTaskSnapshot(scope:WeddingScope):Promise<TaskSnapshot>{
 for(let attempt=0;attempt<3;attempt++){
  const root=taskRoot(scope),head=await getDocFromServer(root),revision=head.data()?.revision||0;
  if(!head.exists())return {revision:0,data:emptyTasks()};
  if(head.data()?.schema!==1)throw new Error('Update WeddingStay to open this task plan.');
  const data=emptyTasks();for(const kind of ['categories','tasks','activity'] as const){const rows=await getDocsFromServer(collection(root,kind));(data[kind] as unknown)=rows.docs.filter(row=>!row.data().deleted).map(row=>row.data().data);}
  const checked=await getDocFromServer(root);if(checked.data()?.revision!==revision)continue;assertScope(scope);validateTasks(data);return {revision,data};
 }
 throw new Error('Tasks changed while loading. Retry to get a complete copy.');
}
export function watchTasks(scope:WeddingScope,onData:(snapshot:TaskSnapshot)=>void,onError:(cause:unknown)=>void):Unsubscribe{
 let stopped=false,running=false,again=false;
 async function load(){if(running){again=true;return;}running=true;try{do{again=false;const value=await readTaskSnapshot(scope);if(!stopped)onData(value);}while(again&&!stopped);}catch(cause){if(!stopped)onError(cause);}finally{running=false;}}
 const stop=onSnapshot(taskRoot(scope),{includeMetadataChanges:true},row=>{if(!row.metadata.fromCache&&!row.metadata.hasPendingWrites)void load();},onError);
 return()=>{stopped=true;stop();};
}
export async function commitTasks(scope:WeddingScope,before:TaskSnapshot,next:TaskData,people:TaskPerson[]):Promise<TaskSnapshot>{
 assertScope(scope);if(!navigator.onLine)throw new Error('Reconnect before uploading tasks.');const role=await verifyTaskRole(scope);validateTaskChanges(before.data,next,role,scope.uid,people);
 const changes=taskChanges(before.data,next);if(!changes.length)return before;if(changes.length>440)throw new Error('Too many task changes for one save. Sync smaller changes (maximum 440 records).');
 const root=taskRoot(scope),revision=before.revision+1;
 await runTransaction(database!,async tx=>{const current=await tx.get(root);if((current.data()?.revision||0)!==before.revision)throw new Error('Tasks changed on another device. Your draft is kept; reopen it after reviewing the latest plan.');for(const change of changes)tx.set(doc(root,change.kind,change.id),{data:change.value||null,deleted:!change.value,revision,updatedBy:scope.uid,updatedAt:serverTimestamp()});tx.set(root,{schema:1,revision,updatedBy:scope.uid,updatedAt:serverTimestamp()});});
 assertScope(scope);return {revision,data:next};
}

export type TaskLocal={scope:WeddingScope;role:TaskRole;people?:TaskPerson[];snapshot:TaskSnapshot;workspace?:{baseline:TaskSnapshot;data:TaskData;revision:number};verifiedAt:string};
export type TaskBridge={pending:number;busy:boolean;prepare:()=>Promise<void>;sync:()=>Promise<boolean>;discard:()=>Promise<void>};
const bridges=new Map<string,TaskBridge>();
export const taskBridge=(scope:WeddingScope)=>bridges.get(scopeKey(scope));
export function registerTaskBridge(scope:WeddingScope,bridge:TaskBridge){bridges.set(scopeKey(scope),bridge);return()=>{if(bridges.get(scopeKey(scope))===bridge)bridges.delete(scopeKey(scope));};}
type LocalEntry={value?:TaskLocal;owner?:string;until?:number};
let opened:Promise<IDBDatabase>|undefined;
function localDB(){return opened??=new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('weddingstay-tasks',1);request.onupgradeneeded=()=>request.result.createObjectStore('copies');request.onsuccess=()=>resolve(request.result);request.onerror=()=>{opened=undefined;reject(new Error('Task storage could not be opened.'));};});}
export async function taskLocal(scope:WeddingScope,action:'read'|'save'|'cache'|'purge'|'claim'|'release',owner='',value?:TaskLocal,expected?:number):Promise<TaskLocal|undefined>{
 const db=await localDB();return new Promise((resolve,reject)=>{const tx=db.transaction('copies',action==='read'?'readonly':'readwrite'),store=tx.objectStore('copies'),request=store.get(scopeKey(scope));let output:TaskLocal|undefined,failure:unknown;
 request.onsuccess=()=>{try{const entry=(request.result||{}) as LocalEntry;
  if(action==='purge'){store.delete(scopeKey(scope));return;}
  if(action==='cache'){entry.value={...value!,...(entry.value?.workspace?{workspace:entry.value.workspace}:{})};store.put(entry,scopeKey(scope));output=entry.value;return;}
  if(entry.value){validateTasks(entry.value.snapshot.data);if(entry.value.workspace){validateTasks(entry.value.workspace.baseline.data);validateTasks(entry.value.workspace.data);}}
  if(action==='release'){if(entry.owner===owner){delete entry.owner;delete entry.until;store.put(entry,scopeKey(scope));}output=entry.value;return;}
  if(action==='save'||action==='claim'){
   if(entry.owner&&entry.owner!==owner&&(entry.until||0)>Date.now())throw new Error('Another tab is editing tasks. Close that tab before continuing.');
   if(action==='save'){if(expected!==undefined&&(entry.value?.workspace?.revision||0)!==expected)throw new Error('Local tasks changed in another tab. Reopen before saving.');entry.value=value;}
   entry.owner=owner;entry.until=Date.now()+30000;store.put(entry,scopeKey(scope));
  }
  output=entry.value;
 }catch(cause){failure=cause;tx.abort();}};tx.oncomplete=()=>resolve(output);tx.onabort=()=>reject(failure||new Error('Tasks could not be saved on this device. Export a backup.'));tx.onerror=()=>{failure??=tx.error;};});
}
export async function clearTaskAccount(projectId:string,uid:string){const db=await localDB();return new Promise<void>((resolve,reject)=>{const tx=db.transaction('copies','readwrite'),store=tx.objectStore('copies'),request=store.openCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const value=(cursor.value as LocalEntry).value;if(value?.scope.projectId===projectId&&value.scope.uid===uid)cursor.delete();cursor.continue();};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
