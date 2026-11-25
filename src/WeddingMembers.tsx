import {useEffect,useRef,useState} from 'react';
import {collection,doc,getDocFromServer,getDocsFromServer,query,orderBy,limit,startAfter,type QueryDocumentSnapshot,type DocumentData} from 'firebase/firestore';
import {UserPlus,Users} from 'lucide-react';
import {database,cloudError} from './firebase';
import {type WeddingScope,weddingRef} from './weddingScope';
import {verifyWeddingAccess,setWeddingMember,repairWeddingMembers} from './weddingAccess';
import {Confirm} from './dialogs'; import {useTasks} from './TaskProvider';

type Person={uid:string;displayName:string;email:string};
export function WeddingMembers({scope,weddingName,onBusyChange}:{scope:WeddingScope;weddingName:string;onBusyChange:(busy:boolean)=>void}){
 const taskAccess=useTasks(); const [people,setPeople]=useState<Person[]>([]),[assigned,setAssigned]=useState<Person[]>([]),[owners,setOwners]=useState<string[]>([]),[adding,setAdding]=useState(false),[q,setQ]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[more,setMore]=useState(true),[change,setChange]=useState<{person:Person;active:boolean}|null>(null),[repair,setRepair]=useState(false);
 const cursor=useRef<QueryDocumentSnapshot<DocumentData>|null>(null),running=useRef(false),alive=useRef(true);
 function activity(value:boolean){running.current=value;setBusy(value);onBusyChange(value);}
 async function loadMembers(){
  if(await verifyWeddingAccess(scope)!=='owner')throw new Error('Only app owners can manage members.');
  const [membership,globalOwners]=await Promise.all([getDocsFromServer(collection(weddingRef(scope),'members')),getDocsFromServer(collection(database!,'appOwners'))]);
  const ownerIds=globalOwners.docs.filter(row=>row.data().active===true).map(row=>row.id),ids=new Set([...membership.docs.filter(row=>row.data().active===true).map(row=>row.id),...ownerIds]);
  const profiles=await Promise.all([...ids].map(async uid=>{const profile=await getDocFromServer(doc(database!,'users',uid));return {uid,displayName:profile.data()?.displayName||uid,email:profile.data()?.email||''};}));
  if(alive.current){setOwners(ownerIds);setAssigned(profiles.sort((a,b)=>a.displayName.localeCompare(b.displayName)));}
 }
 async function loadPeople(){
  if(running.current)return;activity(true);setError('');
  try{if(await verifyWeddingAccess(scope)!=='owner')throw new Error('Only app owners can manage members.');const source=collection(database!,'users'),page=await getDocsFromServer(cursor.current?query(source,orderBy('email'),startAfter(cursor.current),limit(25)):query(source,orderBy('email'),limit(25)));if(!alive.current)return;cursor.current=page.docs.at(-1)||cursor.current;setMore(page.size===25);setPeople(previous=>[...previous,...page.docs.map(row=>({uid:row.id,displayName:row.data().displayName||row.id,email:row.data().email||''}))]);}
  catch(cause){if(alive.current)setError(cloudError(cause));}finally{if(alive.current)activity(false);}
 }
 useEffect(()=>{alive.current=true;activity(true);void loadMembers().catch(cause=>{if(alive.current)setError(cloudError(cause));}).finally(()=>{if(alive.current){activity(false);setLoading(false);}});return()=>{alive.current=false;onBusyChange(false);};},[]);
 async function apply(){if(!change||running.current)return;activity(true);setError('');try{await setWeddingMember(scope,change.person.uid,weddingName,change.active);await loadMembers();if(alive.current){setMessage(change.active?'Member added.':'Access removed.');setChange(null);taskAccess.refresh();}}catch(cause){if(alive.current)setError(cloudError(cause));}finally{if(alive.current)activity(false);}}
 const text=q.trim().toLowerCase(),candidates=people.filter(person=>!assigned.some(member=>member.uid===person.uid)&&[person.displayName,person.email,person.uid].some(value=>value.toLowerCase().includes(text)));
 return <section className="settings-panel" aria-busy={busy}><div className="settings-section-heading"><div><h2><Users size={20}/>Members</h2><p>Members can view and edit this wedding. App owners manage access.</p></div><button className="button primary" disabled={busy||loading||!!error} onClick={()=>{setAdding(!adding);if(!people.length&&!adding)void loadPeople();}}><UserPlus size={16}/>{adding?'Close user list':'Add members'}</button></div>
 {loading&&<p role="status">Loading members…</p>}
 <div className="wedding-members-list">{assigned.map(person=><div key={person.uid} className="wedding-member-row"><div><strong>{person.displayName}</strong>{person.email&&<small>{person.email}</small>}<span className="member-access-label">{owners.includes(person.uid)?'App owner · All weddings':'Member · This wedding'}</span></div>{!owners.includes(person.uid)&&<button className="button secondary" disabled={busy} onClick={()=>setChange({person,active:false})}>Remove access</button>}</div>)}</div>
 {!loading&&!assigned.length&&!error&&<p>No members yet. Add someone who has signed in to WeddingStay.</p>}
 {adding&&<section className="add-members-panel"><h3>Add members</h3><p>Choose people who have signed in to WeddingStay at least once.</p><label>Search loaded users<input value={q} onChange={event=>setQ(event.target.value)} placeholder="Name or email"/></label><div className="wedding-members-list">{candidates.map(person=><div className="wedding-member-row" key={person.uid}><div><strong>{person.displayName}</strong><small>{person.email}</small></div><button className="button secondary" disabled={busy} onClick={()=>setChange({person,active:true})}>Add member</button></div>)}</div>{!busy&&!candidates.length&&<p>No unassigned users match the loaded results.</p>}{more&&<button className="button secondary" disabled={busy} onClick={()=>void loadPeople()}>{busy?'Loading…':'Load more users'}</button>}</section>}
 <details className="settings-advanced"><summary>Advanced</summary><h3>Repair existing memberships</h3><p>Restore wedding discovery for existing members. Their current access is preserved.</p><button className="button secondary" disabled={busy} onClick={()=>setRepair(true)}>Repair memberships</button></details>
 {message&&<p className="data-notice" role="status">{message}</p>}{error&&<div role="alert"><p className="field-error">{error}</p><button className="button secondary" disabled={busy} onClick={()=>{setError('');activity(true);void loadMembers().catch(cause=>setError(cloudError(cause))).finally(()=>activity(false));}}>Retry</button></div>}
 {change&&<Confirm title={change.active?'Add member?':'Remove access?'} text={change.person.displayName+(change.active?' will be able to view and edit ':' will lose access to ')+weddingName+'.'} action={busy?'Saving…':change.active?'Add member':'Remove access'} onCancel={()=>{if(!busy)setChange(null);}} onConfirm={()=>void apply()}/>}
 {repair&&<Confirm title="Repair existing memberships?" text="Restore discovery entries and convert legacy wedding-owner roles to Member. Existing wedding data and global owners stay unchanged." action={busy?'Repairing…':'Repair memberships'} onCancel={()=>{if(!busy)setRepair(false);}} onConfirm={async()=>{if(running.current)return;activity(true);setError('');try{const count=await repairWeddingMembers(scope,weddingName);await loadMembers();if(alive.current){setMessage('Repaired '+count+' memberships.');setRepair(false);}}catch(cause){if(alive.current)setError(cloudError(cause));}finally{if(alive.current)activity(false);}}}/>}
 </section>;
}
