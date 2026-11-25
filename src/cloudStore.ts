import {collection,doc,runTransaction,serverTimestamp,writeBatch} from 'firebase/firestore';
import {auth,database} from './firebase';
import {assertScope,sameScope,weddingRef,type WeddingScope} from './weddingScope';
import {verifyWeddingAccess} from './weddingAccess';
import {storedData,validateStayChanges,validateData,type Dataset} from './data';

export const recordKinds=['guestCategories','guests','events','invitations','properties','areas','rooms','allocations','requirements','labels','history'] as const;
type Kind=typeof recordKinds[number];
export type CloudHead={state:'initializing'|'ready';revision:number;clientSchema?:number;activeVersion?:string;previousVersion?:string;collectionRevisions:Partial<Record<Kind,number>>;wedding:Dataset['wedding'];version:3;referenceData:boolean;createdAt:string;updatedAt?:unknown;updatedBy?:string;importHash?:string};
export type CloudSnapshot={scope:WeddingScope;data:Dataset;revision:number;clientSchema?:number;datasetVersion?:string};
export const membershipRef=(scope:WeddingScope,uid:string)=>doc(weddingRef(scope),'members',uid);
const json=(value:unknown)=>JSON.stringify(value);
const clean=<T,>(value:T):T=>JSON.parse(json(value));
function records(data:Dataset,kind:Kind){return new Map((storedData(data)[kind] as {id:string}[]).map(record=>[record.id,record]));}
const datasetRoot=(scope:WeddingScope,version?:string)=>version?doc(weddingRef(scope),'versions',version):weddingRef(scope);

export function replacementPreview(before:Dataset,next:Dataset){
 return recordKinds.map(kind=>{const old=records(before,kind),current=records(next,kind);return {kind,current:old.size,next:current.size,added:[...current.keys()].filter(id=>!old.has(id)).length,changed:[...current].filter(([id,value])=>old.has(id)&&json(old.get(id))!==json(value)).length,removed:[...old.keys()].filter(id=>!current.has(id)).length};});
}

export async function commitWedding(scope:WeddingScope,before:CloudSnapshot,next:Dataset):Promise<CloudSnapshot>{
 assertScope(scope);if(!sameScope(before.scope,scope))throw new Error('This save belongs to another wedding.');
 const access=await verifyWeddingAccess(scope);
 if((before.clientSchema||0)>4)throw new Error('Update the app before editing this wedding. Your local copy is kept.');
 if(!navigator.onLine)throw new Error('You are offline. Reconnect before saving changes.');
 const uid=auth?.currentUser?.uid;if(!uid||!database)throw new Error('Sign in before saving.');
 const canonical=clean(storedData(next));validateData(canonical);validateStayChanges(before.data,canonical);
 const changes:{kind:Kind;id:string;data:unknown;deleted:boolean}[]=[];
 for(const kind of recordKinds){const previous=kind==='guestCategories'&&(before.clientSchema||0)<2?new Map<string,{id:string}>():records(before.data,kind),current=records(canonical,kind);for(const [id,value] of current)if(json(value)!==json(previous.get(id)))changes.push({kind,id,data:value,deleted:false});for(const id of previous.keys())if(!current.has(id))changes.push({kind,id,data:null,deleted:true});}
 const weddingChanged=json(before.data.wedding)!==json(canonical.wedding);
 if(weddingChanged&&access!=='owner')throw new Error('Only app owners can edit wedding details.');
 if(!changes.length&&!weddingChanged&&before.clientSchema===4)return before;
 if(changes.length>440)throw new Error('This change is too large for one shared save. Use smaller changes.');
 const revision=before.revision+1;
 await runTransaction(database,async transaction=>{
  const snapshot=await transaction.get(weddingRef(scope)),head=snapshot.data() as CloudHead|undefined;
  if((head?.clientSchema||0)>4)throw new Error('Update the app before editing this wedding.');
  if(!head||head.state!=='ready')throw new Error('The shared wedding is not ready for editing.');
  if(head.revision!==before.revision||head.activeVersion!==before.datasetVersion)throw new Error('The wedding changed on another device. Your draft is kept. Close this form, review the latest records and reapply your changes.');
  const collectionRevisions={...head.collectionRevisions};
  for(const change of changes){collectionRevisions[change.kind]=revision;transaction.set(doc(datasetRoot(scope,head.activeVersion),change.kind,change.id),{data:change.data,deleted:change.deleted,revision,updatedBy:uid,updatedAt:serverTimestamp()});}
  transaction.update(weddingRef(scope),{revision,clientSchema:4,schemaRevision:revision,collectionRevisions,updatedBy:uid,updatedAt:serverTimestamp(),...(weddingChanged?{wedding:canonical.wedding}:{})});
 });
 return {scope,data:canonical,revision,datasetVersion:before.datasetVersion,clientSchema:4};
}

export async function replaceWedding(scope:WeddingScope,before:CloudSnapshot,candidate:Dataset,onProgress:(message:string)=>void){
 if(!database||!auth?.currentUser||!navigator.onLine)throw new Error('Sign in and connect to the internet before replacing data.');
 if(await verifyWeddingAccess(scope)!=='owner')throw new Error('Only an app owner can initialise or replace a wedding.');
 const uid=scope.uid,data=clean(storedData(candidate));validateData(data);
 if(!sameScope(before.scope,scope))throw new Error('This replacement belongs to another wedding.');
 const version=doc(collection(weddingRef(scope),'versions')),revision=before.revision+1;
 const assertCurrent=(head:CloudHead|undefined)=>{if((head?.clientSchema||0)>4||head?.state!=='ready'||head.revision!==before.revision||head.activeVersion!==before.datasetVersion)throw new Error('Cloud data changed after your preview. Nothing was replaced. Close this preview and review the latest cloud data before trying again.');};
 await runTransaction(database,async transaction=>{const current=await transaction.get(weddingRef(scope));assertCurrent(current.data() as CloudHead|undefined);transaction.set(version,{state:'uploading',baseRevision:before.revision,baseVersion:before.datasetVersion||'',createdBy:uid,createdAt:serverTimestamp()});});
 const all=recordKinds.flatMap(kind=>[...records(data,kind)].map(([id,value])=>({kind,id,value})));
 for(let start=0;start<all.length;start+=150){const batch=writeBatch(database);for(const record of all.slice(start,start+150))batch.set(doc(version,record.kind,record.id),{data:record.value,deleted:false,revision,updatedBy:uid,updatedAt:serverTimestamp()});assertScope(scope);await batch.commit();onProgress('Uploaded '+Math.min(start+150,all.length)+' of '+all.length+' records…');}
 const ready=writeBatch(database);ready.update(version,{state:'ready'});await ready.commit();onProgress('Activating the complete dataset…');
 await runTransaction(database,async transaction=>{
  const current=await transaction.get(weddingRef(scope)),staged=await transaction.get(version);assertCurrent(current.data() as CloudHead|undefined);
  if(staged.data()?.state!=='ready')throw new Error('The upload is incomplete. Current cloud data was kept.');
  transaction.update(weddingRef(scope),{activeVersion:version.id,previousVersion:before.datasetVersion||'legacy',revision,clientSchema:4,schemaRevision:revision,collectionRevisions:Object.fromEntries(recordKinds.map(kind=>[kind,data[kind].length?revision:0])),wedding:data.wedding,version:3,referenceData:data.referenceData,createdAt:data.createdAt,updatedAt:serverTimestamp(),updatedBy:uid});
 });
}

export async function initializeWedding(scope:WeddingScope,candidate:Dataset,onProgress:(message:string)=>void){
 if(!database||!auth?.currentUser||!navigator.onLine)throw new Error('Sign in and connect to the internet before initializing.');
 if(await verifyWeddingAccess(scope)!=='owner')throw new Error('Only an app owner can initialise or replace a wedding.');
 const uid=scope.uid,data=clean(storedData(candidate));validateData(data);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(json(data))),hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 await runTransaction(database,async transaction=>{
  const snapshot=await transaction.get(weddingRef(scope)),head=snapshot.data();
  if((head?.clientSchema||0)>4)throw new Error('Update the app before initializing this wedding.');
  if(head?.state==='ready')throw new Error('Cloud data already exists. Replacement is disabled.');
  if(head?.state==='initializing'&&head.importHash!==hash)throw new Error('A different import is in progress. Choose the same file to resume.');
  transaction.set(weddingRef(scope),{state:'initializing',revision:0,clientSchema:4,schemaRevision:0,collectionRevisions:{},wedding:data.wedding,version:3,referenceData:data.referenceData,createdAt:data.createdAt,updatedAt:serverTimestamp(),updatedBy:uid,importHash:hash});
 });
 const all=recordKinds.flatMap(kind=>[...records(data,kind)].map(([id,value])=>({kind,id,value})));
 for(let start=0;start<all.length;start+=150){const batch=writeBatch(database);for(const record of all.slice(start,start+150))batch.set(doc(weddingRef(scope),record.kind,record.id),{data:record.value,deleted:false,revision:1,updatedBy:uid,updatedAt:serverTimestamp()});assertScope(scope);await batch.commit();onProgress('Uploaded '+Math.min(start+150,all.length)+' of '+all.length+' records…');}
 const collectionRevisions=Object.fromEntries(recordKinds.map(kind=>[kind,data[kind].length?1:0]));
 await runTransaction(database,async transaction=>{const current=await transaction.get(weddingRef(scope));if(current.data()?.importHash!==hash||current.data()?.state!=='initializing')throw new Error('Cloud initialization changed. Reload and review.');transaction.update(weddingRef(scope),{state:'ready',revision:1,schemaRevision:1,collectionRevisions,updatedAt:serverTimestamp(),updatedBy:uid});});
}
