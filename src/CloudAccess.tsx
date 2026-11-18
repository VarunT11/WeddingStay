import {AppLogo} from './AppLogo';
import {Fragment,createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {onAuthStateChanged,type User} from 'firebase/auth';
import {onSnapshot} from 'firebase/firestore';
import {LogOut,Upload} from 'lucide-react';
import {auth,cloudError,firebaseConfigured,firebaseSignOut,googleSignIn} from './firebase';
import {commitWedding,initializeWedding,membershipRef,type CloudSnapshot} from './cloudStore';
import {createWeddingSync,cloudCode,isTransientCloudError,syncLabels,type SyncStatus,type SyncDiagnostics,type WeddingSync} from './cloudSync';
import {clearCloudCache,readCloudCache,writeCloudCache,type CloudRole} from './cloudCache';
import {parseDataset,serializeDataset,exportFilename} from './transfer';
import {STORAGE_KEY,type Dataset} from './data';
import {Confirm} from './dialogs';
import './cloud-sync.css';
import {useOfflineWorkspace} from './useOfflineWorkspace';
import {OfflineBanner,OfflineSignOutDialog} from './OfflineControls';

type Access={user:User;role:CloudRole;snapshot:CloudSnapshot;online:boolean;canEdit:boolean;workMode:'live'|'offline';offline:ReturnType<typeof useOfflineWorkspace>;workOffline:()=>Promise<void>;status:SyncStatus;lastSyncedAt:string|null;cacheWarning:string;diagnostics:SyncDiagnostics;retryConnection:()=>void;reportError:(error:unknown)=>void;commit:(before:CloudSnapshot,next:Dataset)=>Promise<CloudSnapshot>;exportCopy:()=>void;signOut:()=>Promise<void>};
const CloudContext=createContext<Access|null>(null);
export function useCloud(){const cloud=useContext(CloudContext);if(!cloud)throw new Error('Sign-in is required.');return cloud;}
export function CloudSyncNotice({controlsDisabled=false}:{controlsDisabled?:boolean}){
 const cloud=useCloud();
 if(cloud.workMode==='offline')return <OfflineBanner disabled={controlsDisabled}/>;
 if(cloud.status==='online'&&!cloud.cacheWarning)return null;
 return <section className="cloud-sync-banner" aria-label="Cloud connection" role="status"><div><strong>{syncLabels[cloud.status]}</strong><p>{cloud.status==='online'?'Cloud changes are saved, but the local backup needs attention.':cloud.status==='syncing'?'Checking changes. The last complete copy is shown until sync finishes.':cloud.status==='quota'?'Cloud saving is paused until the limit recovers. This is the last complete saved copy.':'Cloud saving is paused. Showing the last complete saved copy.'}</p><small>Last successful sync: {cloud.lastSyncedAt?new Date(cloud.lastSyncedAt).toLocaleString():'Not recorded for this older copy'}</small>{cloud.cacheWarning&&<p>{cloud.cacheWarning}</p>}</div><div className="cloud-sync-actions">{cloud.status!=='syncing'&&cloud.status!=='checking'&&<button className="button secondary" onClick={cloud.retryConnection}>Retry connection</button>}<button className="text-link" onClick={cloud.exportCopy}>Export saved copy</button></div></section>;
}
export function CloudAccess({children}:{children:ReactNode}){
 const [user,setUser]=useState<User|null>(null),[authReady,setAuthReady]=useState(false),[role,setRole]=useState<CloudRole|null>(null),[snapshot,setSnapshot]=useState<CloudSnapshot|null>(null),[status,setStatus]=useState<SyncStatus>('checking'),[error,setError]=useState(''),[signingIn,setSigningIn]=useState(false),[lastSyncedAt,setLastSyncedAt]=useState<string|null>(null),[cacheWarning,setCacheWarning]=useState('');
 const [diagnostics,setDiagnostics]=useState<SyncDiagnostics>({fullLoads:0,incrementalLoads:0,returnedDocuments:0,cacheRestores:0});
 const previousUser=useRef<string|null>(null),snapshotRef=useRef<CloudSnapshot|null>(null),statusRef=useRef<SyncStatus>('checking'),sync=useRef<WeddingSync|null>(null),writing=useRef(false),retryAction=useRef(()=>{}),failureAction=useRef<(error:unknown)=>void>(()=>{}),acceptAction=useRef<(snapshot:CloudSnapshot)=>void>(()=>{});
 const stopAction=useRef(()=>{}),[signOutReview,setSignOutReview]=useState(false),[exportedOffline,setExportedOffline]=useState<number|null>(null);
 const offline=useOfflineWorkspace(user?.uid,{pause:()=>stopAction.current(),confirmed:(value,approvedRole)=>{if(auth?.currentUser?.uid!==user?.uid)return;snapshotRef.current=value;setSnapshot(value);setRole(approvedRole);const at=new Date().toISOString();setLastSyncedAt(at);setCacheWarning(writeCloudCache(user!.uid,approvedRole,value,at)?'':'The local cloud backup could not be updated. Export your offline work before closing this browser.');},activity:change=>setDiagnostics(previous=>({...previous,...Object.fromEntries(Object.entries(change).map(([key,count])=>[key,previous[key as keyof SyncDiagnostics]+(count||0)]))}))});
 const offlineEnabled=!!offline.workspace;
 function state(value:SyncStatus){statusRef.current=value;setStatus(value);}
 useEffect(()=>{
  if(!auth){setAuthReady(true);return;}
  return onAuthStateChanged(auth,next=>{
   const uid=next?.uid||null;
   if(previousUser.current!==uid){setSignOutReview(false);setExportedOffline(null);if(previousUser.current)clearCloudCache(previousUser.current);snapshotRef.current=null;setRole(null);setSnapshot(null);setLastSyncedAt(null);setCacheWarning('');state('checking');setError('');}
   previousUser.current=uid;setUser(next);setAuthReady(true);
  });
 },[]);
 useEffect(()=>{
  if(!user||!offline.ready||offlineEnabled)return;
  const uid=user.uid,cached=readCloudCache(uid);
  let disposed=false,memberStop=()=>{},attached=false,blocked=false,retries=0,generation=0,approvedRole:CloudRole|null=null;
  let baseline=cached?.trusted?cached.snapshot:undefined;
  let retryTimer:ReturnType<typeof setTimeout>|undefined;
  if(cached){snapshotRef.current=cached.snapshot;setSnapshot(cached.snapshot);setRole(cached.role);setLastSyncedAt(cached.syncedAt);state('offline');setDiagnostics(previous=>({...previous,cacheRestores:previous.cacheRestores+1}));}
  function stop(){generation++;clearTimeout(retryTimer);memberStop();memberStop=()=>{};attached=false;sync.current?.stop();sync.current=null;}
  stopAction.current=stop;
  function accept(value:CloudSnapshot){
   if(disposed||auth?.currentUser?.uid!==uid||!approvedRole)return;
   if(snapshotRef.current&&value.revision<snapshotRef.current.revision)return;
   baseline=value;snapshotRef.current=value;setSnapshot(value);
   const at=new Date().toISOString();setLastSyncedAt(at);
   setCacheWarning(writeCloudCache(uid,approvedRole,value,at)?'':'The local backup could not be updated. Export your saved copy before closing this browser.');
  }
  function fail(cause:unknown){
   if(disposed)return;
   const code=cloudCode(cause);
   setError(cloudError(cause));
   if(code==='sync/waiting'){state('error');return;}
   stop();
   if(code==='permission-denied'){blocked=true;approvedRole=null;baseline=undefined;clearCloudCache(uid);snapshotRef.current=null;setSnapshot(null);setRole(null);setLastSyncedAt(null);state('denied');return;}
   if(code==='resource-exhausted'){blocked=true;state('quota');return;}
   if(!navigator.onLine){state('offline');return;}
   if(isTransientCloudError(cause)&&retries<3){const delay=[1000,2000,4000][retries++];state('syncing');retryTimer=setTimeout(start,delay);return;}
   blocked=true;state('error');
  }
  function start(){
   if(disposed||blocked)return;
   stop();approvedRole=null;
   if(!navigator.onLine){state('offline');return;}
   state('checking');setError('');attached=true;
   const session=generation;
   const active=()=>!disposed&&!blocked&&session===generation;
   memberStop=onSnapshot(membershipRef(uid),{includeMetadataChanges:true},member=>{
    if(!active()||member.metadata.fromCache||member.metadata.hasPendingWrites)return;
    const value=member.data();
    if(!member.exists()||value?.active!==true||!['owner','coordinator'].includes(value.role)){fail(Object.assign(new Error('This account no longer has access to the wedding.'),{code:'permission-denied'}));return;}
    approvedRole=value.role as CloudRole;setRole(approvedRole);
    if(sync.current)return;
    sync.current=createWeddingSync({baseline,onData:value=>{if(active())accept(value);},onState:next=>{if(!active())return;state(next);if(next==='online'){retries=0;setError('');}},onError:cause=>{if(active())fail(cause);},onActivity:change=>{if(active())setDiagnostics(previous=>({...previous,...Object.fromEntries(Object.entries(change).map(([key,count])=>[key,previous[key as keyof SyncDiagnostics]+(count||0)]))}));}});
   },cause=>{if(active())fail(cause);});
  }
  retryAction.current=()=>{if(disposed)return;blocked=false;retries=0;start();};
  failureAction.current=fail;acceptAction.current=accept;
  function networkOffline(){if(disposed||blocked)return;stop();state('offline');}
  function networkOnline(){if(!disposed&&!blocked&&!attached)start();}
  window.addEventListener('offline',networkOffline);window.addEventListener('online',networkOnline);
  start();
  return()=>{disposed=true;stop();stopAction.current=()=>{};window.removeEventListener('offline',networkOffline);window.removeEventListener('online',networkOnline);retryAction.current=()=>{};failureAction.current=()=>{};acceptAction.current=()=>{};};
 },[user?.uid,offline.ready,offlineEnabled]);
 async function commit(before:CloudSnapshot,next:Dataset){
  if(offlineEnabled)return offline.save(before,next);
  if(statusRef.current!=='online'||!navigator.onLine)throw new Error('Cloud saving is paused. Your draft is kept; reconnect before saving.');
  if(writing.current)throw new Error('Another save is in progress. Your draft is kept.');
  writing.current=true;
  try{const confirmed=await commitWedding(before,next);if(sync.current)sync.current.acknowledge(confirmed);else acceptAction.current(confirmed);return confirmed;}
  catch(cause){if(cloudCode(cause))failureAction.current(cause);throw cause;}
  finally{writing.current=false;}
 }
 function exportCopy(){
  const saved=offline.snapshot||snapshotRef.current;if(!saved)return;
  try{const url=URL.createObjectURL(new Blob([serializeDataset(saved.data)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=offlineEnabled?'offline-work-'+exportFilename():statusRef.current==='online'?exportFilename():'cached-weddingstay-synced-'+(lastSyncedAt?lastSyncedAt.replace(/[:.]/g,'-'):'unknown')+'.json';link.click();if(offlineEnabled)setExportedOffline(offline.workspace?.revision??null);setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(cause){setError(cloudError(cause));}
 }
 async function login(){if(signingIn)return;setSigningIn(true);setError('');try{await googleSignIn();}catch(cause){setError(cloudError(cause));}finally{setSigningIn(false);}}
 async function finishLogout(){if(user)clearCloudCache(user.uid);stopAction.current();snapshotRef.current=null;setSnapshot(null);await firebaseSignOut();setSignOutReview(false);setExportedOffline(null);}
 async function logout(){if(offline.busy)return;if(offline.pending&&exportedOffline!==offline.workspace?.revision){setSignOutReview(true);return;}await finishLogout();}
 async function workOffline(){if(!snapshot||!role||writing.current)throw new Error('Wait for a complete saved copy before working offline.');await offline.enter(snapshot,role,statusRef.current==='online');setExportedOffline(null);}
 if(!firebaseConfigured)return <AccessPage title="WeddingStay is being connected"><p>The Firebase configuration is missing. The owner needs to complete deployment setup.</p></AccessPage>;
 if(!authReady)return <AccessPage title="Opening your wedding…"/>;
 if(!user)return <AccessPage title="Your celebration, together."><p>Sign in with an approved Google account to coordinate this wedding.</p><button className="button primary full" disabled={signingIn} onClick={()=>void login()}>{signingIn?'Opening Google…':'Sign in with Google'}</button>{error&&<p className="field-error" role="alert">{error}</p>}</AccessPage>;
 if(!offline.ready)return <AccessPage title="Opening your saved workspace…"/>;
 const activeSnapshot=offline.snapshot||snapshot,activeRole=offline.workspace?(offline.verifiedRole||offline.workspace.role):role;
 if(activeRole&&activeSnapshot)return <CloudContext.Provider value={{user,role:activeRole,snapshot:activeSnapshot,online:!offlineEnabled&&status==='online',canEdit:offlineEnabled?offline.editable&&!offline.busy&&!offline.review&&!offline.replaced:status==='online',workMode:offlineEnabled?'offline':'live',offline,workOffline,status:offlineEnabled?'offline':status,lastSyncedAt:offlineEnabled?offline.workspace!.syncedAt:lastSyncedAt,cacheWarning,diagnostics,retryConnection:()=>retryAction.current(),reportError:cause=>failureAction.current(cause),commit,exportCopy,signOut:logout}}>{error&&!offlineEnabled&&<div className="cloud-access-error" role="alert">{error}</div>}<CloudWorkspace snapshot={activeSnapshot}>{children}</CloudWorkspace>{signOutReview&&<OfflineSignOutDialog exportReady={exportedOffline===offline.workspace?.revision} onCancel={()=>setSignOutReview(false)} onDiscarded={finishLogout}/>}</CloudContext.Provider>;
 return <AccessPage title={status==='denied'?'Access not granted':status==='quota'?'Cloud limit reached':status==='error'?'Connection paused':status==='syncing'?'Loading your wedding…':role?'Prepare your shared wedding':'Checking your access…'}>
 <p>{user.email}</p>
 {status==='denied'?<><p>Ask the wedding owner to approve this account. Signing in does not automatically grant access.</p><p className="inventory-hint">Your account ID</p><code className="account-id">{user.uid}</code></>:status==='quota'?<p>No complete saved copy is available in this browser. Retry after the cloud limit recovers; your cloud records have not been cleared.</p>:role==='owner'&&(status==='empty'||status==='initializing')?<InitializeCloud status={status} onCloudError={cause=>failureAction.current(cause)}/>:<p>{status==='syncing'?'Fetching a complete, consistent copy.':'A verified connection is needed to open this wedding.'}</p>}
 {error&&<p className="field-error" role="alert">{error}</p>}<div className="access-actions"><button className="button secondary" disabled={status==='checking'||status==='syncing'} onClick={()=>retryAction.current()}>Retry connection</button><button className="quiet-button" onClick={()=>void logout()}><LogOut size={14}/>Sign out</button></div>
 </AccessPage>;
}
function CloudWorkspace({snapshot,children}:{snapshot:CloudSnapshot;children:ReactNode}){
 const previous=useRef(snapshot.datasetVersion),[replaced,setReplaced]=useState(false),location=useLocation(),navigate=useNavigate();
 useEffect(()=>{if(previous.current===snapshot.datasetVersion)return;previous.current=snapshot.datasetVersion;setReplaced(true);const params=new URLSearchParams(location.search);for(const key of ['room','guest','event','bulk','accommodationEdit'])params.delete(key);void navigate({pathname:location.pathname,search:params.toString()},{replace:true});},[snapshot.datasetVersion,location.pathname,location.search,navigate]);
 return <>{replaced&&<div className="cloud-replacement-notice" role="alert"><span>The owner replaced the shared dataset. Open forms were closed; please reopen records before editing.</span><button className="quiet-button" onClick={()=>setReplaced(false)}>Dismiss</button></div>}<Fragment key={snapshot.datasetVersion||'legacy'}>{children}</Fragment></>;
}
function AccessPage({title,children}:{title:string;children?:ReactNode}){return <main className="access-page"><section className="access-card"><div className="access-brand wedding-access-brand"><AppLogo variant="full"/><span>WeddingStay</span></div><h1>{title}</h1>{children}</section></main>;}
function InitializeCloud({status,onCloudError}:{status:string;onCloudError:(cause:unknown)=>void}){
 const [candidate,setCandidate]=useState<Dataset|null>(null),[filename,setFilename]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[progress,setProgress]=useState('');const file=useRef<HTMLInputElement>(null);
 function prepare(text:string,name:string){try{setCandidate(parseDataset(text));setFilename(name);setError('');}catch(cause){setCandidate(null);setError(cloudError(cause));}}
 function localCopy(){try{const value=localStorage.getItem(STORAGE_KEY);if(!value)throw new Error('No local working dataset was found at this address. Export the latest JSON from your working device and select it here.');prepare(value,'Saved data from this browser');}catch(cause){setError(cloudError(cause));}}
 function download(){if(!candidate)return;const url=URL.createObjectURL(new Blob([serializeDataset(candidate)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=exportFilename();link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function upload(){if(!candidate||busy)return;setConfirm(false);setBusy(true);setError('');try{await initializeWedding(candidate,setProgress);}catch(cause){setError(cloudError(cause));if(cloudCode(cause))onCloudError(cause);}finally{setBusy(false);}}
 return <><p>{status==='initializing'?'An import is in progress. Select the same file to resume safely.':'Choose the latest working JSON to initialize the shared wedding. Nothing is uploaded until you review and confirm.'}</p><input hidden ref={file} type="file" accept=".json" onChange={async e=>{const chosen=e.target.files?.[0];if(chosen)prepare(await chosen.text(),chosen.name);e.target.value='';}}/><div className="access-actions"><button className="button primary" disabled={busy} onClick={()=>file.current?.click()}><Upload size={15}/>Choose JSON</button><button className="button secondary" disabled={busy} onClick={localCopy}>Review local copy</button></div>
 {candidate&&<div className="cloud-import-preview"><strong>{filename}</strong><p>{candidate.wedding.name} · {candidate.referenceData?'Fictional reference data':'Wedding data'}</p><p>{candidate.guests.length} guest entries · {candidate.events.length} events · {candidate.invitations.length} invitations</p><p>{candidate.properties.length} properties · {candidate.rooms.length} rooms · {candidate.allocations.length} stays · {candidate.history.length} history entries</p><button className="quiet-button" onClick={download}>Export this copy first</button><button className="button primary full" disabled={busy||!navigator.onLine} onClick={()=>setConfirm(true)}>{busy?'Uploading…':'Initialize shared wedding'}</button></div>}
 {progress&&<p role="status">{progress}</p>}{error&&<p className="field-error" role="alert">{error}</p>}{confirm&&<Confirm title="Initialize the shared wedding?" text="This uploads the reviewed dataset to Firebase for approved coordinators. Existing local data stays on this device. Cloud replacement will be disabled afterward." action="Upload reviewed data" onCancel={()=>setConfirm(false)} onConfirm={()=>void upload()}/>}</>;
}
