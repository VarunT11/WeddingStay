import {collection,doc,getDocFromServer,getDocsFromServer,onSnapshot,query,where} from 'firebase/firestore';
import {database,weddingId} from './firebase';
import {emptyDataset,normalizeData,storedData,validateData,type Dataset} from './data';
import {recordKinds,type CloudHead,type CloudSnapshot} from './cloudStore';

export type SyncStatus='checking'|'syncing'|'online'|'offline'|'quota'|'error'|'empty'|'initializing'|'denied';
export type SyncDiagnostics={fullLoads:number;incrementalLoads:number;returnedDocuments:number;cacheRestores:number};
export const syncLabels:Record<SyncStatus,string>={checking:'Checking connection',syncing:'Syncing',online:'Up to date',offline:'Offline copy',quota:'Cloud limit reached',error:'Connection paused',empty:'Wedding not set up',initializing:'Preparing wedding',denied:'Access denied'};
export const cloudCode=(error:unknown)=>String((error as {code?:unknown})?.code||'').replace(/^firestore\//,'');
export const isTransientCloudError=(error:unknown)=>['unavailable','deadline-exceeded','aborted','internal','unknown'].includes(cloudCode(error));
export type WeddingSync={stop:()=>void;acknowledge:(snapshot:CloudSnapshot)=>void};
type Options={baseline?:CloudSnapshot;onData:(snapshot:CloudSnapshot)=>void;onState:(status:SyncStatus)=>void;onError:(error:unknown)=>void;onActivity:(change:Partial<SyncDiagnostics>)=>void};
function headTime(value:unknown){if(typeof value==='string')return value;if(value&&typeof (value as {toDate?:unknown}).toDate==='function')return (value as {toDate:()=>Date}).toDate().toISOString();return new Date().toISOString();}

// Only the head is listened to. Collection reads are bounded by a stable revision.
export function createWeddingSync({baseline:initial,onData,onState,onError,onActivity}:Options):WeddingSync{
 if(!database)throw new Error('Firebase configuration is missing.');
 const root=doc(database,'weddings',weddingId);
 let baseline=initial,head:CloudHead|undefined,stopped=false,running=false,headOnline=false;
 let timer:ReturnType<typeof setTimeout>|undefined,waitingAt:string|undefined;
 function headKey(value:CloudHead){return `${value.activeVersion||''}:${value.revision}:${value.clientSchema}`;}
 function schedule(){if(stopped||!headOnline||!head||head.state!=='ready'||running||waitingAt===headKey(head))return;clearTimeout(timer);timer=setTimeout(()=>void sync(),200);}
 function publish(value:CloudSnapshot){if(stopped)return;baseline=value;onData(value);}
 async function sync(){
  if(stopped||running||!head||!headOnline)return;
  running=true;let waitForNewRevision=false;
  try{
   for(let attempt=0;attempt<3&&!stopped;attempt++){
    const target:CloudHead|undefined=head;
    if(!target||target.state!=='ready'||!headOnline)return;
    if(baseline&&baseline.datasetVersion===target.activeVersion&&baseline.revision>target.revision)return;
    if(baseline&&baseline.datasetVersion===target.activeVersion&&baseline.revision===target.revision&&baseline.clientSchema===target.clientSchema){onData(baseline);onState('online');return;}
    onState('syncing');
    const base=baseline;
    const full=!base||base.datasetVersion!==target.activeVersion||base.clientSchema!==target.clientSchema;
    onActivity(full?{fullLoads:1}:{incrementalLoads:1});
    const floor=full?-1:base!.revision;
    const data:Dataset=full?emptyDataset():structuredClone(storedData(base!.data)) as Dataset;
    data.wedding=target.wedding;data.createdAt=target.createdAt;data.updatedAt=headTime(target.updatedAt);data.referenceData=target.referenceData;
    let changedVersion=false;
    for(const kind of recordKinds){
     if(stopped)return;
     if((target.collectionRevisions?.[kind]||0)<=Math.max(0,floor))continue;
     const records=collection(target.activeVersion?doc(root,'versions',target.activeVersion):root,kind);
     let result;
     try{result=await getDocsFromServer(full?records:query(records,where('revision','>',floor),where('revision','<=',target.revision)));}
     catch(error){
      // A replacement can revoke the old version before its head notification arrives.
      if(cloudCode(error)==='permission-denied'){
       const current=await getDocFromServer(root);if(stopped)return;
       const value=current.data() as CloudHead|undefined;
       if(value&&value.activeVersion!==target.activeVersion){head=value;changedVersion=true;break;}
      }
      throw error;
     }
     if(stopped)return;
     onActivity({returnedDocuments:result.size});
     if(result.metadata.hasPendingWrites)throw Object.assign(new Error('Waiting for the current save to finish.'),{code:'sync/waiting'});
     const values=new Map<string,{id:string}>((data[kind] as {id:string}[]).map(value=>[value.id,value]));
     for(const item of result.docs){const record=item.data();if(!Number.isInteger(record.revision)||record.revision<1)throw new Error('Cloud record revision is invalid.');if(record.deleted){values.delete(item.id);}else{if(!record.data||record.data.id!==item.id)throw new Error('Cloud record ID is invalid.');values.set(item.id,record.data);}}
     (data[kind] as unknown)=[...values.values()];
    }
    if(changedVersion)continue;
    const checked=await getDocFromServer(root);if(stopped)return;
    const current=checked.data() as CloudHead|undefined;
    if(!current){onState('empty');return;}
    if(current.revision!==target.revision||current.activeVersion!==target.activeVersion||current.state!=='ready'){
     head=current;if(current.state!=='ready'){onState('initializing');return;}continue;
    }
    // A newer head or an acknowledged local save must never be overwritten.
    if(head&&head.revision>target.revision)continue;
    if(baseline&&baseline.revision>target.revision)continue;
    validateData(data);
    publish({data:normalizeData(data),revision:target.revision,datasetVersion:target.activeVersion,clientSchema:target.clientSchema});
    if(headOnline)onState('online');else onState('offline');
    return;
   }
   if(!stopped){waitForNewRevision=true;waitingAt=head&&headKey(head);onError(Object.assign(new Error('The wedding is changing quickly. Showing the last complete copy; another update or Retry connection will check again.'),{code:'sync/waiting'}));}
  }catch(error){if(!stopped){waitForNewRevision=true;waitingAt=head&&headKey(head);onError(error);}}
  finally{running=false;if(!stopped&&!waitForNewRevision&&head&&headOnline&&(!baseline||head.revision>baseline.revision||head.activeVersion!==baseline.datasetVersion))schedule();}
 }
 const stopHead=onSnapshot(root,{includeMetadataChanges:true},snapshot=>{
  if(stopped||snapshot.metadata.hasPendingWrites)return;
  headOnline=!snapshot.metadata.fromCache;
  if(!headOnline){onState('offline');return;}
  if(!snapshot.exists()){onState('empty');return;}
  const value=snapshot.data() as CloudHead;
  if(head&&value.revision<head.revision)return;
  const changed=!head||value.revision!==head.revision||value.activeVersion!==head.activeVersion;
  head=value;
  if(head.state!=='ready'){onState('initializing');return;}
  if(!running){if(changed||!baseline||baseline.revision!==head.revision||baseline.datasetVersion!==head.activeVersion)onState('syncing');schedule();}
 },error=>{if(!stopped)onError(error);});
 return {stop(){stopped=true;clearTimeout(timer);stopHead();},acknowledge(snapshot){
  if(stopped||(baseline&&snapshot.revision<baseline.revision))return;
  waitingAt=undefined;publish(snapshot);
  if(headOnline&&(!head||(head.revision<=snapshot.revision&&head.activeVersion===snapshot.datasetVersion)))onState('online');
  else schedule();
 }};
}
