import {Fragment,createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {type User} from 'firebase/auth';
import {useLocation,useNavigate} from 'react-router-dom';
import {auth,cloudError} from './firebase';
import {commitWedding,initializeWedding,type CloudSnapshot} from './cloudStore';
import {createWeddingSync,cloudCode,syncLabels,type SyncStatus,type SyncDiagnostics,type WeddingSync} from './cloudSync';
import {readCloudCache,writeCloudCache,type CloudRole} from './cloudCache';
import {parseDataset,serializeDataset,exportFilename} from './transfer';
import {type Dataset} from './data';
import {Confirm} from './dialogs';
import {useOfflineWorkspace} from './useOfflineWorkspace';
import {OfflineBanner} from './OfflineControls';
import {sameScope,type WeddingScope} from './weddingScope';
import {isAccessRevoked,verifyWeddingAccess,watchWeddingAccess} from './weddingAccess';
import {migrateOfflineWorkspace,offlineEntry,localWorkspaceWeddingIds} from './offlineWorkspace';
import {WeddingDirectory,DirectoryPage,purgeWedding} from './WeddingDirectory';
import './cloud-sync.css';

type Access={scope:WeddingScope;user:User;role:CloudRole;snapshot:CloudSnapshot;online:boolean;canEdit:boolean;workMode:'live'|'offline';offline:ReturnType<typeof useOfflineWorkspace>;workOffline:()=>Promise<void>;status:SyncStatus;lastSyncedAt:string|null;cacheWarning:string;diagnostics:SyncDiagnostics;retryConnection:()=>void;reportError:(error:unknown)=>void;commit:(before:CloudSnapshot,next:Dataset)=>Promise<CloudSnapshot>;exportCopy:()=>void;signOut:()=>Promise<void>;chooseWedding:()=>void;permissionVerified:boolean};
const CloudContext=createContext<Access|null>(null);
export function useCloud(){const value=useContext(CloudContext);if(!value)throw new Error('Sign-in is required.');return value;}
export function CloudAccess({children}:{children:ReactNode}){return <WeddingDirectory>{(scope,user,onChoose,onLogout)=><WeddingAccess scope={scope} user={user} onChoose={onChoose} onLogout={onLogout}>{children}</WeddingAccess>}</WeddingDirectory>;}
export function CloudSyncNotice({controlsDisabled=false}:{controlsDisabled?:boolean}){
 const cloud=useCloud();
 if(cloud.workMode==='offline')return <>{!cloud.permissionVerified&&<p className="cloud-access-error" role="status">Access verification pending. Local work is kept; cloud reads and uploads are paused.</p>}<OfflineBanner disabled={controlsDisabled}/></>;
 if(cloud.status==='online'&&!cloud.cacheWarning)return null;
 return <section className="cloud-sync-banner" role="status"><div><strong>{syncLabels[cloud.status]}</strong><p>{cloud.permissionVerified?'Showing the last complete saved copy until sync finishes.':'Showing a previously authorised copy. Cloud reads and saves wait for access verification.'}</p><small>Last cloud sync: {cloud.lastSyncedAt?new Date(cloud.lastSyncedAt).toLocaleString():'Not recorded'}</small>{cloud.cacheWarning&&<p>{cloud.cacheWarning}</p>}</div><div className="cloud-sync-actions"><button className="button secondary" disabled={cloud.status==='checking'} onClick={cloud.retryConnection}>Retry connection</button><button className="text-link" onClick={cloud.exportCopy}>Export saved copy</button></div></section>;
}
function WeddingAccess({scope,user,onChoose,onLogout,children}:{scope:WeddingScope;user:User;onChoose:()=>void;onLogout:()=>Promise<void>;children:ReactNode}){
 const [cached]=useState(()=>readCloudCache(scope));
 const [role,setRole]=useState<CloudRole|null>(cached?.role||null),[snapshot,setSnapshot]=useState<CloudSnapshot|null>(cached?.snapshot||null),[status,setStatus]=useState<SyncStatus>(cached?'offline':'checking'),[error,setError]=useState(''),[lastSyncedAt,setLastSyncedAt]=useState<string|null>(cached?.syncedAt||null),[cacheWarning,setCacheWarning]=useState(''),[permissionVerified,setPermissionVerified]=useState(false),[retry,setRetry]=useState(0),[exit,setExit]=useState<'switch'|'logout'|null>(null);
 const [diagnostics,setDiagnostics]=useState<SyncDiagnostics>({fullLoads:0,incrementalLoads:0,returnedDocuments:0,cacheRestores:cached?1:0});
 const sync=useRef<WeddingSync|null>(null),snapshotRef=useRef(snapshot),writing=useRef(false),denied=useRef(false),mounted=useRef(true),verifiedAt=useRef(cached?.verifiedAt||''),permission=useRef(false),roleRef=useRef(role);
 permission.current=permissionVerified;roleRef.current=role;
 const offline=useOfflineWorkspace(scope,{pause:()=>{sync.current?.stop();sync.current=null;},revoked:()=>void revoke(),confirmed:(value,approvedRole)=>accept(value,approvedRole),activity});
 const offlineEnabled=!!offline.workspace;
 function activity(change:Partial<SyncDiagnostics>){if(!mounted.current)return;setDiagnostics(previous=>({...previous,...Object.fromEntries(Object.entries(change).map(([key,count])=>[key,previous[key as keyof SyncDiagnostics]+(count||0)]))}));}
 function accept(value:CloudSnapshot,approvedRole:CloudRole|null=roleRef.current){
  if(!mounted.current||denied.current||auth?.currentUser?.uid!==scope.uid||!sameScope(value.scope,scope)||!approvedRole)return;
  snapshotRef.current=value;setSnapshot(value);setRole(approvedRole);const at=new Date().toISOString();setLastSyncedAt(at);
  setCacheWarning(writeCloudCache(scope,approvedRole,value,at,verifiedAt.current)?'':'The local cloud backup could not be updated.');
 }
 async function cloudFailure(cause:unknown){
  if(!mounted.current)return;
  if(isAccessRevoked(cause)){await revoke();return;}
  if(cloudCode(cause)==='permission-denied')try{await verifyWeddingAccess(scope);}catch(check){if(isAccessRevoked(check)){await revoke();return;}}
  if(!mounted.current)return;permission.current=false;sync.current?.stop();sync.current=null;setPermissionVerified(false);setStatus(cloudCode(cause)==='resource-exhausted'?'quota':'error');setError(cloudError(cause));
 }
 async function revoke(){
  denied.current=true;permission.current=false;sync.current?.stop();sync.current=null;snapshotRef.current=null;
  if(mounted.current){setPermissionVerified(false);setSnapshot(null);setRole(null);setStatus('denied');setError('Your wedding access is no longer active. Local copies have been removed.');setExit(null);}
  try{await offline.revoke();await purgeWedding(scope);}catch{if(mounted.current)setError('Access revoked. Local storage cleanup could not finish; clear this site’s storage before sharing this device.');}
 }
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;sync.current?.stop();};},[]);
 useEffect(()=>{
  let stopped=false,stop=()=>{},session=0;
  function pending(){permission.current=false;sync.current?.stop();sync.current=null;if(!stopped){setPermissionVerified(false);setStatus(navigator.onLine?'checking':'offline');}}
  async function start(){const run=++session;stop();stop=()=>{};pending();if(!navigator.onLine)return;
   try{
    const approvedRole=await verifyWeddingAccess(scope);if(stopped||run!==session)return;
    await offlineEntry(scope,'access-control','authorize');const migrated=await migrateOfflineWorkspace(scope,approvedRole);if(stopped||run!==session)return;
    const legacy=readCloudCache(scope,true);if(!snapshotRef.current&&legacy){snapshotRef.current=legacy.snapshot;setSnapshot(legacy.snapshot);setLastSyncedAt(legacy.syncedAt);}
    stop=watchWeddingAccess(scope,nextRole=>{if(stopped||run!==session)return;denied.current=false;verifiedAt.current=new Date().toISOString();permission.current=true;roleRef.current=nextRole;setRole(nextRole);setPermissionVerified(true);setError('');if(snapshotRef.current)writeCloudCache(scope,nextRole,snapshotRef.current,lastSyncedAt||new Date().toISOString(),verifiedAt.current);},pending,cause=>{if(!stopped&&run===session)fail(cause);});
    setRole(approvedRole);if(migrated)offline.reload();
   }catch(cause){if(!stopped&&run===session)fail(cause);}
  }
  function fail(cause:unknown){permission.current=false;setPermissionVerified(false);sync.current?.stop();sync.current=null;if(isAccessRevoked(cause)){void revoke();return;}setStatus(cloudCode(cause)==='resource-exhausted'?'quota':navigator.onLine?'error':'offline');setError(cloudError(cause));}
  function disconnected(){session++;stop();stop=()=>{};pending();}
  void start();window.addEventListener('online',start);window.addEventListener('offline',disconnected);
  return()=>{stopped=true;session++;stop();window.removeEventListener('online',start);window.removeEventListener('offline',disconnected);};
 },[scope,retry]);
 useEffect(()=>{
  if(!permissionVerified||!role||!offline.ready||offlineEnabled||denied.current)return;
  let stopped=false;
  const watcher=createWeddingSync({scope,baseline:snapshotRef.current||undefined,onData:value=>{if(!stopped&&permission.current)accept(value,role);},onState:next=>{if(stopped)return;setStatus(next);},onError:cause=>{if(stopped)return;void cloudFailure(cause);},onActivity:activity});
  sync.current=watcher;return()=>{stopped=true;watcher.stop();if(sync.current===watcher)sync.current=null;};
 },[scope,permissionVerified,role,offline.ready,offlineEnabled,retry]);
 async function commit(before:CloudSnapshot,next:Dataset){
  if(denied.current||!sameScope(before.scope,scope))throw new Error('This draft is no longer authorised for this wedding.');
  if(offlineEnabled)return offline.save(before,next);
  if(!permission.current||status!=='online'||!navigator.onLine)throw new Error('Cloud saving is paused. Your draft is kept.');
  if(writing.current)throw new Error('Another save is in progress.');writing.current=true;
  try{const value=await commitWedding(scope,before,next);if(denied.current||!mounted.current)throw new Error('The session changed.');sync.current?.acknowledge(value);accept(value);return value;}catch(cause){void cloudFailure(cause);throw cause;}finally{writing.current=false;}
 }
 function exportCopy(){if(denied.current)return;const saved=offline.snapshot||snapshotRef.current;if(!saved||!sameScope(saved.scope,scope))return;const url=URL.createObjectURL(new Blob([serializeDataset(saved.data)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=scope.weddingId+'-'+exportFilename();link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function hasOpenForm(){return !!document.querySelector('[role="dialog"]');}
 function chooseWedding(){if(offline.busy||writing.current||hasOpenForm()){setError('Close the current form or finish saving before switching weddings.');return;}if(offline.pending)setExit('switch');else onChoose();}
 async function signOut(){if(offline.busy||writing.current||hasOpenForm()){setError('Close the current form before signing out.');return;}const ids=await localWorkspaceWeddingIds(scope.projectId,scope.uid);if(ids.length)setExit('logout');else await onLogout();}
 async function workOffline(){if(denied.current||!snapshot||!role)throw new Error('Wait for a complete authorised copy.');await offline.enter(snapshot,role,permission.current&&status==='online');}
 const activeSnapshot=offline.snapshot||snapshot,activeRole=role||offline.workspace?.role;
 if(status==='denied')return <DirectoryPage title="Access unavailable"><p>{error}</p><button className="button secondary" onClick={onChoose}>Your weddings</button><button className="quiet-button" onClick={()=>setRetry(value=>value+1)}>Recheck access</button></DirectoryPage>;
 if(!offline.ready)return <DirectoryPage title="Opening your saved workspace…"/>;
 if(activeSnapshot&&activeRole)return <CloudContext.Provider value={{scope,user,role:activeRole,snapshot:activeSnapshot,online:permissionVerified&&!offlineEnabled&&status==='online',canEdit:!denied.current&&(offlineEnabled?offline.editable&&!offline.busy&&!offline.review&&!offline.replaced:permissionVerified&&status==='online'),workMode:offlineEnabled?'offline':'live',offline,workOffline,status:offlineEnabled?'offline':status,lastSyncedAt:offlineEnabled?offline.workspace!.syncedAt:lastSyncedAt,cacheWarning,diagnostics,retryConnection:()=>setRetry(value=>value+1),reportError:cause=>void cloudFailure(cause),commit,exportCopy,signOut,chooseWedding,permissionVerified}}>
  {error&&<div className="cloud-access-error" role="alert">{error}</div>}<CloudWorkspace snapshot={activeSnapshot}>{children}</CloudWorkspace>
  {exit&&<Confirm title={exit==='switch'?'Switch wedding?':'Sign out and clear saved copies?'} text={exit==='switch'?'Unsynced changes stay on this device for this wedding and account. You can return to them later.':'All this account’s cached weddings and offline workspaces, including unsynced changes, will be removed from this browser. Cancel to export or sync any work first.'} action={exit==='switch'?'Keep draft and switch':'Clear copies and sign out'} onCancel={()=>setExit(null)} onConfirm={()=>{if(exit==='switch'){setExit(null);onChoose();}else void onLogout().catch(cause=>setError(cloudError(cause)));}}/>}
 </CloudContext.Provider>;
 return <DirectoryPage title={status==='empty'||status==='initializing'?'Set up this wedding':status==='error'?'Connection paused':'Checking wedding access…'}><p>{user.email}</p>{error&&<p className="field-error" role="alert">{error}</p>}{offline.error&&<p className="field-error" role="alert">{offline.error}</p>}{!navigator.onLine&&<p>Connect to load this wedding. Offline reopening needs a previously authorised saved copy for this account.</p>}{role==='owner'&&permissionVerified&&(status==='empty'||status==='initializing')&&<InitializeCloud scope={scope}/>}<div className="access-actions"><button className="button secondary" onClick={()=>setRetry(value=>value+1)}>Retry connection</button><button className="quiet-button" onClick={onChoose}>Your weddings</button></div></DirectoryPage>;
}
function CloudWorkspace({snapshot,children}:{snapshot:CloudSnapshot;children:ReactNode}){
 const previous=useRef(snapshot.datasetVersion),[replaced,setReplaced]=useState(false),location=useLocation(),navigate=useNavigate();
 useEffect(()=>{if(previous.current===snapshot.datasetVersion)return;previous.current=snapshot.datasetVersion;setReplaced(true);const params=new URLSearchParams(location.search);for(const key of ['room','guest','event','bulk','accommodationEdit','rsvp'])params.delete(key);void navigate({pathname:location.pathname,search:params.toString()},{replace:true});},[snapshot.datasetVersion,location.pathname,location.search,navigate]);
 return <>{replaced&&<div className="cloud-replacement-notice" role="alert"><span>The owner replaced this wedding’s dataset. Reopen records before editing.</span><button onClick={()=>setReplaced(false)}>Dismiss</button></div>}<Fragment key={snapshot.datasetVersion||'legacy'}>{children}</Fragment></>;
}
function InitializeCloud({scope}:{scope:WeddingScope}){
 const [candidate,setCandidate]=useState<Dataset|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[confirm,setConfirm]=useState(false);
 return <><p>Select the original JSON to initialise or resume this wedding’s import.</p><input type="file" accept=".json" disabled={busy} onChange={async e=>{const file=e.target.files?.[0];if(file)try{setCandidate(parseDataset(await file.text()));setError('');}catch(cause){setError(cloudError(cause));}}}/>{candidate&&<><p>{candidate.wedding.name} · {candidate.guests.length} guest groups · {candidate.rooms.length} rooms</p><button className="button primary" disabled={busy} onClick={()=>setConfirm(true)}>Reviewed · initialise wedding</button></>}{progress&&<p role="status">{progress}</p>}{error&&<p className="field-error">{error}</p>}{confirm&&candidate&&<Confirm title="Initialise this wedding?" text={'Upload '+candidate.wedding.name+' to the selected wedding. Memberships are not imported.'} action="Upload data" onCancel={()=>setConfirm(false)} onConfirm={async()=>{setConfirm(false);setBusy(true);try{await initializeWedding(scope,candidate,setProgress);}catch(cause){setError(cloudError(cause));}finally{setBusy(false);}}}/>}</>;
}
