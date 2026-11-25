import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useCloud} from './CloudAccess';
import {cloudError} from './firebase';
import {commitTasks,readTaskSnapshot,registerTaskBridge,taskLocal,taskPeople,verifyTaskRole,watchTaskRole,watchTasks,type TaskLocal} from './taskStore';
import {emptyTasks,mergeTaskData,planTaskBatches,taskChanges,validateTaskChanges,type TaskConflict,type TaskData,type TaskPerson,type TaskRole,type TaskSnapshot} from './taskModel';
import {Confirm} from './dialogs';

type TasksAccess={role:TaskRole;people:TaskPerson[];snapshot:TaskSnapshot;data:TaskData;ready:boolean;busy:boolean;error:string;pending:number;offline:boolean;canEdit:boolean;refresh:()=>void;save:(next:TaskData,before?:TaskSnapshot)=>Promise<void>;exportData:()=>void};
const TasksContext=createContext<TasksAccess|null>(null);
export const useTasks=()=>{const value=useContext(TasksContext);if(!value)throw new Error('Tasks are unavailable.');return value;};
export function TaskProvider({children}:{children:ReactNode}){
 const cloud=useCloud(),scope=cloud.scope,owner=useRef(crypto.randomUUID()).current;
 const [role,setRole]=useState<TaskRole>('none'),[people,setPeople]=useState<TaskPerson[]>([]),[snapshot,setSnapshot]=useState<TaskSnapshot>({revision:0,data:emptyTasks()}),[local,setLocal]=useState<TaskLocal>(),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0),[conflicts,setConflicts]=useState<TaskConflict[]>([]),[choices,setChoices]=useState<Record<string,'mine'|'cloud'>>({}),[reviewCloud,setReviewCloud]=useState<TaskSnapshot>(),[confirmReview,setConfirmReview]=useState(false);
 const current=useRef({local,snapshot,role,people});current.current={local,snapshot,role,people};const running=useRef(false),alive=useRef(true),permission=useRef(false),generation=useRef(0);
 const workspace=local?.workspace,pending=workspace?taskChanges(workspace.baseline.data,workspace.data).length:0;
 const offline=!!workspace;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function persist(value:TaskLocal,expected?:number){if(!alive.current||current.current.role==='none')throw new Error('Task access is no longer available.');value={...value,people:value.people||current.current.people};await taskLocal(scope,'save',owner,value,expected);if(alive.current){current.current.local=value;setLocal(value);}}
 async function purge(){generation.current++;permission.current=false;current.current.role='none';current.current.local=undefined;await taskLocal(scope,'purge');if(alive.current){setLocal(undefined);setSnapshot({revision:0,data:emptyTasks()});setRole('none');setPeople([]);setConflicts([]);setReviewCloud(undefined);}}
 useEffect(()=>{let stopped=false;void taskLocal(scope,'read').then(value=>{if(stopped)return;if(value){current.current.local=value;setLocal(value);setSnapshot(value.snapshot);setRole(value.role);setPeople(value.people||[]);}setReady(true);}).catch(cause=>{if(!stopped){setError(cloudError(cause));setReady(true);}});return()=>{stopped=true;};},[scope]);
 useEffect(()=>{
  if(!ready)return;let stopped=false,stopRole=()=>{},stopTasks=()=>{};permission.current=false;
  if(!cloud.permissionVerified)return;
  async function start(){try{const verified=await verifyTaskRole(scope);if(stopped)return;permission.current=true;setRole(verified);
   if(verified==='none'){stopRole=watchTaskRole(scope,false,next=>{if(!stopped&&next!=='none')setRetry(n=>n+1);},cause=>{if(!stopped)setError(cloudError(cause));});await purge();return;}
   const members=await taskPeople(scope);if(stopped)return;setPeople(members);
   stopRole=watchTaskRole(scope,verified==='owner',next=>{if(stopped)return;if(next==='none'){stopTasks();void purge().catch(cause=>setError(cloudError(cause)));}else{permission.current=true;setRole(next);current.current.role=next;const saved=current.current.local;if(saved)void taskLocal(scope,'cache',owner,{...saved,role:next}).catch(cause=>setError(cloudError(cause)));void taskPeople(scope).then(value=>{if(!stopped)setPeople(value);}).catch(cause=>setError(cloudError(cause)));}},cause=>{permission.current=false;setError(cloudError(cause));});
   if(cloud.workMode==='offline'){setError('');return;}
   stopTasks=watchTasks(scope,value=>{if(stopped)return;setSnapshot(value);current.current.snapshot=value;setError('');void taskLocal(scope,'cache',owner,{scope,role:current.current.role,people:current.current.people,snapshot:value,verifiedAt:new Date().toISOString()}).then(cached=>{if(!stopped&&cached){setLocal(cached);current.current.local=cached;}}).catch(cause=>setError(cloudError(cause)));},cause=>{if(!stopped)setError(cloudError(cause));});
  }catch(cause){if(!stopped){permission.current=false;setError(cloudError(cause));}}}
  void start();return()=>{stopped=true;permission.current=false;stopRole();stopTasks();};
 },[scope,ready,cloud.permissionVerified,cloud.role,cloud.workMode,retry]);
 useEffect(()=>{if(!workspace)return;const claim=()=>void taskLocal(scope,'claim',owner).catch(cause=>{if(alive.current)setError(cloudError(cause));});claim();const timer=setInterval(claim,10000);return()=>{clearInterval(timer);void taskLocal(scope,'release',owner);};},[!!workspace,scope]);
 async function prepare(){if(current.current.role==='none')return;if(!permission.current)throw new Error('Verify task access before starting offline work.');if(current.current.local?.workspace)return;const baseline=await readTaskSnapshot(scope);await persist({scope,role:current.current.role,snapshot:baseline,verifiedAt:new Date().toISOString(),workspace:{baseline,data:structuredClone(baseline.data),revision:1}});}
 async function save(next:TaskData,before?:TaskSnapshot){
  if(running.current)throw new Error('Another task save is in progress.');const session=generation.current;running.current=true;setBusy(true);setError('');
  try{const value=current.current,work=value.local?.workspace,base=before||{revision:work?.revision??value.snapshot.revision,data:work?.data??value.snapshot.data};validateTaskChanges(base.data,next,value.role,scope.uid,value.people);
   if(work){if(base.revision!==work.revision)throw new Error('Local tasks changed. Reopen this draft and review.');await persist({...value.local!,role:value.role,workspace:{...work,data:next,revision:work.revision+1}},work.revision);}
   else {if(!permission.current||cloud.workMode==='offline')throw new Error('Wait for a complete task copy before editing.');const result=await commitTasks(scope,base,next,value.people);if(!alive.current||session!==generation.current)throw new Error('Task access changed during saving.');current.current.snapshot=result;setSnapshot(result);await taskLocal(scope,'cache',owner,{scope,role:value.role,people:value.people,snapshot:result,verifiedAt:new Date().toISOString()});}
  }catch(cause){setError(cloudError(cause));throw cause;}finally{running.current=false;setBusy(false);}
 }
 async function sync(useChoices:Record<string,'mine'|'cloud'>={}):Promise<boolean>{
  if(running.current)return false;const value=current.current;if(!value.local?.workspace)return true;running.current=true;setBusy(true);setError('');
  try{const verified=await verifyTaskRole(scope);if(verified==='none'){await purge();throw new Error('Task access was removed. Local task copies were cleared.');}const members=await taskPeople(scope),latest=await readTaskSnapshot(scope),work=value.local.workspace;
   const result=mergeTaskData(work.baseline.data,work.data,latest.data,useChoices);validateTaskChanges(latest.data,result.data,verified,scope.uid,members);
   if(result.conflicts.some(conflict=>!useChoices[conflict.key])){setReviewCloud(latest);setConflicts(result.conflicts);setChoices(useChoices);return false;}
   let confirmed=latest,localRevision=work.revision;
   const batches=planTaskBatches(latest.data,result.data);
   for(const batch of batches){confirmed=await commitTasks(scope,confirmed,batch,members);await persist({scope,role:verified,people:members,snapshot:confirmed,verifiedAt:new Date().toISOString(),workspace:{baseline:confirmed,data:result.data,revision:localRevision+1}},localRevision);localRevision++;}
   setSnapshot(confirmed);current.current.snapshot=confirmed;setRole(verified);setPeople(members);setConflicts([]);setReviewCloud(undefined);
   await persist({scope,role:verified,people:members,snapshot:confirmed,verifiedAt:new Date().toISOString(),workspace:{baseline:confirmed,data:structuredClone(confirmed.data),revision:localRevision+1}},localRevision);return true;
  }catch(cause){setError(cloudError(cause));return false;}finally{running.current=false;setBusy(false);}
 }
 async function discard(){const value=current.current;if(!value.local?.workspace)return;await persist({...value.local,workspace:undefined},value.local.workspace.revision);setConflicts([]);setReviewCloud(undefined);}
 // Leaving app offline mode is allowed only after its combined controls settle task work.
 const previousMode=useRef(cloud.workMode);
 useEffect(()=>{const previous=previousMode.current;previousMode.current=cloud.workMode;if(previous==='offline'&&cloud.workMode==='live'&&workspace&&!pending)void discard().catch(cause=>setError(cloudError(cause)));},[cloud.workMode]);
 useEffect(()=>registerTaskBridge(scope,{pending,busy,prepare,sync,discard}));
 function exportData(){const value=current.current;if(value.role==='none')return;const data=value.local?.workspace?.data||value.snapshot.data;const url=URL.createObjectURL(new Blob([JSON.stringify({format:'weddingstay-tasks',weddingId:scope.weddingId,exportedAt:new Date().toISOString(),data},null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`weddingstay-tasks-${scope.weddingId}-${Date.now()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 const data=workspace?.data||snapshot.data,activeSnapshot=workspace?{revision:workspace.revision,data}:snapshot;
 return <TasksContext.Provider value={{role,people,snapshot:activeSnapshot,data,ready,busy,error,pending,offline,canEdit:ready&&role!=='none'&&!busy&&(offline||permission.current),refresh:()=>setRetry(n=>n+1),save,exportData}}>{children}
 {conflicts.length>0&&reviewCloud&&<div className="confirm-overlay"><section className="confirm-dialog task-conflicts" role="dialog" aria-modal="true" aria-label="Review task conflicts"><h2>Review task conflicts</h2><p>Task records changed both here and in the cloud. Choose a version for each record.</p>{conflicts.map(conflict=><fieldset key={conflict.key}><legend>{conflict.name}</legend>{(['mine','cloud'] as const).map(side=><label key={side}><input type="radio" name={conflict.key} disabled={busy} checked={choices[conflict.key]===side} onChange={()=>setChoices({...choices,[conflict.key]:side})}/>{side==='mine'?'Keep mine':'Keep cloud'}<pre>{JSON.stringify(conflict[side]??'Removed',null,2)}</pre></label>)}</fieldset>)}{error&&<p className="field-error" role="alert">{error}</p>}<button className="button primary" disabled={busy||conflicts.some(c=>!choices[c.key])} onClick={()=>setConfirmReview(true)}>Sync selected versions</button><button className="quiet-button" disabled={busy} onClick={()=>{setConflicts([]);setReviewCloud(undefined);}}>Keep working offline</button></section></div>}
 {confirmReview&&<Confirm title="Sync reviewed task changes?" text="Your selected versions will be checked against the latest plan and your current permissions." action="Sync tasks" onCancel={()=>setConfirmReview(false)} onConfirm={()=>{setConfirmReview(false);void sync(choices);}}/>}
 </TasksContext.Provider>;
}
