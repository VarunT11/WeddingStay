import {Fragment,createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {onAuthStateChanged,type User} from 'firebase/auth';
import {onSnapshot} from 'firebase/firestore';
import {Cloud,Flower2,LogOut,Upload} from 'lucide-react';
import {auth,cloudError,firebaseConfigured,firebaseSignOut,googleSignIn,weddingId} from './firebase';
import {initializeWedding,membershipRef,watchWedding,type CloudSnapshot} from './cloudStore';
import {parseDataset,serializeDataset,exportFilename} from './transfer';
import {STORAGE_KEY,validateData,type Dataset} from './data';
import {Confirm} from './dialogs';

type Role='owner'|'coordinator';
type Access={user:User;role:Role;snapshot:CloudSnapshot;online:boolean;signOut:()=>Promise<void>};
const CloudContext=createContext<Access|null>(null);
export function useCloud(){const cloud=useContext(CloudContext);if(!cloud)throw new Error('Sign-in is required.');return cloud;}
const cacheKey=(uid:string)=>'weddingstay.cloud.v1.'+uid+'.'+weddingId;
function clearCache(uid:string){try{localStorage.removeItem(cacheKey(uid));}catch{/* Device storage is optional. */}}
function readCache(uid:string){try{const value=JSON.parse(localStorage.getItem(cacheKey(uid))||'null');if(value?.uid!==uid||!['owner','coordinator'].includes(value.role))return null;validateData(value.snapshot.data);return value as {uid:string;role:Role;snapshot:CloudSnapshot};}catch{return null;}}
export function CloudAccess({children}:{children:ReactNode}){
 const [user,setUser]=useState<User|null>(null),[authReady,setAuthReady]=useState(false),[role,setRole]=useState<Role|null>(null),[snapshot,setSnapshot]=useState<CloudSnapshot|null>(null),[status,setStatus]=useState('checking'),[error,setError]=useState(''),[signingIn,setSigningIn]=useState(false),[retry,setRetry]=useState(0),[online,setOnline]=useState(navigator.onLine);
 const previousUser=useRef<string|null>(null);
 useEffect(()=>{if(!auth){setAuthReady(true);return;}return onAuthStateChanged(auth,next=>{if(previousUser.current&&previousUser.current!==next?.uid)clearCache(previousUser.current);previousUser.current=next?.uid||null;setUser(next);setRole(null);setSnapshot(null);setStatus('checking');setError('');setAuthReady(true);});},[]);
 useEffect(()=>{const update=()=>{setOnline(navigator.onLine);if(navigator.onLine)setRetry(n=>n+1);};window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
 useEffect(()=>{
  if(!user)return;let stopWedding=()=>{},disposed=false;
  const cached=readCache(user.uid);if(cached){setRole(cached.role);setSnapshot(cached.snapshot);setStatus('offline');}
  const fail=(cause:unknown)=>{if(disposed)return;const code=(cause as {code?:string}).code;if(code==='permission-denied'){clearCache(user.uid);setRole(null);setSnapshot(null);setStatus('denied');}setError(cloudError(cause));};
  const stopMember=onSnapshot(membershipRef(user.uid),{includeMetadataChanges:true},member=>{
   if(disposed||member.metadata.fromCache)return;
   const value=member.data();
   if(!member.exists()||value?.active!==true||!['owner','coordinator'].includes(value.role)){stopWedding();clearCache(user.uid);setRole(null);setSnapshot(null);setStatus('denied');return;}
   const approvedRole=value.role as Role;setRole(approvedRole);setError('');stopWedding();
   stopWedding=watchWedding(next=>{if(disposed)return;setSnapshot(next);try{localStorage.setItem(cacheKey(user.uid),JSON.stringify({uid:user.uid,role:approvedRole,snapshot:next}));}catch{/* Shared saving still works without an offline copy. */}},next=>{if(!disposed)setStatus(next);},fail);
  },fail);
  return()=>{disposed=true;stopMember();stopWedding();};
 },[user?.uid,retry]);
 async function login(){if(signingIn)return;setSigningIn(true);setError('');try{await googleSignIn();}catch(cause){setError(cloudError(cause));}finally{setSigningIn(false);}}
 async function logout(){if(user)clearCache(user.uid);setSnapshot(null);await firebaseSignOut();}
 if(!firebaseConfigured)return <AccessPage title="WeddingStay is being connected"><p>The Firebase configuration is missing. The owner needs to complete deployment setup.</p></AccessPage>;
 if(!authReady)return <AccessPage title="Opening your wedding…"/>;
 if(!user)return <AccessPage title="Your celebration, together."><p>Sign in with an approved Google account to coordinate this wedding.</p><button className="button primary full" disabled={signingIn} onClick={()=>void login()}>{signingIn?'Opening Google…':'Sign in with Google'}</button>{error&&<p className="field-error" role="alert">{error}</p>}</AccessPage>;
 if(role&&snapshot)return <CloudContext.Provider value={{user,role,snapshot,online:online&&status==='online',signOut:logout}}>{error&&<div className="cloud-access-error" role="alert">{error}</div>}<CloudWorkspace snapshot={snapshot}>{children}</CloudWorkspace></CloudContext.Provider>;
 return <AccessPage title={status==='denied'?'Access not granted':role?'Prepare your shared wedding':'Checking your access…'}>
 <p>{user.email}</p>
 {status==='denied'?<><p>Ask the wedding owner to approve this account. Signing in does not automatically grant access.</p><p className="inventory-hint">Your account ID</p><code className="account-id">{user.uid}</code></>:role==='owner'&&(status==='empty'||status==='initializing')?<InitializeCloud status={status}/>:role?<p>The owner is preparing the shared data. No guest records are available yet.</p>:<p>Connect to the internet to verify access. Your previous local data remains on this device.</p>}
 {error&&<p className="field-error" role="alert">{error}</p>}<div className="access-actions"><button className="button secondary" onClick={()=>{setError('');setRetry(n=>n+1);}}>Check again</button><button className="quiet-button" onClick={()=>void logout()}><LogOut size={14}/>Sign out</button></div>
 </AccessPage>;
}
function CloudWorkspace({snapshot,children}:{snapshot:CloudSnapshot;children:ReactNode}){
 const previous=useRef(snapshot.datasetVersion),[replaced,setReplaced]=useState(false),location=useLocation(),navigate=useNavigate();
 useEffect(()=>{if(previous.current===snapshot.datasetVersion)return;previous.current=snapshot.datasetVersion;setReplaced(true);const params=new URLSearchParams(location.search);for(const key of ['room','guest','event','bulk'])params.delete(key);void navigate({pathname:location.pathname,search:params.toString()},{replace:true});},[snapshot.datasetVersion,location.pathname,location.search,navigate]);
 return <>{replaced&&<div className="cloud-replacement-notice" role="alert"><span>The owner replaced the shared dataset. Open forms were closed; please reopen records before editing.</span><button className="quiet-button" onClick={()=>setReplaced(false)}>Dismiss</button></div>}<Fragment key={snapshot.datasetVersion||'legacy'}>{children}</Fragment></>;
}
function AccessPage({title,children}:{title:string;children?:ReactNode}){return <main className="access-page"><section className="access-card"><div className="access-brand"><Flower2 size={30}/><span>WeddingStay</span></div><Cloud className="access-cloud" size={28}/><h1>{title}</h1>{children}</section></main>;}
function InitializeCloud({status}:{status:string}){
 const [candidate,setCandidate]=useState<Dataset|null>(null),[filename,setFilename]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[progress,setProgress]=useState('');const file=useRef<HTMLInputElement>(null);
 function prepare(text:string,name:string){try{setCandidate(parseDataset(text));setFilename(name);setError('');}catch(cause){setCandidate(null);setError(cloudError(cause));}}
 function localCopy(){try{const value=localStorage.getItem(STORAGE_KEY);if(!value)throw new Error('No local working dataset was found at this address. Export the latest JSON from your working device and select it here.');prepare(value,'Saved data from this browser');}catch(cause){setError(cloudError(cause));}}
 function download(){if(!candidate)return;const url=URL.createObjectURL(new Blob([serializeDataset(candidate)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=exportFilename();link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function upload(){if(!candidate||busy)return;setConfirm(false);setBusy(true);setError('');try{await initializeWedding(candidate,setProgress);}catch(cause){setError(cloudError(cause));}finally{setBusy(false);}}
 return <><p>{status==='initializing'?'An import is in progress. Select the same file to resume safely.':'Choose the latest working JSON to initialize the shared wedding. Nothing is uploaded until you review and confirm.'}</p><input hidden ref={file} type="file" accept=".json" onChange={async e=>{const chosen=e.target.files?.[0];if(chosen)prepare(await chosen.text(),chosen.name);e.target.value='';}}/><div className="access-actions"><button className="button primary" disabled={busy} onClick={()=>file.current?.click()}><Upload size={15}/>Choose JSON</button><button className="button secondary" disabled={busy} onClick={localCopy}>Review local copy</button></div>
 {candidate&&<div className="cloud-import-preview"><strong>{filename}</strong><p>{candidate.wedding.name} · {candidate.referenceData?'Fictional reference data':'Wedding data'}</p><p>{candidate.guests.length} guest entries · {candidate.events.length} events · {candidate.invitations.length} invitations</p><p>{candidate.properties.length} properties · {candidate.rooms.length} rooms · {candidate.allocations.length} stays · {candidate.history.length} history entries</p><button className="quiet-button" onClick={download}>Export this copy first</button><button className="button primary full" disabled={busy||!navigator.onLine} onClick={()=>setConfirm(true)}>{busy?'Uploading…':'Initialize shared wedding'}</button></div>}
 {progress&&<p role="status">{progress}</p>}{error&&<p className="field-error" role="alert">{error}</p>}{confirm&&<Confirm title="Initialize the shared wedding?" text="This uploads the reviewed dataset to Firebase for approved coordinators. Existing local data stays on this device. Cloud replacement will be disabled afterward." action="Upload reviewed data" onCancel={()=>setConfirm(false)} onConfirm={()=>void upload()}/>}</>;
}
