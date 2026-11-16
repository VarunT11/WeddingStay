import {collection,doc,getDocFromServer,onSnapshot,runTransaction,serverTimestamp,writeBatch,type Unsubscribe} from 'firebase/firestore';
import {auth,database,weddingId} from './firebase';
import {emptyDataset,normalizeData,storedData,validateData,type Dataset} from './data';

export const recordKinds=['guests','events','invitations','properties','areas','rooms','allocations','requirements','labels','history'] as const;
type Kind=typeof recordKinds[number];
export type CloudHead={state:'initializing'|'ready';revision:number;activeVersion?:string;previousVersion?:string;collectionRevisions:Partial<Record<Kind,number>>;wedding:Dataset['wedding'];version:3;referenceData:boolean;createdAt:string;updatedAt?:unknown;updatedBy?:string;importHash?:string};
export type CloudSnapshot={data:Dataset;revision:number;datasetVersion?:string};
const root=()=>{if(!database)throw new Error('Firebase configuration is missing.');return doc(database,'weddings',weddingId);};
export const membershipRef=(uid:string)=>doc(root(),'members',uid);
const json=(value:unknown)=>JSON.stringify(value);
const clean=<T,>(value:T):T=>JSON.parse(json(value));
function records(data:Dataset,kind:Kind){return new Map((storedData(data)[kind] as {id:string}[]).map(record=>[record.id,record]));}
const datasetRoot=(version?:string)=>version?doc(root(),'versions',version):root();

export function replacementPreview(before:Dataset,next:Dataset){
 return recordKinds.map(kind=>{const old=records(before,kind),current=records(next,kind);return {kind,current:old.size,next:current.size,added:[...current.keys()].filter(id=>!old.has(id)).length,changed:[...current].filter(([id,value])=>old.has(id)&&json(old.get(id))!==json(value)).length,removed:[...old.keys()].filter(id=>!current.has(id)).length};});
}

// Head collection revisions act as a barrier: never render half of a multi-collection save.
export function watchWedding(onData:(snapshot:CloudSnapshot)=>void,onState:(state:'empty'|'initializing'|'online'|'offline')=>void,onError:(error:unknown)=>void):Unsubscribe {
 let head:CloudHead|null=null,headOnline=false,stopped=false,subscribedVersion:string|undefined;
 let recordSubscriptions:Unsubscribe[]=[];
 let generation=0;
 const rows=new Map<Kind,{values:{id:string}[];revision:number;online:boolean}>();
 function emit(){
  if(stopped||!head)return;
  if(head.state!=='ready'){onState(head.state==='initializing'?'initializing':'empty');return;}
  for(const kind of recordKinds){const entry=rows.get(kind);if(!entry||entry.revision!==(head.collectionRevisions?.[kind]||0))return;}
  const data:Dataset={...emptyDataset(),version:3,wedding:head.wedding,createdAt:head.createdAt,updatedAt:typeof head.updatedAt==='string'?head.updatedAt:new Date().toISOString(),referenceData:head.referenceData};
  for(const kind of recordKinds)(data[kind] as unknown)=rows.get(kind)!.values;
  try{validateData(data);if(headOnline&&[...rows.values()].every(row=>row.online)){onData({data:normalizeData(data),revision:head.revision,datasetVersion:head.activeVersion});onState('online');}else onState('offline');}catch(error){onError(error);}
 }
 function acceptHead(value:CloudHead,online:boolean){
  if(stopped||(head&&value.revision<head.revision))return;head=value;headOnline=online;
  if(!recordSubscriptions.length||subscribedVersion!==head.activeVersion){
   subscribedVersion=head.activeVersion;generation++;const current=generation;
   recordSubscriptions.forEach(stop=>stop());recordSubscriptions=[];rows.clear();onState('offline');
   for(const kind of recordKinds)recordSubscriptions.push(onSnapshot(collection(datasetRoot(subscribedVersion),kind),{includeMetadataChanges:true},snapshot=>{
    if(stopped||generation!==current)return;
    const values:{id:string}[]=[];let revision=0;
    snapshot.forEach(item=>{const entry=item.data();revision=Math.max(revision,entry.revision||0);if(!entry.deleted)values.push(entry.data);});
    rows.set(kind,{values,revision,online:!snapshot.metadata.fromCache&&!snapshot.metadata.hasPendingWrites});emit();
   },async error=>{
    if(stopped||generation!==current)return;
    // Old subscriptions can lose permission before the root listener receives activation.
    try{const latest=await getDocFromServer(root());if(stopped||generation!==current)return;const next=latest.data() as CloudHead|undefined;if(next&&next.activeVersion!==subscribedVersion){acceptHead(next,true);return;}}catch{/* Report real access/network errors below. */}
    if(!stopped&&generation===current)onError(error);
   }));
  }
  emit();
 }
 const stopHead=onSnapshot(root(),{includeMetadataChanges:true},snapshot=>{if(!snapshot.exists()){if(!snapshot.metadata.fromCache)onState('empty');return;}acceptHead(snapshot.data() as CloudHead,!snapshot.metadata.fromCache&&!snapshot.metadata.hasPendingWrites);},onError);
 return ()=>{stopped=true;stopHead();recordSubscriptions.forEach(stop=>stop());};
}

export async function commitWedding(before:CloudSnapshot,next:Dataset):Promise<CloudSnapshot>{
 if(!navigator.onLine)throw new Error('You are offline. Reconnect before saving changes.');
 const uid=auth?.currentUser?.uid;if(!uid||!database)throw new Error('Sign in before saving.');
 const canonical=clean(storedData(next));validateData(canonical);
 const changes:{kind:Kind;id:string;data:unknown;deleted:boolean}[]=[];
 for(const kind of recordKinds){const previous=records(before.data,kind),current=records(canonical,kind);for(const [id,value] of current)if(json(value)!==json(previous.get(id)))changes.push({kind,id,data:value,deleted:false});for(const id of previous.keys())if(!current.has(id))changes.push({kind,id,data:null,deleted:true});}
 if(!changes.length)return before;
 if(changes.length>440)throw new Error('This change is too large for one shared save. Use smaller changes.');
 const revision=before.revision+1;
 await runTransaction(database,async transaction=>{
  const snapshot=await transaction.get(root()),head=snapshot.data() as CloudHead|undefined;
  if(!head||head.state!=='ready')throw new Error('The shared wedding is not ready for editing.');
  if(head.revision!==before.revision||head.activeVersion!==before.datasetVersion)throw new Error('The wedding changed on another device. Your draft is kept. Close this form, review the latest records and reapply your changes.');
  const collectionRevisions={...head.collectionRevisions};
  for(const change of changes){collectionRevisions[change.kind]=revision;transaction.set(doc(datasetRoot(head.activeVersion),change.kind,change.id),{data:change.data,deleted:change.deleted,revision,updatedBy:uid,updatedAt:serverTimestamp()});}
  transaction.update(root(),{revision,collectionRevisions,updatedBy:uid,updatedAt:serverTimestamp()});
 });
 return {data:canonical,revision,datasetVersion:before.datasetVersion};
}

export async function replaceWedding(before:CloudSnapshot,candidate:Dataset,onProgress:(message:string)=>void){
 if(!database||!auth?.currentUser||!navigator.onLine)throw new Error('Sign in and connect to the internet before replacing data.');
 const uid=auth.currentUser.uid,data=clean(storedData(candidate));validateData(data);
 const version=doc(collection(root(),'versions')),revision=before.revision+1;
 const assertCurrent=(head:CloudHead|undefined)=>{if(head?.state!=='ready'||head.revision!==before.revision||head.activeVersion!==before.datasetVersion)throw new Error('Cloud data changed after your preview. Nothing was replaced. Close this preview and review the latest cloud data before trying again.');};
 await runTransaction(database,async transaction=>{const current=await transaction.get(root());assertCurrent(current.data() as CloudHead|undefined);transaction.set(version,{state:'uploading',baseRevision:before.revision,baseVersion:before.datasetVersion||'',createdBy:uid,createdAt:serverTimestamp()});});
 const all=recordKinds.flatMap(kind=>[...records(data,kind)].map(([id,value])=>({kind,id,value})));
 for(let start=0;start<all.length;start+=150){const batch=writeBatch(database);for(const record of all.slice(start,start+150))batch.set(doc(version,record.kind,record.id),{data:record.value,deleted:false,revision,updatedBy:uid,updatedAt:serverTimestamp()});await batch.commit();onProgress('Uploaded '+Math.min(start+150,all.length)+' of '+all.length+' records…');}
 const ready=writeBatch(database);ready.update(version,{state:'ready'});await ready.commit();onProgress('Activating the complete dataset…');
 await runTransaction(database,async transaction=>{
  const current=await transaction.get(root()),staged=await transaction.get(version);assertCurrent(current.data() as CloudHead|undefined);
  if(staged.data()?.state!=='ready')throw new Error('The upload is incomplete. Current cloud data was kept.');
  transaction.update(root(),{activeVersion:version.id,previousVersion:before.datasetVersion||'legacy',revision,collectionRevisions:Object.fromEntries(recordKinds.map(kind=>[kind,data[kind].length?revision:0])),wedding:data.wedding,version:3,referenceData:data.referenceData,createdAt:data.createdAt,updatedAt:serverTimestamp(),updatedBy:uid});
 });
}

export async function initializeWedding(candidate:Dataset,onProgress:(message:string)=>void){
 if(!database||!auth?.currentUser||!navigator.onLine)throw new Error('Sign in and connect to the internet before initializing.');
 const uid=auth.currentUser.uid,data=clean(storedData(candidate));validateData(data);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(json(data))),hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 await runTransaction(database,async transaction=>{
  const snapshot=await transaction.get(root()),head=snapshot.data();
  if(head?.state==='ready')throw new Error('Cloud data already exists. Replacement is disabled.');
  if(head?.state==='initializing'&&head.importHash!==hash)throw new Error('A different import is in progress. Choose the same file to resume.');
  transaction.set(root(),{state:'initializing',revision:0,collectionRevisions:{},wedding:data.wedding,version:3,referenceData:data.referenceData,createdAt:data.createdAt,updatedAt:serverTimestamp(),updatedBy:uid,importHash:hash});
 });
 const all=recordKinds.flatMap(kind=>[...records(data,kind)].map(([id,value])=>({kind,id,value})));
 for(let start=0;start<all.length;start+=150){const batch=writeBatch(database);for(const record of all.slice(start,start+150))batch.set(doc(root(),record.kind,record.id),{data:record.value,deleted:false,revision:1,updatedBy:uid,updatedAt:serverTimestamp()});await batch.commit();onProgress('Uploaded '+Math.min(start+150,all.length)+' of '+all.length+' records…');}
 const collectionRevisions=Object.fromEntries(recordKinds.map(kind=>[kind,data[kind].length?1:0]));
 await runTransaction(database,async transaction=>{const current=await transaction.get(root());if(current.data()?.importHash!==hash||current.data()?.state!=='initializing')throw new Error('Cloud initialization changed. Reload and review.');transaction.update(root(),{state:'ready',revision:1,collectionRevisions,updatedAt:serverTimestamp(),updatedBy:uid});});
}
