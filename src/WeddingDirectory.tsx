import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {onAuthStateChanged,type User} from 'firebase/auth';
import {useLocation,useNavigate} from 'react-router-dom';
import {auth,firebaseConfigured,firebaseProjectId,googleSignIn,firebaseSignOut,cloudError} from './firebase';
import {isAccessRevoked,verifyWeddingAccess,registerProfile,weddingDirectory,type WeddingListing} from './weddingAccess';
import {type WeddingScope,WeddingScopeContext} from './weddingScope';
import {readCloudCache,cachedWeddingIds,clearCloudCache} from './cloudCache';
import {localWorkspaceWeddingIds,offlineEntry} from './offlineWorkspace';
import {emptyDataset,isDate} from './data';
import {initializeWedding} from './cloudStore';
import {Confirm,useDialog} from './dialogs';
import {Plus,CalendarDays,ArrowRight,X,Flower2} from 'lucide-react';
import {AppLogo} from './AppLogo';
import {lastOpenedWedding,forgetOpenedWedding} from './weddingSelection';
import './weddings.css';

const directoryKey=(uid:string)=>'weddingstay.directory.'+firebaseProjectId+'.'+uid;
export async function purgeWedding(scope:WeddingScope){clearCloudCache(scope);await offlineEntry(scope,'access-control','purge');try{const prefix='weddingstay.preference.'+[scope.projectId,scope.uid,scope.weddingId].map(encodeURIComponent).join(':')+'.';for(const key of Object.keys(localStorage))if(key.startsWith(prefix))localStorage.removeItem(key);}catch{/* Local preferences may be unavailable. */}}
export async function clearAccountWeddings(uid:string){
 const ids=new Set([...cachedWeddingIds(firebaseProjectId,uid),...await localWorkspaceWeddingIds(firebaseProjectId,uid),'main']);
 for(const weddingId of ids)await purgeWedding({projectId:firebaseProjectId,uid,weddingId});
 try{localStorage.removeItem(directoryKey(uid));}catch{/* Storage may be unavailable. */}
}
export function WeddingDirectory({children}:{children:(scope:WeddingScope,user:User,onChoose:()=>void,onLogout:()=>Promise<void>)=>ReactNode}){
 const [user,setUser]=useState<User|null>(null),[ready,setReady]=useState(false),[weddings,setWeddings]=useState<WeddingListing[]>([]),[owner,setOwner]=useState(false),[selected,setSelected]=useState<string|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[retry,setRetry]=useState(0),[online,setOnline]=useState(navigator.onLine),[creating,setCreating]=useState(false),[name,setName]=useState(''),[date,setDate]=useState(''),[progress,setProgress]=useState(''),[signOutReview,setSignOutReview]=useState(false);
 const location=useLocation(),navigate=useNavigate(),initial=useRef<string|null>(null),generation=useRef(0),auto=useRef(false),running=useRef(false),previousUid=useRef<string|null>(null),pendingCreate=useRef<{scope:WeddingScope;data:ReturnType<typeof emptyDataset>}|null>(null);
 const currentLocation=useRef(location);currentLocation.current=location;
 useEffect(()=>{if(!auth){setReady(true);return;}return onAuthStateChanged(auth,value=>{generation.current++;if(previousUid.current&&previousUid.current!==value?.uid)void clearAccountWeddings(previousUid.current).catch(()=>{});previousUid.current=value?.uid||null;pendingCreate.current=null;auto.current=false;initial.current=new URLSearchParams(currentLocation.current.search).get('wedding');setUser(value);setSelected(null);setWeddings([]);setOwner(false);setLoaded(false);setError('');setReady(true);});},[]);
 useEffect(()=>{const change=()=>setOnline(navigator.onLine);window.addEventListener('online',change);window.addEventListener('offline',change);return()=>{window.removeEventListener('online',change);window.removeEventListener('offline',change);};},[]);
 useEffect(()=>{
  if(!user)return;let stopped=false;const session=++generation.current;setBusy(true);setOwner(false);
  const active=()=>!stopped&&session===generation.current&&auth?.currentUser?.uid===user.uid;
  function openAutomatically(id:string){
   if(!active()||auto.current)return;auto.current=true;setSelected(id);
   const current=currentLocation.current,params=new URLSearchParams(current.search);params.set('wedding',id);
   void navigate({pathname:current.pathname,search:params.toString(),hash:current.hash},{replace:true,preventScrollReset:true});
  }
  async function cachedListings(){
   let cached:WeddingListing[]=[];try{const value=JSON.parse(localStorage.getItem(directoryKey(user!.uid))||'null');if(value?.projectId===firebaseProjectId&&value.uid===user!.uid&&Array.isArray(value.weddings))cached=value.weddings.filter((w:WeddingListing)=>typeof w.id==='string'&&!w.id.includes('/')&&typeof w.name==='string');}catch{/* No directory copy. */}
   const ids=new Set([...cachedWeddingIds(firebaseProjectId,user!.uid),...await localWorkspaceWeddingIds(firebaseProjectId,user!.uid)]);cached=cached.filter(w=>ids.has(w.id));for(const id of ids)if(!cached.some(w=>w.id===id))cached.push({id,name:id});
   if(!active())return;setWeddings(cached);setLoaded(true);
   if(auto.current)return;
   // An explicit link never silently opens a different wedding.
   if(initial.current){if(ids.has(initial.current))openAutomatically(initial.current);return;}
   const remembered=lastOpenedWedding(firebaseProjectId,user!.uid);
   if(remembered&&ids.has(remembered))openAutomatically(remembered);
   else if(cached.length===1)openAutomatically(cached[0].id);
  }
  async function load(){try{
   if(!navigator.onLine){await cachedListings();return;}
   await registerProfile(user!);if(!active())return;const result=await weddingDirectory();if(!active())return;
   const listings=[...result.weddings],remembered=lastOpenedWedding(firebaseProjectId,user!.uid);
   let complete=true;
   if(!result.owner){
    const allowed=new Set(listings.map(w=>w.id)),ids=new Set([...cachedWeddingIds(firebaseProjectId,user!.uid),...await localWorkspaceWeddingIds(firebaseProjectId,user!.uid),...(remembered?[remembered]:[])]);
    if(!active())return;
    for(const id of ids)if(!allowed.has(id)){
     const target={projectId:firebaseProjectId,uid:user!.uid,weddingId:id};
     try{await verifyWeddingAccess(target);if(!active())return;listings.push({id,name:readCloudCache(target)?.snapshot.data.wedding.name||id});}
     catch(cause){if(!active())return;if(isAccessRevoked(cause)){forgetOpenedWedding(target);await purgeWedding(target);}else{complete=false;if(id===remembered)throw cause;}}
     if(!active())return;
    }
   }else if(remembered&&!listings.some(w=>w.id===remembered))forgetOpenedWedding({projectId:firebaseProjectId,uid:user!.uid,weddingId:remembered});
   setOwner(result.owner);setWeddings(listings);setLoaded(true);setError('');
   try{localStorage.setItem(directoryKey(user!.uid),JSON.stringify({projectId:firebaseProjectId,uid:user!.uid,weddings:listings}));}catch{/* Directory caching is optional. */}
   if(!auto.current){
    const last=lastOpenedWedding(firebaseProjectId,user!.uid);
    const target=initial.current||(!result.owner&&complete&&listings.length===1?listings[0].id:last&&listings.some(w=>w.id===last)?last:null);
    if(target)openAutomatically(target);else auto.current=true;
   }
  }catch(cause){if(active()){await cachedListings();if(active()){setLoaded(true);setError(cloudError(cause));}}}finally{if(active())setBusy(false);}}
  void load();return()=>{stopped=true;};
 },[user?.uid,online,retry]);
 const requested=new URLSearchParams(location.search).get('wedding');
 useEffect(()=>{if(selected&&requested&&requested!==selected)setSelected(requested);else if(selected&&!requested){const params=new URLSearchParams(location.search);params.set('wedding',selected);void navigate({pathname:location.pathname,search:params.toString(),hash:location.hash},{replace:true,preventScrollReset:true});}},[requested,selected,location.pathname,location.search,location.hash,navigate]);
 const selectedId=selected?(requested||selected):null;
 const scope=useMemo<WeddingScope|null>(()=>user&&selectedId?{projectId:firebaseProjectId,uid:user.uid,weddingId:selectedId}:null,[user?.uid,selectedId]);
 async function finishLogout(){if(!user)return;generation.current++;await clearAccountWeddings(user.uid);await firebaseSignOut();setSignOutReview(false);void navigate('/',{replace:true});}
 async function logout(){if(!user)return;const ids=await localWorkspaceWeddingIds(firebaseProjectId,user.uid);if(ids.length)setSignOutReview(true);else await finishLogout();}
 function choose(){auto.current=true;initial.current=null;setSelected(null);setRetry(value=>value+1);void navigate('/',{replace:true});}
 async function create(){if(!user||running.current)return;if(!name.trim()||name.trim().length>200||!isDate(date)){setError('Enter a wedding name and valid default date.');return;}running.current=true;setBusy(true);setError('');try{if(!pendingCreate.current){const data=emptyDataset();data.wedding={name:name.trim(),defaultDate:date};pendingCreate.current={scope:{projectId:firebaseProjectId,uid:user.uid,weddingId:crypto.randomUUID()},data};}const {scope:target,data}=pendingCreate.current,id=target.weddingId;await initializeWedding(target,data,setProgress);if(auth?.currentUser?.uid!==user.uid)return;pendingCreate.current=null;setCreating(false);auto.current=true;setSelected(id);setRetry(value=>value+1);void navigate('/?wedding='+encodeURIComponent(id),{replace:true});}catch(cause){setError(cloudError(cause));}finally{running.current=false;setBusy(false);}}
 if(!firebaseConfigured)return <DirectoryPage title="Firebase configuration is missing"/>;
 if(!ready)return <DirectoryPage title="Opening WeddingStay…"/>;
 if(!user)return <DirectoryPage title="Your celebration, together."><p>Sign in to see the weddings you can access.</p><button className="button primary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await googleSignIn();}catch(cause){setError(cloudError(cause));}finally{setBusy(false);}}}>Sign in with Google</button>{error&&<p className="field-error" role="alert">{error}</p>}</DirectoryPage>;
 if(scope)return <WeddingScopeContext.Provider value={scope}><div key={scope.uid+':'+scope.weddingId}>{children(scope,user,choose,finishLogout)}</div></WeddingScopeContext.Provider>;
 return <DirectoryPage title="Your weddings"><div className="directory-heading-actions"><p className="directory-intro">Choose a celebration to start planning.</p>{owner&&<button className="button primary" disabled={!online||busy} onClick={()=>{setCreating(true);setProgress('');setError('');}}><Plus size={16}/>Create wedding</button>}</div><p className="directory-account">{user.email}{owner?' · App owner':''}</p>{!online&&<p role="status">Offline · showing previously authorised copies only. Access will be checked when you reconnect.</p>}{busy&&<p role="status">{progress||'Checking your wedding access…'}</p>}{error&&<p className="field-error" role="alert">{error}</p>}
  <div className="wedding-directory-list">{weddings.map(wedding=><button key={wedding.id} className="wedding-directory-item" disabled={busy} onClick={()=>{auto.current=true;setSelected(wedding.id);void navigate('/?wedding='+encodeURIComponent(wedding.id),{replace:true});}}><Flower2 size={24} className="directory-card-flower"/><strong>{wedding.name}</strong>{wedding.defaultDate&&<span className="directory-card-date"><CalendarDays size={14}/>{new Date(wedding.defaultDate+'T12:00:00').toLocaleDateString(undefined,{day:'numeric',month:'long',year:'numeric'})}</span>}<span className="directory-card-open">Open wedding <ArrowRight size={16}/></span></button>)}</div>
  {loaded&&!busy&&!weddings.length&&!error&&<p>No weddings assigned yet. Ask the app owner to grant access to your account.</p>}
  {creating&&owner&&<CreateWeddingDialog busy={busy} onClose={()=>setCreating(false)}><form className="allocation-form" onSubmit={e=>{e.preventDefault();void create();}}><label>Wedding name<input required maxLength={200} value={name} disabled={busy||!!pendingCreate.current} onChange={e=>setName(e.target.value)}/></label><label>Wedding date<input required type="date" value={date} disabled={busy||!!pendingCreate.current} onChange={e=>setDate(e.target.value)}/></label><button className="button primary" disabled={busy||!online}>{busy?'Creating…':'Create wedding'}</button><button type="button" className="quiet-button" disabled={busy} onClick={()=>setCreating(false)}>Cancel</button>{progress&&<p role="status">{progress}</p>}{error&&<p className="field-error" role="alert">{error}</p>}</form></CreateWeddingDialog>}
  <div className="access-actions directory-footer-actions"><button className="button secondary" disabled={busy} onClick={()=>setRetry(value=>value+1)}>Refresh access</button><button className="quiet-button" disabled={busy} onClick={()=>void logout().catch(cause=>setError(cloudError(cause)))}>Sign out</button></div><details className="directory-account-details"><summary>Account details</summary><small>Account ID: {user.uid}</small></details>
 {signOutReview&&<Confirm title="Clear this account’s offline copies?" text="Signing out removes all this account’s cached weddings and offline workspaces, including unsynced changes. Cancel to reopen a wedding and export or sync work first." action="Clear copies and sign out" onCancel={()=>setSignOutReview(false)} onConfirm={()=>void finishLogout().catch(cause=>setError(cloudError(cause)))}/>}
 </DirectoryPage>;
}
export function DirectoryPage({title,children}:{title:string;children?:ReactNode}){return <main className="access-page"><section className={title==='Your weddings'?'access-card wedding-directory-card':'access-card'}><div className="access-brand wedding-access-brand"><AppLogo variant="full"/><span>WeddingStay</span></div><h1>{title}</h1>{children}</section></main>;}

function CreateWeddingDialog({busy,onClose,children}:{busy:boolean;onClose:()=>void;children:ReactNode}){const close=()=>{if(!busy)onClose();};const ref=useDialog(close);return <div className="confirm-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}><div ref={ref} role="dialog" aria-modal="true" aria-labelledby="create-wedding-title" tabIndex={-1} className="create-wedding-dialog"><div className="settings-section-heading"><div><p className="eyebrow">A NEW CELEBRATION</p><h2 id="create-wedding-title">Create wedding</h2></div><button className="icon-button" disabled={busy} aria-label="Close create wedding" onClick={close}><X size={20}/></button></div>{children}</div></div>;}
