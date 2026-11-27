import {CLIENT_SCHEMA} from './schema'; import {useEffect,useMemo,useRef,useState} from 'react';
import {sameScope,scopeKey,type WeddingScope} from './weddingScope';
import {verifyWeddingAccess,isAccessRevoked} from './weddingAccess';
import {auth,cloudError} from './firebase';
import {commitWedding,membershipRef,type CloudSnapshot} from './cloudStore';
import {createWeddingSync,type WeddingSync,type SyncDiagnostics} from './cloudSync';
import {readCloudCache,type CloudRole} from './cloudCache';
import {normalizeData,storedData,validateData,type Dataset} from './data';
import {mergeOffline,offlineEntry,planOfflineBatches,recordChanges,sameRecord,type Choices,type Conflict,type OfflineWorkspace} from './offlineWorkspace';

type Callbacks={revoked:()=>void;pause:()=>void;confirmed:(value:CloudSnapshot,role:CloudRole)=>void;activity:(value:Partial<SyncDiagnostics>)=>void};
type Review={snapshot:CloudSnapshot;conflicts:Conflict[]};
function readOnce(baseline:CloudSnapshot,activity:Callbacks['activity'],cancelled:()=>boolean):Promise<CloudSnapshot>{
 return new Promise((resolve,reject)=>{
  let watcher:WeddingSync|undefined,done=false;
  const finish=(value?:CloudSnapshot,error?:unknown)=>{if(done)return;done=true;clearTimeout(timeout);clearInterval(check);watcher?.stop();if(error)reject(error);else resolve(value!);};
  const timeout=setTimeout(()=>finish(undefined,new Error('The cloud check timed out. Local work is safe; try syncing again.')),30000);
  const check=setInterval(()=>{if(cancelled())finish(undefined,new Error('Sync cancelled. Local work was kept.'));},250);
  try{watcher=createWeddingSync({scope:baseline.scope,baseline,onData:value=>finish(value),onState:state=>{if(state==='empty'||state==='initializing')finish(undefined,new Error('The shared wedding is not ready. Local work was kept.'));},onError:error=>finish(undefined,error),onActivity:activity});}catch(error){finish(undefined,error);}
 });
}
export function useOfflineWorkspace(scope:WeddingScope,callbacks:Callbacks){
 const uid=scope.uid;
 const [reloadVersion,setReloadVersion]=useState(0);
 const [workspace,setWorkspace]=useState<OfflineWorkspace|null>(null),[ready,setReady]=useState(false),[loadedUid,setLoadedUid]=useState<string|undefined>(),[writable,setWritable]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[review,setReview]=useState<Review|null>(null),[replaced,setReplaced]=useState(false),[verifiedRole,setVerifiedRole]=useState<CloudRole|null>(null),[comparison,setComparison]=useState<CloudSnapshot|null>(null);
 const current=useRef(workspace),owner=useRef(crypto.randomUUID()),actions=useRef(callbacks),generation=useRef(0),working=useRef(false),channel=useRef<BroadcastChannel|null>(null),permissionDenied=useRef(false),exitAfterSync=useRef(false);
 actions.current=callbacks;
 function install(value:OfflineWorkspace|null){current.current=value;setWorkspace(value);}
 function notify(){channel.current?.postMessage('changed');}
 useEffect(()=>{
  generation.current++;let disposed=false,checking=false;install(null);setReady(false);setError('');setMessage('');setReview(null);setReplaced(false);setVerifiedRole(null);setComparison(null);permissionDenied.current=false;exitAfterSync.current=false;
  if(!uid){setLoadedUid(uid);setReady(true);return;}
  async function refresh(){if(disposed||checking||working.current)return;checking=true;try{
   const result=await offlineEntry(scope,owner.current,'claim');if(disposed||working.current)return;
   if(result.workspace){actions.current.pause();if(!current.current||result.workspace.id!==current.current.id||result.workspace.revision!==current.current.revision)install(result.workspace);setWritable(result.writable);}
   else if(current.current){install(null);setWritable(false);}
   setLoadedUid(uid);setReady(true);
  }catch(cause){if(!disposed){setError(cloudError(cause));setLoadedUid(uid);setReady(true);setWritable(false);}}finally{checking=false;}}
  if(typeof BroadcastChannel!=='undefined'){channel.current=new BroadcastChannel('weddingstay-offline.'+scopeKey(scope));channel.current.onmessage=()=>void refresh();}
  void refresh();const interval=setInterval(()=>{if(working.current){void offlineEntry(scope,owner.current,'claim').catch(()=>{});}else void refresh();},5000);
  return()=>{disposed=true;generation.current++;clearInterval(interval);channel.current?.close();channel.current=null;void offlineEntry(scope,owner.current,'release').catch(()=>{});};
 },[scope,reloadVersion]);
 function valid(session:number){return generation.current===session&&auth?.currentUser?.uid===uid;}
 async function persist(next:OfflineWorkspace,expected?:number){const session=generation.current;if(!uid||auth?.currentUser?.uid!==uid)throw new Error('Sign in with the original account before saving locally.');await offlineEntry(scope,owner.current,'save',next,expected);if(!valid(session))throw new Error('The session changed. Local work remains saved for its original account.');install(next);notify();}
 async function enter(snapshot:CloudSnapshot,role:CloudRole,liveConfirmed=false){
  if(!uid||working.current)return;working.current=true;setBusy(true);setError('');const session=generation.current;
  try{
   if(!sameScope(snapshot.scope,scope))throw new Error('This copy belongs to another wedding.');
   const cached=readCloudCache(scope);if(!liveConfirmed&&(!cached?.trusted||cached.snapshot.revision!==snapshot.revision||cached.snapshot.datasetVersion!==snapshot.datasetVersion))throw new Error('A complete saved cloud copy is needed before working offline. Reconnect or export your data first.');
   const existing=await offlineEntry(scope,owner.current,'claim');if(existing.workspace)throw new Error('An offline workspace already exists. Reopen the app to resume it.');
   if(!valid(session))return;
   const data=structuredClone(storedData(snapshot.data)) as Dataset;validateData(data);
   await persist({format:2,scope,verifiedAt:cached?.verifiedAt||new Date().toISOString(),id:crypto.randomUUID(),role,baseline:{...snapshot,data},working:data,revision:1,savedAt:new Date().toISOString(),syncedAt:cached?.syncedAt||null},0);actions.current.pause();setWritable(true);setMessage('Offline mode is on. Saves stay on this device until you sync.');
  }catch(cause){setError(cloudError(cause));throw cause;}finally{working.current=false;setBusy(false);}
 }
 async function save(before:CloudSnapshot,next:Dataset):Promise<CloudSnapshot>{
  const value=current.current;if(!value||!writable||permissionDenied.current||working.current||review||replaced)throw new Error('Offline editing is paused. Finish the sync review or reopen this workspace.');
  if(!sameScope(before.scope,scope))throw new Error('This draft belongs to another wedding.');
  if(before.revision!==value.revision||recordChanges(before.data,value.working).length)throw new Error('The saved copy changed. Close this form and reopen it before editing.');
  working.current=true;setBusy(true);setError('');
  try{const data=storedData(normalizeData(next)) as Dataset;validateData(data);const saved={...value,working:data,revision:value.revision+1,savedAt:new Date().toISOString()};await persist(saved,value.revision);setMessage('Saved on this device.');return {scope,data:normalizeData(data),revision:saved.revision,datasetVersion:value.baseline.datasetVersion,clientSchema:value.baseline.clientSchema};}
  catch(cause){setError(cloudError(cause));throw cause;}finally{working.current=false;setBusy(false);}
 }
 async function syncChanges(choices:Choices={},returnLive=false):Promise<boolean>{
  if(!uid||!current.current||working.current||!writable)return false;
  if(returnLive)exitAfterSync.current=true;
  working.current=true;setBusy(true);setError('');setMessage('Checking the latest cloud data…');const session=generation.current;
  let value=current.current;
  const assertActive=()=>{if(!valid(session))throw new Error('Sign in with the original account to continue syncing.');};
  try{
   if(!navigator.onLine)throw new Error('Connect to the internet to sync. Local work is safe.');
   const lease=await offlineEntry(scope,owner.current,'claim');if(!lease.writable||lease.workspace?.revision!==value.revision)throw new Error('Another tab changed this workspace. Reopen it before syncing.');
   const role=await verifyWeddingAccess(scope);assertActive();permissionDenied.current=false;setVerifiedRole(role);
   let latest=await readOnce(value.baseline,change=>actions.current.activity(change),()=>!valid(session));assertActive();setComparison(latest);
   if(latest.datasetVersion!==value.baseline.datasetVersion){setReplaced(true);throw new Error('The owner replaced the cloud dataset. Export your local work, then discard this workspace to start from the replacement.');}
   // A transaction may have committed before its acknowledgement or local checkpoint failed.
   // Recognise its exact after-image so subsequent local edits do not conflict with our own batch.
   if(value.upload&&latest.revision>value.upload.before.revision&&recordChanges(value.upload.before.data,value.upload.after).every(change=>sameRecord((latest.data[change.kind] as {id:string}[]).find(row=>row.id===change.id),change.value))){value={...value,baseline:{...value.upload.before,data:value.upload.after,revision:value.upload.before.revision+1,clientSchema:CLIENT_SCHEMA},upload:undefined};}
   if(value.role==='owner'&&role!=='owner'&&recordChanges(value.baseline.data,value.working).some(change=>change.kind==='guestCategories'))throw new Error('Your role changed. Category management changes need owner review before syncing. Export your local work for the owner.');
   const useChoices=review?.snapshot.revision===latest.revision&&review.snapshot.datasetVersion===latest.datasetVersion?choices:{};
   const merged=mergeOffline(value.baseline.data,value.working,latest.data,useChoices);
   if(merged.conflicts.some(conflict=>!useChoices[conflict.key])){setReview({snapshot:latest,conflicts:merged.conflicts});setMessage('Choose which version to keep for each conflicting record.');return false;}
   validateData(merged.data);setMessage('Preparing safe upload batches…');await new Promise(resolve=>setTimeout(resolve,0));assertActive();const batches=planOfflineBatches(latest.data,merged.data,latest.clientSchema);setReview(null);
   value={...value,role,verifiedAt:new Date().toISOString(),baseline:latest,working:merged.data,revision:value.revision+1,progress:{completed:0,total:batches.length},upload:undefined};await persist(value,current.current!.revision);
   actions.current.confirmed(latest,role);
   for(let index=0;index<batches.length;index++){
    assertActive();setMessage(`Syncing batch ${index+1} of ${batches.length}. Completed batches are visible to coordinators.`);
    const expected=value.revision;value={...value,revision:expected+1,upload:{before:latest,after:batches[index]}};await persist(value,expected);
    // Recheck the lease immediately before every revision-checked transaction.
    const lock=await offlineEntry(scope,owner.current,'claim');assertActive();if(!lock.writable||lock.workspace?.revision!==value.revision)throw new Error('This tab lost the workspace lock. Remaining changes were kept.');
    latest=await commitWedding(scope,latest,batches[index]);assertActive();actions.current.confirmed(latest,role);
    const savedRevision=value.revision;value={...value,baseline:latest,revision:savedRevision+1,upload:undefined,progress:{completed:index+1,total:batches.length},syncedAt:new Date().toISOString()};await persist(value,savedRevision);
   }
   const expected=value.revision;value={...value,baseline:latest,working:storedData(latest.data) as Dataset,revision:expected+1,progress:undefined,upload:undefined,syncedAt:new Date().toISOString()};await persist(value,expected);
   setMessage('All changes synced. You are still working offline.');setReplaced(false);setComparison(null);
   if(exitAfterSync.current){await offlineEntry(scope,owner.current,'remove',undefined,value.revision,value.id);install(null);notify();exitAfterSync.current=false;}
   return true;
  }catch(cause){if(valid(session)){exitAfterSync.current=false;if(isAccessRevoked(cause)){permissionDenied.current=true;actions.current.revoked();return false;}setError(cloudError(cause)+' Remaining local work is kept.');setMessage('Sync paused. Export a backup or try syncing again.');}return false;}
  finally{working.current=false;setBusy(false);}
 }
 async function discard(){if(!uid||!current.current||working.current)return false;working.current=true;setBusy(true);try{await offlineEntry(scope,owner.current,'remove',undefined,current.current.revision,current.current.id);install(null);setReview(null);setReplaced(false);setError('');exitAfterSync.current=false;notify();return true;}catch(cause){setError(cloudError(cause));return false;}finally{working.current=false;setBusy(false);}}
 async function revoke(){permissionDenied.current=true;generation.current++;actions.current.pause();install(null);setWritable(false);setReview(null);setComparison(null);await offlineEntry(scope,owner.current,'purge');notify();}
 const snapshot=useMemo<CloudSnapshot|undefined>(()=>workspace?{scope,data:workspace.working,revision:workspace.revision,datasetVersion:workspace.baseline.datasetVersion,clientSchema:workspace.baseline.clientSchema}:undefined,[workspace]);
 return {reload:()=>setReloadVersion(value=>value+1),revoke,ready:ready&&loadedUid===uid,workspace:loadedUid===uid?workspace:null,snapshot:loadedUid===uid?snapshot:undefined,writable,editable:writable&&!permissionDenied.current,busy,error,message,review,replaced,verifiedRole,comparison,pending:workspace?recordChanges(workspace.baseline.data,workspace.working).length:0,enter,save,syncChanges,discard,cancelReview:()=>{setReview(null);exitAfterSync.current=false;setMessage('Review cancelled. Local work is unchanged.');}};
}
